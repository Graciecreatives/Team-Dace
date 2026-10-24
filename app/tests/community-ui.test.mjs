import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { ref, reactive, computed, watch, nextTick, effectScope } from 'vue'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'

const source = readFileSync(new URL('../components/FarmLocationTools.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const compiled = compileScript(descriptor, { id: 'community-ui' })
const empty = () => ({ profile: { visible: false, latitude: null, longitude: null, contact: '' }, requests: [] })
const flush = async () => { await new Promise(resolve => setImmediate(resolve)) }
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function setup(fetcher, mode = 'community', geolocation = { getCurrentPosition() { throw new Error('Unexpected permission request') } }) {
  const props = reactive({ user: { id: 'one', farmName: 'First farm' }, mode })
  const scope = effectScope()
  let unmount, mount
  const context = vm.createContext({ ref, reactive, computed, watch, nextTick, AbortController, MapPin: null, MapIcon: null, ShieldCheck: null, Users: null, Search: null, UserPlus: null, EyeOff: null, RefreshCw: null, Check: null, X: null, Ban: null, Sprout: null, CloudSun: null, LoaderCircle: null,
    onMounted: callback => { mount = callback }, onUnmounted: callback => { unmount = callback }, navigator: { geolocation },
    window: { confirm: () => true, matchMedia: () => ({ matches: false }) }, document: { getElementById: () => null }, $fetch: fetcher })
  vm.runInContext(compiled.content.replace(/^import .*$/gm, '').replace('export default', 'globalThis.component ='), context)
  const state = scope.run(() => context.component.setup(props, { expose() {} }))
  scope.run(() => mount())
  return { state, props, stop() { unmount(); scope.stop() } }
}
function coordinates(state) { state.latitude.value = '7.456'; state.longitude.value = '3.987' }

test('component script, template and styles compile with shared UI and privacy copy', () => {
  assert.deepEqual(parse(source).errors, [])
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'FarmLocationTools.vue', id: 'community-ui', compilerOptions: { bindingMetadata: compiled.bindings } }).errors, [])
  assert.deepEqual(compileStyle({ source: descriptor.styles[0].content, filename: 'FarmLocationTools.vue', id: 'community-ui', scoped: true }).errors, [])
  assert.match(source, /<FbPageHeader :title=.*:description=/)
  assert.match(source, /#actions/)
  assert.match(source, /<FbButton/)
  assert.match(source, /<FbBadge/)
  assert.match(source, /Retry loading community/)
  assert.match(source, /No opted-in farmers were found/)
  assert.match(source, /request.status === 'accepted' && request.contact/)
  assert.match(source, /0.1°/)
  assert.match(source, /tile provider/)
})

test('map workspace leads profile editing and keeps provider and publishing consent separate', () => {
  const template = descriptor.template.content
  assert.ok(template.indexOf('id="nearby-farmer-map"') < template.indexOf('class="profile-editor'))
  assert.match(template, /<FarmerMap v-if="mapPoint"/)
  assert.match(template, /Close external map/)
  assert.match(template, /Looking around does not make you discoverable/)
  assert.match(template, /<details class="manual-area"/)
  assert.match(template, /<details class="profile-editor/)
  assert.match(template, /v-model="sharing.consent" type="checkbox" required/)
  assert.match(source, /min-height:44px/)
  assert.match(source, /prefers-reduced-motion:reduce/)
  assert.match(source, /summary:focus-visible/)
})

test('map can be closed without publishing a profile, changing results or fetching again', async () => {
  const calls = []
  const app = setup((path, options) => { calls.push({ path, options }); return Promise.resolve(empty()) })
  await flush()
  coordinates(app.state)
  app.state.loadMap()
  assert.equal(app.state.mapPoint.value.latitude, 7.5)
  app.state.mapPoint.value = null
  assert.equal(app.state.mapPoint.value, null)
  assert.equal(app.state.community.value.profile.visible, false)
  assert.equal(app.state.sharing.consent, false)
  assert.equal(calls.length, 1)
  app.stop()
})

test('initial load is busy, fails honestly, retries without automatic network retries', async () => {
  const first = deferred(), calls = []
  const app = setup((path, options) => { calls.push({ path, options }); return calls.length === 1 ? first.promise : Promise.resolve(empty()) })
  assert.equal(app.state.loading.value, true)
  assert.equal(app.state.busy.value, true)
  await app.state.search()
  await app.state.communityAction('hide')
  app.state.locate()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].options.retry, 0)
  assert.equal(calls[0].options.timeout, 15000)
  assert.ok(calls[0].options.signal instanceof AbortSignal)
  first.reject(new Error('offline'))
  await flush()
  assert.equal(app.state.loaded.value, false)
  assert.equal(app.state.loading.value, false)
  assert.equal(app.state.error.value, 'offline')
  await app.state.loadCommunity()
  assert.equal(app.state.loaded.value, true)
  assert.equal(app.state.error.value, '')
  app.stop()
})

test('account switch aborts old profile and ignores late completion and finally', async () => {
  const requests = []
  const app = setup((path, options) => { const pending = deferred(); requests.push({ ...pending, options }); return pending.promise })
  app.state.sharing.contact = 'old contact'
  app.state.sharing.consent = true
  app.state.mapPoint.value = { latitude: 1, longitude: 1 }
  app.props.user = { id: 'two', farmName: 'Second farm' }
  assert.equal(requests[0].options.signal.aborted, true)
  assert.equal(app.state.sharing.contact, '')
  assert.equal(app.state.sharing.consent, false)
  assert.equal(app.state.mapPoint.value, null)
  requests[0].resolve({ profile: { visible: true, contact: 'stale secret', latitude: 10, longitude: 20 }, requests: [] })
  await flush()
  assert.equal(app.state.busy.value, true)
  assert.equal(app.state.sharing.displayName, 'Second farm')
  assert.equal(app.state.latitude.value, '')
  requests[1].resolve(empty())
  await flush()
  assert.equal(app.state.busy.value, false)
  app.stop()
})

test('search is single flight and mode changes ignore old results', async () => {
  const pending = deferred(), calls = []
  const app = setup((path, options) => { calls.push(options); return options.body ? pending.promise : Promise.resolve(empty()) })
  await flush()
  coordinates(app.state)
  const searching = app.state.search()
  await app.state.search()
  await app.state.communityAction('request', { targetId: 'other' })
  app.state.loadMap()
  assert.equal(calls.length, 2)
  assert.equal(calls[1].body.latitude, 7.5)
  assert.equal(calls[1].body.longitude, 4)
  app.props.mode = 'weather'
  assert.equal(calls[1].signal.aborted, true)
  pending.resolve({ farmers: [{ id: 'stale' }], latitude: 7.5, longitude: 4 })
  await searching
  assert.equal(app.state.farmers.value.length, 0)
  assert.equal(app.state.searched.value, false)
  assert.equal(app.state.mapPoint.value, null)
  assert.equal(app.state.loaded.value, false)
  app.stop()
})

test('geolocation is click-only, exclusive and late account/mode/unmount callbacks are ignored', async () => {
  const callbacks = [], calls = []
  const app = setup((...args) => { calls.push(args); return Promise.resolve(empty()) }, 'weather', { getCurrentPosition(success, failure, options) { callbacks.push({ success, failure, options }) } })
  assert.equal(callbacks.length, 0)
  app.state.locate()
  app.state.locate()
  coordinates(app.state)
  await app.state.weather()
  assert.equal(calls.length, 0)
  assert.equal(callbacks.length, 1)
  app.props.user = { id: 'two' }
  callbacks[0].success({ coords: { latitude: 30, longitude: 40 } })
  callbacks[0].failure()
  assert.equal(app.state.latitude.value, '')
  assert.equal(app.state.error.value, '')
  app.state.locate()
  callbacks[1].failure()
  callbacks[1].success({ coords: { latitude: 30, longitude: 40 } })
  assert.equal(app.state.latitude.value, '')
  app.state.locate()
  app.props.mode = 'community'
  callbacks[2].success({ coords: { latitude: 30, longitude: 40 } })
  await flush()
  assert.equal(app.state.latitude.value, '')
  app.state.locate()
  app.stop()
  callbacks[3].success({ coords: { latitude: 30, longitude: 40 } })
  assert.equal(app.state.latitude.value, '')
})

test('geolocation success rounds area and never publishes or fetches automatically', () => {
  let success
  const app = setup(() => { throw new Error('Unexpected network') }, 'weather', { getCurrentPosition(callback) { success = callback } })
  app.state.locate()
  success({ coords: { latitude: 7.456, longitude: 3.987 } })
  assert.equal(app.state.latitude.value, '7.5')
  assert.equal(app.state.longitude.value, '4')
  assert.equal(app.state.sharing.consent, false)
  assert.equal(app.state.locating.value, false)
  app.stop()
})

test('publication needs explicit consent and hide clears sensitive drafts and selected map results', async () => {
  const calls = []
  const app = setup((path, options) => { calls.push(options); return Promise.resolve(options.body?.action === 'publish' ? { profile: { visible: true, ...options.body }, requests: [] } : empty()) })
  await flush()
  coordinates(app.state)
  app.state.sharing.contact = 'chosen contact'
  await app.state.communityAction('publish')
  assert.equal(calls.length, 1)
  assert.match(app.state.error.value, /consent/)
  app.state.sharing.consent = true
  await app.state.communityAction('publish')
  assert.equal(calls[1].body.consent, true)
  assert.equal(calls[1].body.latitude, 7.5)
  assert.equal(calls[1].body.contact, 'chosen contact')
  assert.equal(app.state.sharing.consent, false)
  app.state.farmers.value = [{ id: 'other' }]
  app.state.selectedId.value = 'other'
  app.state.mapPoint.value = { latitude: 7.5, longitude: 4 }
  await app.state.communityAction('hide')
  assert.equal(calls[2].body.action, 'hide')
  assert.equal(app.state.sharing.contact, '')
  assert.equal(app.state.sharing.bio, '')
  assert.equal(app.state.latitude.value, '')
  assert.equal(app.state.selectedId.value, '')
  assert.equal(app.state.mapPoint.value, null)
  assert.equal(app.state.farmers.value.length, 0)
  app.stop()
})

test('search and farmer selection do not opt into map tiles, block clears selection', async () => {
  const farmer = { id: 'other', displayName: 'Real opted-in farm', latitude: 7.5, longitude: 4 }
  const app = setup((path, options) => Promise.resolve(options.body?.action === 'search' ? { farmers: [farmer], latitude: 7.5, longitude: 4 } : empty()))
  await flush()
  coordinates(app.state)
  await app.state.search()
  app.state.showFarmer(farmer)
  await nextTick()
  assert.equal(app.state.selectedFarmer.value.id, 'other')
  assert.equal(app.state.mapPoint.value, null)
  app.state.loadMap()
  assert.equal(app.state.mapPoint.value.latitude, 7.5)
  await app.state.communityAction('block', { targetId: 'other' })
  assert.equal(app.state.selectedFarmer.value, undefined)
  assert.equal(app.state.selectedId.value, '')
  assert.equal(app.state.mapPoint.value, null)
  assert.equal(app.state.searched.value, false)
  app.stop()
})

test('request/respond payloads preserve API contract and return real overview only', async () => {
  const bodies = []
  const app = setup((path, options) => { if (options.body) bodies.push(options.body); return Promise.resolve({ ...empty(), requests: [{ id: 'request', farmerId: 'other', incoming: true, status: options.body?.status || 'pending', contact: options.body?.status === 'accepted' ? 'chosen contact' : '' }] }) })
  await flush()
  await app.state.communityAction('request', { targetId: 'other' })
  await app.state.communityAction('respond', { requestId: 'request', status: 'accepted' })
  assert.equal(bodies[0].targetId, 'other')
  assert.equal(bodies[1].requestId, 'request')
  assert.equal(bodies[1].status, 'accepted')
  assert.equal(app.state.community.value.requests[0].contact, 'chosen contact')
  await app.state.communityAction('respond', { requestId: 'request', status: 'declined' })
  assert.equal(app.state.community.value.requests[0].contact, '')
  app.stop()
})

test('unmount aborts pending weather, ignores late network errors, and signed-out state cannot act', async () => {
  const pending = deferred()
  let options, count = 0
  const app = setup((path, input) => { options = input; count++; return pending.promise }, 'weather')
  coordinates(app.state)
  const weather = app.state.weather()
  app.stop()
  assert.equal(options.signal.aborted, true)
  pending.reject(new Error('late error'))
  await weather
  assert.equal(app.state.error.value, '')
  assert.equal(app.state.forecast.value, null)
  const signedOut = setup(() => { count++; return Promise.resolve(empty()) }, 'weather')
  signedOut.props.user = null
  signedOut.state.locate()
  await signedOut.state.weather()
  assert.equal(count, 1)
  signedOut.stop()
})

test('account switch during mutation cannot repopulate profile, requests or success notice', async () => {
  const pending = deferred(), calls = []
  const app = setup((path, options) => { calls.push(options); return options.body ? pending.promise : Promise.resolve(empty()) })
  await flush()
  const responding = app.state.communityAction('respond', { requestId: 'old', status: 'accepted' })
  app.props.user = { id: 'two', farmName: 'New farm' }
  await flush()
  assert.equal(calls[1].signal.aborted, true)
  pending.resolve({ profile: { visible: true, contact: 'old private contact' }, requests: [{ contact: 'old accepted contact' }] })
  await responding
  assert.equal(app.state.sharing.displayName, 'New farm')
  assert.equal(app.state.sharing.contact, '')
  assert.equal(app.state.community.value.requests.length, 0)
  assert.equal(app.state.message.value, '')
  app.stop()
})

test('geolocation exceptions and malformed positions release the operation lock', () => {
  const app = setup(() => Promise.resolve(empty()), 'weather', { getCurrentPosition() { throw new Error('device unavailable') } })
  app.state.locate()
  assert.equal(app.state.locating.value, false)
  assert.match(app.state.error.value, /enter approximate coordinates manually/)
  app.stop()
  const malformed = setup(() => Promise.resolve(empty()), 'weather', { getCurrentPosition(success) { success({ coords: { latitude: NaN, longitude: 4 } }) } })
  malformed.state.locate()
  assert.equal(malformed.state.locating.value, false)
  assert.equal(malformed.state.latitude.value, '')
  malformed.stop()
})
