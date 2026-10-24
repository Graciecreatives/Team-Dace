import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { ref, computed, watch, reactive, effectScope } from 'vue'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'

const source = readFileSync(new URL('../components/FarmAnimalScan.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const compiled = compileScript(descriptor, { id: 'animal-scan-ui' })
const flush = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const config = { configured: true, provider: 'Roboflow', experimental: true, animal: 'cattle', model: 'cattle-disease-detection/1' }
const response = () => ({ ...config, status: 'regions', regions: [{ label: 'Model-highlighted area', score: .71, box: { left: .1, top: .2, width: .3, height: .4 } }], notice: 'Limited coverage.' })
function setup(fetcher = () => Promise.resolve(config), options = {}) {
  let mount, unmount
  const scope = effectScope(), props = reactive({ user: { id: 'one' } }), revoked = [], canvases = [], images = [], events = []
  class Image {
    naturalWidth = options.width ?? 2400
    naturalHeight = options.height ?? 1200
    constructor() { images.push(this) }
    set src(value) { if (value && !options.delayedDecode) queueMicrotask(() => this.onload?.()) }
  }
  const context = vm.createContext({ ref, computed, watch, AbortController, Image,
    URL: { createObjectURL: () => 'blob:local', revokeObjectURL: url => revoked.push(url) },
    document: { createElement() { const canvas = { width: 0, height: 0, getContext: () => options.noContext ? null : ({ fillRect() {}, drawImage() { canvas.drawn = [canvas.width, canvas.height] } }), toDataURL: () => options.prepared ?? 'data:image/jpeg;base64,YWJj' }; canvases.push(canvas); return canvas } },
    onMounted: callback => { mount = callback }, onBeforeUnmount: callback => { unmount = callback }, $fetch: fetcher })
  vm.runInContext(compiled.content.replace(/^import .*$/gm, '').replace('export default', 'globalThis.component ='), context)
  const state = scope.run(() => context.component.setup(props, { expose() {}, emit: (...args) => events.push(args) }))
  scope.run(() => mount())
  return { state, props, revoked, canvases, images, events, stop() { unmount(); scope.stop() } }
}
const pick = app => app.state.choosePhoto({ target: { files: [{ type: 'image/png', size: 1000 }] } })

test('real SFC script, template and CSS compile with simple accessible cattle-only flow', () => {
  assert.deepEqual(parse(source).errors, [])
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'FarmAnimalScan.vue', id: 'animal-scan-ui', compilerOptions: { bindingMetadata: compiled.bindings } }).errors, [])
  assert.deepEqual(compileStyle({ source: descriptor.styles[0].content, filename: 'FarmAnimalScan.vue', id: 'animal-scan-ui', scoped: true }).errors, [])
  for (const pattern of [/Check a cow photo/, /Experimental/, /Scan with Roboflow/, /No regions does not mean healthy\./, /not a probability/, /51 images, CC BY 4.0/, /Not clinically validated/, /capture="environment"/, /aria-live="polite"/, /focus-visible/, /min-height:44px/, /image-frame\{position:relative/, /img\{display:block;width:100%;height:auto/, /@media\(max-width:700px\)/]) assert.match(source, pattern)
  assert.doesNotMatch(source, /type="checkbox"|localStorage|\/api\/assistant|<img[^>]+https:|object-fit:cover/)
})

test('local preparation strips original encoding, resizes, revokes URL and never auto posts', async () => {
  const calls = [], app = setup((path, options) => { calls.push({ path, options }); return Promise.resolve(config) })
  await flush(); await pick(app)
  assert.equal(calls.length, 1); assert.equal(calls[0].path, '/api/animal-scan')
  assert.equal(app.state.photo.value, 'data:image/jpeg;base64,YWJj')
  assert.deepEqual(app.canvases[0].drawn, [1280, 640]); assert.equal(app.canvases[0].width, 0)
  assert.deepEqual(app.revoked, ['blob:local']); assert.equal(app.state.canSend.value, true)
  assert.equal(app.events.length, 0); app.stop()
})

test('file, decoded pixel, canvas and prepared size boundaries reject without POST', async () => {
  const app = setup(); await flush()
  for (const file of [{ type: 'image/heic', size: 10 }, { type: 'image/png', size: 0 }, { type: 'image/jpeg', size: 3145729 }]) {
    await app.state.choosePhoto({ target: { files: [file] } }); assert.ok(app.state.error.value); assert.equal(app.state.photo.value, '')
  }
  assert.equal(app.images.length, 0); app.stop()
  for (const options of [{ width: 10000, height: 4001 }, { width: 0 }, { noContext: true }, { prepared: 'data:image/jpeg;base64,' + 'A'.repeat(4194308) }, { prepared: 'data:,' }]) {
    const app = setup(undefined, options); await flush(); await pick(app)
    assert.equal(app.state.photo.value, ''); assert.ok(app.state.error.value); assert.deepEqual(app.revoked, ['blob:local']); app.stop()
  }
})

test('missing or mismatched configuration keeps scan disabled', async () => {
  for (const payload of [{ ...config, configured: false }, { configured: true }, { ...config, animal: 'dog' }]) {
    const calls = [], app = setup((path, options) => { calls.push(options); return Promise.resolve(payload) })
    await flush(); await pick(app); await app.state.scan()
    assert.equal(app.state.canSend.value, false); assert.ok(calls.every(item => !item.method)); app.stop()
  }
})

test('explicit scan sends exact body once, retry retains photo and AI needs separate click', async () => {
  const request = deferred(), calls = []
  let next = request.promise
  const app = setup((path, options) => { calls.push(options); return options.method ? next : Promise.resolve(config) })
  await flush(); await pick(app)
  const scanning = app.state.scan(); await app.state.scan()
  assert.equal(calls.length, 2)
  assert.equal(JSON.stringify(calls[1].body), JSON.stringify({ image: app.state.photo.value, animal: 'cattle' }))
  assert.equal(calls[1].retry, 0); request.reject(new Error('unavailable')); await scanning
  assert.ok(app.state.photo.value); assert.ok(app.state.error.value); assert.equal(app.state.sending.value, false)
  next = Promise.resolve(response()); await app.state.scan(); await flush()
  assert.equal(app.events.length, 0); app.state.askAI(); assert.equal(app.events[0][0], 'ask-ai')
  assert.doesNotMatch(app.events[0][1], /data:image|base64/)
  await pick(app); assert.equal(app.state.result.value, null); app.state.askAI(); assert.equal(app.events.length, 1); app.stop()
})

test('malformed regions fail closed, valid boxes use image-relative percentages', async () => {
  const app = setup(); await flush()
  assert.equal(app.state.validResponse(response()), true)
  assert.equal(JSON.stringify(app.state.boxStyle(response().regions[0].box)), JSON.stringify({ left: '10%', top: '20%', width: '30%', height: '40%' }))
  for (const box of [{ left: -.1, top: 0, width: .2, height: .2 }, { left: .9, top: 0, width: .2, height: .2 }, { left: 0, top: 0, width: 0, height: .2 }, { left: 0, top: NaN, width: .2, height: .2 }, { left: '0', top: 0, width: .2, height: .2 }]) {
    const data = response(); data.regions[0].box = box; assert.equal(app.state.validResponse(data), false)
  }
  for (const patch of [{ score: 1.1 }, { score: '0.8' }, { label: 'Healthy cow' }]) {
    const data = response(); Object.assign(data.regions[0], patch); assert.equal(app.state.validResponse(data), false)
  }
  assert.equal(app.state.validResponse({ ...response(), status: 'no-regions' }), false)
  assert.equal(app.state.validResponse({ ...response(), status: 'no-regions', regions: [] }), true)
  app.stop()
})

test('actual malformed provider result never displays regions and no-regions never emits AI', async () => {
  let payload = { ...response(), animal: 'dog' }
  const app = setup((path, options) => Promise.resolve(options.method ? payload : config))
  await flush(); await pick(app); await app.state.scan()
  assert.equal(app.state.result.value, null); assert.ok(app.state.error.value)
  payload = { ...response(), status: 'no-regions', regions: [] }; await app.state.scan(); app.state.askAI()
  assert.equal(app.state.result.value.status, 'no-regions'); assert.equal(app.events.length, 0); app.stop()
})

test('account switch, remove and unmount abort and ignore late provider responses', async () => {
  for (const action of ['switch', 'remove', 'unmount']) {
    const request = deferred(), calls = [], app = setup((path, options) => { calls.push(options); return options.method ? request.promise : Promise.resolve(config) })
    await flush(); await pick(app); const scanning = app.state.scan()
    if (action === 'switch') app.props.user = { id: 'two' }
    else if (action === 'remove') app.state.resetPhoto()
    else app.stop()
    assert.equal(calls[1].signal.aborted, true); request.resolve(response()); await scanning; await flush()
    assert.equal(app.state.photo.value, ''); assert.equal(app.state.result.value, null)
    if (action !== 'unmount') app.stop()
  }
})

test('portrait and exact pixel ceiling preserve aspect, results focus and replacement cancels old scan', async () => {
  const request = deferred(), calls = [], app = setup((path, options) => { calls.push(options); return options.method ? request.promise : Promise.resolve(config) }, { width: 5000, height: 8000 })
  await flush(); await pick(app)
  assert.deepEqual(app.canvases[0].drawn, [800, 1280])
  const scanning = app.state.scan(); await pick(app)
  assert.equal(calls[1].signal.aborted, true)
  request.resolve(response()); await scanning
  assert.equal(app.state.result.value, null); assert.ok(app.state.photo.value)
  let focused = 0
  app.state.resultHeading.value = { focus() { focused++ } }
  await app.state.scan(); await flush()
  assert.equal(focused, 1); app.stop()
})

test('late image events and configuration cannot restore cleared state', async () => {
  const app = setup(undefined, { delayedDecode: true }); await flush()
  const preparing = pick(app), lateLoad = app.images[0].onload
  app.state.resetPhoto(); lateLoad(); await preparing
  assert.equal(app.state.photo.value, ''); assert.equal(app.state.error.value, ''); assert.deepEqual(app.revoked, ['blob:local']); app.stop()
  const request = deferred(), checking = setup(() => request.promise)
  checking.stop(); request.resolve(config); await flush(); assert.equal(checking.state.configured.value, false)
})
