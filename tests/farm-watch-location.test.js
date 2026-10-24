import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as Vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'
import { weatherAdvice } from '../app/utils/farm-watch.js'

const { descriptor } = parse(await readFile('app/components/FarmWatch.vue', 'utf8'))
const compiled = compileScript(descriptor, { id: 'location-test', inlineTemplate: true, genDefaultAs: 'Component' }).content
const aliases = {}
const code = compiled.replace(/import \{([^}]+)\} from ["']vue["'];?/g, (_, names) => {
  for (const name of names.split(',')) { const [original, alias] = name.trim().split(/\s+as\s+/); aliases[alias || original] = Vue[original] }
  return ''
}).replace(/^import .*$/gm, '')
const icon = { render: () => null }
let mapChoices = 0
const FarmSatelliteMap = { props: ['point'], setup(_, { expose }) { expose({ chooseOnMap() { mapChoices++ } }); return () => Vue.h('map-stub') } }
const names = { ...aliases, weatherAdvice, FarmSatelliteMap, ...Object.fromEntries(['CloudSun', 'CloudRain', 'Sun', 'Snowflake', 'Droplets', 'RefreshCw', 'Check', 'X', 'MapPin', 'Bell', 'Sprout', 'ShieldCheck'].map(name => [name, icon])) }
const Component = new Function(...Object.keys(names), `${code}\nreturn Component`)(...Object.values(names))
const node = (type, text = '') => ({ type, tagName: type.toUpperCase(), text, children: [], props: {}, parent: null, getRootNode() { return globalThis.document }, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn }, removeEventListener(name) { delete this.listeners[name] } })
const renderer = Vue.createRenderer({
  createElement: type => node(type), createText: text => node('text', text), createComment: text => node('comment', text),
  setText(n, text) { n.text = text }, setElementText(n, text) { n.text = text; n.children = [] },
  parentNode: n => n.parent, nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1],
  insert(n, parent, anchor) { if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1); n.parent = parent; const index = parent.children.indexOf(anchor); parent.children.splice(index < 0 ? parent.children.length : index, 0, n) },
  remove(n) { if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1) },
  patchProp(n, key, _, value) { n.props[key] = value }
})
function all(n) { return [n, ...n.children.flatMap(all)] }
function text(n) { return n.text + n.children.map(text).join('') }
function mount(t, { secure = true, missing = false, throws = false } = {}) {
  const calls = [], requests = []
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { geolocation: missing ? undefined : { getCurrentPosition(...args) { if (throws) throw new Error('blocked'); calls.push(args) } } } })
  globalThis.window = { isSecureContext: secure }
  globalThis.Document = class Document {}
  globalThis.ShadowRoot = class ShadowRoot {}
  globalThis.document = { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' }
  globalThis.localStorage = { getItem: () => null }
  globalThis.$fetch = async (url, options) => { requests.push({ url, ...options }); return url.includes('weather') ? { days: [] } : { items: [], sources: [] } }
  const user = Vue.ref({ id: 'first' })
  const root = node('root')
  const app = renderer.createApp({ setup: () => () => Vue.h(Component, { user: user.value }) })
  app.mount(root)
  t.after(() => app.unmount())
  const button = label => all(root).find(n => n.type === 'button' && text(n).includes(label))
  const click = async label => { button(label).props.onClick(); await Vue.nextTick() }
  return { root, calls, requests, user, button, click }
}
test('mounted location is opt-in and successful coordinates alone request real data', async t => {
  const f = mount(t)
  assert.equal(f.calls.length, 0); assert.equal(f.requests.length, 0)
  await f.click('Use my location')
  assert.equal(f.calls[0][2].timeout, 10000)
  assert.equal(f.button('Finding your area').props.disabled, true)
  f.calls[0][0]({ coords: { latitude: 6.5244, longitude: 3.3792 } })
  await Vue.nextTick()
  assert.equal(f.requests.length, 2)
  assert.deepEqual(f.requests[0].body, { latitude: 6.5, longitude: 3.4 })
  assert.match(text(f.root), /6.5°, 3.4°/)
})
for (const [code, message] of [[1, /permission was denied/], [2, /could not determine/], [3, /timed out/]]) {
  test(`mounted geolocation error ${code} explains recovery and leaves map available`, async t => {
    const f = mount(t)
    await f.click('Use my location'); f.calls[0][1]({ code }); await Vue.nextTick()
    assert.match(text(f.root), message); assert.equal(f.requests.length, 0)
    assert.equal(f.button('Use my location').props.disabled, false)
    const previous = mapChoices
    await f.click('Choose on map')
    assert.equal(mapChoices, previous + 1)
    assert.equal(all(f.root).some(n => n.props.role === 'alert'), false)
    await f.click('Enter coordinates instead')
    assert.equal(all(f.root).filter(n => n.type === 'input' && n.props.type === 'number').length, 2)
  })
}
for (const [options, message] of [[{ secure: false }, /secure connection/], [{ missing: true }, /location is unavailable/], [{ throws: true }, /could not determine/]]) {
  test(`mounted unavailable geolocation recovers: ${JSON.stringify(options)}`, async t => {
    const f = mount(t, options); await f.click('Use my location')
    assert.match(text(f.root), message); assert.equal(f.requests.length, 0)
    assert.equal(f.button('Use my location').props.disabled, false)
  })
}
test('mounted stalled permission prompt times out and ignores late callbacks', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = mount(t)
  await f.click('Use my location')
  t.mock.timers.tick(15000)
  await Vue.nextTick()
  assert.match(text(f.root), /timed out/)
  assert.equal(f.button('Use my location').props.disabled, false)
  f.calls[0][0]({ coords: { latitude: 40, longitude: 20 } })
  f.calls[0][1]({ code: 1 })
  await Vue.nextTick()
  assert.equal(f.requests.length, 0)
  assert.match(text(f.root), /timed out/)
})
test('mounted manual coordinates work without geolocation or map tiles', async t => {
  const f = mount(t, { missing: true })
  await f.click('Enter coordinates instead')
  const inputs = all(f.root).filter(n => n.type === 'input' && n.props.type === 'number')
  for (const [index, value] of ['-1.286', '36.817'].entries()) {
    inputs[index].value = value
    inputs[index].listeners.input({ target: inputs[index] })
  }
  await Vue.nextTick()
  all(f.root).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
  await Vue.nextTick()
  assert.equal(f.calls.length, 0)
  assert.deepEqual(f.requests[0].body, { latitude: -1.3, longitude: 36.8 })
})
test('mounted account changes discard stale location successes and failures', async t => {
  const f = mount(t); await f.click('Use my location')
  f.user.value = { id: 'second' }; await Vue.nextTick()
  f.calls[0][0]({ coords: { latitude: 40, longitude: 20 } }); f.calls[0][1]({ code: 1 }); await Vue.nextTick()
  assert.equal(f.requests.length, 0); assert.match(text(f.root), /No area selected/)
  assert.equal(all(f.root).some(n => n.props.role === 'alert'), false)
  await f.click('Use my location'); await f.click('Choose on map')
  f.calls[1][0]({ coords: { latitude: 40, longitude: 20 } }); await Vue.nextTick()
  assert.equal(f.requests.length, 0)
})
