import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { ref, computed, watch, reactive, effectScope } from 'vue'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import { weatherAdvice } from '../utils/farm-watch.js'

const source = readFileSync(new URL('../components/FarmWatch.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const compiled = compileScript(descriptor, { id: 'watch-redesign' })
const flush = async () => { await new Promise(resolve => setImmediate(resolve)) }
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function setup(fetcher = () => { throw new Error('Unexpected network') }, geolocation = { getCurrentPosition() { throw new Error('Unexpected permission') } }) {
  let mount, unmount
  const scope = effectScope(), props = reactive({ user: { id: 'one', mainEnterprises: ['Maize'], farmType: 'crops' } })
  const icons = Object.fromEntries(['CloudSun', 'CloudRain', 'Sun', 'Snowflake', 'Droplets', 'RefreshCw', 'Check', 'X', 'MapPin', 'Bell', 'Sprout', 'ShieldCheck'].map(name => [name, name]))
  const store = new Map()
  const context = vm.createContext({ ref, computed, watch, weatherAdvice, ...icons, AbortController, URL,
    onMounted: callback => { mount = callback }, onBeforeUnmount: callback => { unmount = callback },
    navigator: { geolocation }, window: {}, document: { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' },
    localStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) },
    setInterval: () => 1, clearInterval() {}, $fetch: fetcher })
  vm.runInContext(compiled.content.replace(/^import .*$/gm, '').replace('export default', 'globalThis.component ='), context)
  const state = scope.run(() => context.component.setup(props, { expose() {}, emit() {} }))
  scope.run(() => mount())
  return { state, props, store, stop() { unmount(); scope.stop() } }
}
const forecast = { days: [{ date: '2026-10-24', max: 35, min: 22, rain: 20 }], latitude: 7.5, longitude: 4 }

test('weather fieldboard script, template and scoped styles compile', () => {
  assert.deepEqual(parse(source).errors, [])
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'FarmWatch.vue', id: 'watch-redesign', compilerOptions: { bindingMetadata: compiled.bindings } }).errors, [])
  assert.deepEqual(compileStyle({ source: descriptor.styles[0].content, filename: 'FarmWatch.vue', id: 'watch-redesign', scoped: true }).errors, [])
  assert.match(source, /weather-landscape.*aria-hidden="true"/)
  assert.match(source, /What this means for your farm/)
  assert.match(source, /No sample weather is shown/)
  assert.match(source, /v-else-if="weatherBusy"/)
  assert.match(source, /min-height:44px/)
  assert.match(source, /prefers-reduced-motion:reduce/)
  assert.match(source, /focus-visible/)
})

test('condition identity is derived from actual forecast values, never fabricated temperature or sunshine', () => {
  const app = setup()
  assert.equal(app.state.forecast.value, null)
  assert.equal(app.state.weatherIdentity({ max: 30, min: 20, rain: 5 }), 'Rain in forecast')
  assert.equal(app.state.weatherIcon({ max: 30, min: 20, rain: 5 }), 'CloudRain')
  assert.equal(app.state.weatherIdentity({ max: 10, min: 2, rain: 0 }), 'Cold conditions')
  assert.equal(app.state.weatherIdentity({ max: 35, min: 22, rain: 0 }), 'Hot conditions')
  assert.equal(app.state.weatherIdentity({ max: 30, min: 20, rain: 0 }), 'No heat or rain threshold flagged')
  assert.equal(app.state.weatherIdentity({ max: null, min: null, rain: null }), 'Forecast coverage incomplete')
  app.stop()
})

test('mount does not request location or forecast and permission rounds private location before independent requests', async () => {
  let success
  const calls = []
  const app = setup((path, options) => { calls.push({ path, options }); return Promise.resolve(path === '/api/weather' ? forecast : { items: [], sources: [] }) }, { getCurrentPosition(callback) { success = callback } })
  assert.equal(calls.length, 0)
  app.state.locate()
  assert.equal(calls.length, 0)
  success({ coords: { latitude: 7.456, longitude: 3.987 } })
  await flush()
  assert.equal(calls.length, 2)
  assert.ok(calls.every(call => call.options.body.latitude === 7.5 && call.options.body.longitude === 4 && call.options.timeout === 25000))
  assert.ok(calls.every(call => call.options.signal instanceof AbortSignal))
  assert.equal(app.state.forecast.value.days[0].max, 35)
  assert.equal(app.state.health.value.items.length, 0)
  assert.equal(app.store.size, 0, 'private area is never persisted')
  app.stop()
})

test('independent service failure clears weather without inventing a healthy or safe result', async () => {
  const app = setup(path => path === '/api/weather' ? Promise.reject(new Error('offline')) : Promise.resolve({ items: [], sources: [] }))
  app.state.latitude.value = '7.4'; app.state.longitude.value = '3.9'
  app.state.submitManual()
  await flush()
  assert.equal(app.state.forecast.value, null)
  assert.match(app.state.weatherError.value, /Weather is unavailable/)
  assert.equal(app.state.health.value.items.length, 0)
  assert.equal(app.state.healthError.value, '')
  assert.equal(app.state.busy.value, false)
  app.stop()
})

test('account switch aborts inflight service calls and ignores late responses', async () => {
  const pending = [], calls = []
  const app = setup((path, options) => { const request = deferred(); pending.push(request); calls.push(options); return request.promise })
  app.state.usePoint(7.45, 3.98)
  app.props.user = { id: 'two', mainEnterprises: [] }
  assert.ok(calls.every(call => call.signal.aborted))
  pending[0].resolve(forecast); pending[1].resolve({ items: [{ id: 'old', title: 'Old secret' }], sources: [] })
  await flush()
  assert.equal(app.state.forecast.value, null)
  assert.equal(app.state.health.value, null)
  assert.equal(app.state.location.value, null)
  assert.equal(app.state.busy.value, false)
  app.stop()
})

test('late geolocation after account switch or unmount cannot set area or fetch', () => {
  const callbacks = [], calls = []
  const app = setup((...args) => calls.push(args), { getCurrentPosition(success) { callbacks.push(success) } })
  app.state.locate()
  app.props.user = { id: 'two', mainEnterprises: [] }
  callbacks[0]({ coords: { latitude: 30, longitude: 40 } })
  assert.equal(app.state.location.value, null)
  app.state.locate(); app.stop()
  callbacks[1]({ coords: { latitude: 30, longitude: 40 } })
  assert.equal(calls.length, 0)
})

test('notification choices stay account scoped and source links reject unsafe protocols and credentials', () => {
  const app = setup()
  app.state.markRead('weather:one')
  assert.match([...app.store.keys()][0], /one$/)
  app.props.user = { id: 'two', mainEnterprises: [] }
  assert.equal(app.state.read.value.length, 0)
  assert.equal(app.state.safeUrl('javascript:alert(1)'), null)
  assert.equal(app.state.safeUrl('https://user:secret@example.com/'), null)
  assert.equal(app.state.safeUrl('https://example.com/report'), 'https://example.com/report')
  app.stop()
})
