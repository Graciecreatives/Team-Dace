import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { ref, computed, watch, reactive, effectScope } from 'vue'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'

const source = readFileSync(new URL('../components/FarmScan.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const compiled = compileScript(descriptor, { id: 'plant-scan-ui' })
const flush = async () => { await new Promise(resolve => setImmediate(resolve)) }
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const response = (task = 'disease') => ({ provider: 'Pl@ntNet', task, status: 'suggestions', candidates: [{ name: 'Example', score: .42 }], notice: 'Limited coverage.' })
function setup(fetcher = () => Promise.resolve({ configured: true }), encodedPhoto = 'data:image/jpeg;base64,YWJj', imageDimensions = [2400, 1200]) {
  let mount, unmount
  const scope = effectScope(), props = reactive({ user: { id: 'one' } }), revoked = [], canvases = [], images = []
  class Image {
    naturalWidth = imageDimensions[0]
    naturalHeight = imageDimensions[1]
    constructor() { images.push(this) }
    set src(value) { if (value) queueMicrotask(() => this.onload?.()) }
  }
  const context = vm.createContext({ ref, computed, watch, AbortController, Image,
    URL: { createObjectURL: () => 'blob:local', revokeObjectURL: url => revoked.push(url) },
    document: { createElement() { const canvas = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() { canvas.drawn = [canvas.width, canvas.height] } }), toDataURL: () => encodedPhoto }; canvases.push(canvas); return canvas } },
    onMounted: callback => { mount = callback }, onBeforeUnmount: callback => { unmount = callback }, $fetch: fetcher })
  vm.runInContext(compiled.content.replace(/^import .*$/gm, '').replace('export default', 'globalThis.component ='), context)
  const state = scope.run(() => context.component.setup(props, { expose() {} }))
  scope.run(() => mount())
  return { state, props, revoked, canvases, images, stop() { unmount(); scope.stop() } }
}
const pick = app => app.state.choosePhoto({ target: { files: [{ type: 'image/png', size: 1000 }] } })

test('script, inline template and styles compile with accessibility and honest evidence copy', () => {
  assert.deepEqual(parse(source).errors, [])
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'FarmScan.vue', id: 'plant-scan-ui', compilerOptions: { bindingMetadata: compiled.bindings } }).errors, [])
  assert.deepEqual(compileStyle({ source: descriptor.styles[0].content, filename: 'FarmScan.vue', id: 'plant-scan-ui', scoped: true }).errors, [])
  for (const pattern of [/aria-live="polite"/, /focus-visible/, /min-height:44px/, /prefers-reduced-motion:reduce/, /capture="environment"/, /Similarity\/model score, not chance of disease/, /Animal photos are not supported/, /Evidence basis:/]) assert.match(source, pattern)
  assert.doesNotMatch(source, /<dialog|localStorage|defineEmits|\/api\/assistant/)
  assert.doesNotMatch(source, /type="checkbox"|consent = ref/)
  assert.match(source, /Scan with Pl@ntNet/)
  assert.match(source, /<details class="scan-details"><summary>Details<\/summary>/)
  assert.match(source, /type="file" multiple/)
})

test('photo is decoded, resized and re-encoded locally with no auto upload before explicit Scan action', async () => {
  const calls = [], app = setup((path, options) => { calls.push({ path, options }); return Promise.resolve({ configured: true }) })
  await flush()
  await pick(app)
  assert.equal(calls.length, 1)
  assert.equal(app.state.photo.value, 'data:image/jpeg;base64,YWJj')
  assert.equal(app.state.canSend.value, true)
  assert.deepEqual(app.canvases[0].drawn, [1280, 640])
  assert.equal(app.canvases[0].width, 0)
  assert.deepEqual(app.revoked, ['blob:local'])
  app.stop()
})

test('unsupported or oversized files never decode or transfer', async () => {
  const app = setup(); await flush()
  for (const file of [{ type: 'image/heic', size: 100 }, { type: 'image/jpeg', size: 3 * 1024 * 1024 + 1 }]) {
    await app.state.choosePhoto({ target: { files: [file] } })
    assert.ok(app.state.error.value)
    assert.equal(app.state.photo.value, '')
  }
  assert.equal(app.images.length, 0); app.stop()
})

test('explicit Scan authorization and configuration gate exact POST, duplicate send is blocked, failure preserves photos', async () => {
  const request = deferred(), calls = []
  const app = setup((path, options) => { calls.push(options); return options.method === 'POST' ? request.promise : Promise.resolve({ configured: true }) })
  await flush(); await pick(app)
  assert.equal(calls.length, 1)
  const scan = app.state.scan(); await app.state.scan()
  assert.equal(calls.length, 2)
  assert.equal(JSON.stringify(calls[1].body), JSON.stringify({ task: 'disease', images: [app.state.photo.value], organs: ['auto'], consent: true }))
  assert.equal(calls[1].retry, 0)
  request.reject(new Error('Provider unavailable')); await scan
  assert.match(app.state.error.value, /Provider unavailable/)
  assert.ok(app.state.photo.value); assert.equal(app.state.sending.value, false); app.stop()
})

test('account switch aborts and ignores old results, clears photos', async () => {
  const request = deferred(), calls = []
  const app = setup((path, options) => { calls.push(options); return options.method === 'POST' ? request.promise : Promise.resolve({ configured: true }) })
  await flush(); await pick(app)
  const scan = app.state.scan(); app.props.user = { id: 'two' }
  assert.equal(calls[1].signal.aborted, true)
  request.resolve(response()); await scan; await flush()
  assert.equal(app.state.result.value, null); assert.equal(app.state.photo.value, '')
  app.stop()
})

test('mode change and removal invalidate requests, unmount prevents late updates', async () => {
  const requests = [], app = setup((path, options) => { if (!options.method) return Promise.resolve({ configured: true }); const request = deferred(); requests.push({ ...request, signal: options.signal }); return request.promise })
  await flush(); await pick(app)
  const first = app.state.scan(); app.state.selectTask('identify')
  assert.equal(requests[0].signal.aborted, true)
  requests[0].resolve(response()); await first
  assert.equal(app.state.result.value, null)
  const second = app.state.scan(); app.state.resetPhoto()
  requests[1].resolve(response('identify')); await second
  assert.equal(app.state.result.value, null)
  await pick(app)
  const third = app.state.scan(); app.stop()
  assert.equal(requests[2].signal.aborted, true)
  requests[2].resolve(response('identify')); await third
  assert.equal(app.state.photo.value, ''); assert.equal(app.state.result.value, null)
})

test('provider results show at most three candidates and focus results, malformed scores fail honestly', async () => {
  let payload = response(), focused = 0
  const app = setup((path, options) => Promise.resolve(options.method ? payload : { configured: true }))
  await flush(); await pick(app); app.state.resultHeading.value = { focus() { focused++ } }
  payload.candidates = Array.from({ length: 5 }, (_, index) => ({ name: `Plant ${index}`, score: .4 }))
  await app.state.scan(); await flush()
  assert.equal(app.state.candidates.value.length, 3); assert.equal(focused, 1)
  payload = { ...response(), candidates: [{ name: 'Invalid', score: 'high' }] }
  await app.state.scan()
  assert.equal(app.state.result.value, null); assert.match(app.state.error.value, /Unexpected/)
  app.stop()
})

test('missing configuration never enables upload', async () => {
  const calls = [], app = setup((path, options) => { calls.push(options); return Promise.resolve({ configured: false }) })
  await flush(); await pick(app); await app.state.scan()
  assert.equal(app.state.canSend.value, false); assert.ok(calls.every(call => !call.method)); app.stop()
})

test('removing during browser decode cancels preparation and revokes temporary URL', async () => {
  const app = setup(); await flush()
  const preparing = pick(app)
  app.state.resetPhoto()
  await preparing
  assert.equal(app.state.photo.value, '')
  assert.equal(app.state.preparing.value, false)
  assert.equal(app.state.error.value, '')
  assert.deepEqual(app.revoked, ['blob:local'])
  assert.equal(app.canvases.length, 0)
  app.stop()
})

test('no-match remains an explicit provider outcome rather than a healthy diagnosis', async () => {
  const app = setup((path, options) => Promise.resolve(options.method ? { ...response(), candidates: [], status: 'no-match' } : { configured: true }))
  await flush(); await pick(app)
  await app.state.scan()
  assert.equal(app.state.result.value.status, 'no-match')
  assert.equal(app.state.candidates.value.length, 0)
  assert.match(source, /No match does not mean your plant is healthy/)
  app.stop()
})

test('multiple same-plant photos have independent organs, replace and remove actions', async () => {
  const app = setup(); await flush()
  const file = { type: 'image/jpeg', size: 1000 }
  await app.state.choosePhoto({ target: { files: [file, file] } })
  assert.equal(app.state.photos.value.length, 2)
  app.state.setOrgan(0, 'leaf'); app.state.setOrgan(1, 'flower')
  assert.equal(app.state.photos.value[0].organ, 'leaf')
  assert.equal(app.state.photos.value[1].organ, 'flower')
  app.state.setOrgan(0, 'unsupported')
  assert.equal(app.state.photos.value[0].organ, 'leaf')
  await app.state.choosePhoto({ target: { files: [file] } }, 0)
  assert.equal(app.state.photos.value.length, 2)
  assert.equal(app.state.photos.value[0].organ, 'auto')
  app.state.removePhoto(0)
  assert.equal(app.state.photos.value.length, 1)
  assert.equal(app.state.photos.value[0].organ, 'flower')
  assert.equal(app.revoked.length, 3)
  app.stop()
})

test('over-limit batch and failed replacement preserve existing photo without auto-upload', async () => {
  const calls = [], app = setup((path, options) => { calls.push(options); return Promise.resolve({ configured: true }) })
  await flush(); await pick(app)
  const original = app.state.photos.value[0]
  const file = { type: 'image/jpeg', size: 1000 }
  await app.state.choosePhoto({ target: { files: [file, file, file, file, file] } })
  assert.equal(app.state.photos.value.length, 1)
  assert.match(app.state.error.value, /up to 5/)
  await app.state.choosePhoto({ target: { files: [{ type: 'image/heic', size: 100 }] } }, 0)
  assert.equal(app.state.photos.value[0], original)
  assert.equal(calls.length, 1)
  app.stop()
})

test('changing an organ or removing a photo cancels a pending scan and drops late results', async () => {
  const requests = [], app = setup((path, options) => {
    if (!options.method) return Promise.resolve({ configured: true })
    const request = deferred(); requests.push({ ...request, signal: options.signal }); return request.promise
  })
  await flush(); await pick(app)
  const first = app.state.scan(); app.state.setOrgan(0, 'leaf')
  assert.equal(requests[0].signal.aborted, true)
  requests[0].resolve(response()); await first
  assert.equal(app.state.result.value, null)
  const second = app.state.scan(); app.state.removePhoto(0)
  assert.equal(requests[1].signal.aborted, true)
  requests[1].resolve(response()); await second
  assert.equal(app.state.result.value, null)
  assert.equal(app.state.canSend.value, false)
  app.stop()
})

test('combined prepared photos cannot exceed 3 MB and rejected additions preserve prior review', async () => {
  const data = 'data:image/jpeg;base64,' + 'YWJj'.repeat(600000)
  const app = setup(undefined, data); await flush(); await pick(app)
  assert.equal(app.state.photos.value.length, 1)
  await pick(app)
  assert.equal(app.state.photos.value.length, 1)
  assert.match(app.state.error.value, /together under 3 MB/)
  assert.equal(app.revoked.length, 2)
  app.stop()
})

test('scan sends every reviewed photo with its matching organ and authorization only on action', async () => {
  const calls = [], app = setup((path, options) => { calls.push(options); return Promise.resolve(options.method ? response() : { configured: true }) })
  await flush()
  await app.state.choosePhoto({ target: { files: [{ type: 'image/png', size: 100 }, { type: 'image/jpeg', size: 100 }] } })
  app.state.setOrgan(0, 'leaf'); app.state.setOrgan(1, 'flower')
  assert.equal(calls.length, 1)
  await app.state.scan()
  assert.equal(calls[1].body.images.length, 2)
  assert.equal(JSON.stringify(calls[1].body.organs), JSON.stringify(['leaf', 'flower']))
  assert.equal(calls[1].body.consent, true)
  app.stop()
})

test('both tasks accept five reviewed photos and switching tasks never discards them', async () => {
  const calls = [], app = setup((path, options) => { calls.push(options); return Promise.resolve(options.method ? response(options.body.task) : { configured: true }) })
  await flush()
  app.state.selectTask('identify')
  const file = { type: 'image/jpeg', size: 1000 }
  await app.state.choosePhoto({ target: { files: Array(5).fill(file) } })
  assert.equal(app.state.maxPhotos.value, 5)
  assert.equal(app.state.photos.value.length, 5)
  assert.equal(app.state.canSend.value, true)
  app.state.selectTask('disease')
  assert.equal(app.state.maxPhotos.value, 5)
  assert.equal(app.state.photos.value.length, 5)
  assert.equal(app.state.canSend.value, true)
  await app.state.scan()
  assert.equal(calls[1].body.images.length, 5)
  assert.equal(calls[1].body.organs.length, 5)
  await pick(app)
  assert.equal(app.state.photos.value.length, 5)
  assert.match(app.state.error.value, /up to 5/)
  app.stop()
})

test('aggregate prepared pixel limit rejects an addition without discarding reviewed photos', async () => {
  const app = setup(undefined, undefined, [2000, 2000]); await flush()
  const file = { type: 'image/jpeg', size: 1000 }
  await app.state.choosePhoto({ target: { files: Array(4).fill(file) } })
  assert.equal(app.state.photos.value.length, 4)
  assert.equal(app.state.photos.value[0].pixels, 1280 * 1280)
  await pick(app)
  assert.equal(app.state.photos.value.length, 4)
  assert.match(app.state.error.value, /together under 8 megapixels/)
  assert.equal(app.revoked.length, 5)
  app.stop()
})

test('only supported organs are offered and taxonomy details use supplied names only', async () => {
  const app = setup(); await flush()
  assert.equal(JSON.stringify(app.state.organs.map(item => item.value)), JSON.stringify(['auto', 'leaf', 'flower', 'fruit', 'bark']))
  await pick(app); app.state.setOrgan(0, 'habit')
  assert.equal(app.state.photos.value[0].organ, 'auto')
  assert.equal(app.state.taxonomy({ name: 'Plant' }).length, 0)
  const candidate = { scientificName: 'Zea mays', genus: 'Zea', family: 'Poaceae' }
  assert.equal(JSON.stringify(app.state.taxonomy(candidate)), JSON.stringify([{ label: 'Scientific name', name: 'Zea mays' }, { label: 'Genus', name: 'Zea' }, { label: 'Family', name: 'Poaceae' }]))
  assert.equal(app.state.taxonomy({ genus: { scientificNameWithoutAuthor: 'Zea' } })[0].name, 'Zea')
  assert.equal(app.state.taxonomy({ genus: {}, family: 7 }).length, 0)
  assert.match(source, /<details v-if="taxonomy\(candidate\).length".*<summary>Plant details<\/summary>/)
  app.stop()
})
