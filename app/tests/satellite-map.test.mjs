import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { ref, watch, nextTick, reactive, effectScope } from 'vue'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import { imageryDates, rasterConfig, mapPoint, createRasterMap } from '../utils/satellite-map.js'

test('seven strictly past UTC days, including year/leap boundaries', () => {
  assert.deepEqual(imageryDates(new Date('2026-01-01T00:00:00Z')), ['2025-12-31','2025-12-30','2025-12-29','2025-12-28','2025-12-27','2025-12-26','2025-12-25'])
  assert.equal(imageryDates(new Date('2024-03-01T23:59:59Z'))[0], '2024-02-29')
  assert.equal(imageryDates(new Date('2026-10-24T00:01:00+01:00'))[0], '2026-10-22')
})
test('fixed providers, exact NASA matrix and strict date/layer allowlist', () => {
  const now = new Date('2026-10-24T17:00:00Z')
  const config = rasterConfig('satellite', '2026-10-23', now)
  assert.equal(config.url, 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2026-10-23/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg')
  assert.equal(config.options.maxNativeZoom, 9)
  assert.equal(config.options.tileSize, 256)
  for (const date of ['2026-10-24','2026-10-25','2026-10-16','2026-02-30','2026-10-23/../evil','']) assert.throws(() => rasterConfig('satellite', date, now))
  assert.throws(() => rasterConfig('https://evil.test', '2026-10-23', now))
  assert.throws(() => rasterConfig('satellite', '2026-10-23', now, 'arbitrary-layer'))
  assert.equal(rasterConfig('road', '2026-10-23', now).url, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png')
})
function fakeLeaflet() {
  const layers = [], views = [], markers = []
  const map = { events: {}, on(name, callback) { this.events[name] = callback; return this }, getCenter() { return { lat: 12.345, lng: 6.789 } }, removed: false, setView(...args) { views.push(args); return this }, removeLayer(layer) { layer.removed = true }, remove() { this.removed = true }, invalidateSize() {} }
  const L = { map: () => map, tileLayer(url, options) { const layer = { url, options, events: {}, on(name, callback) { this.events[name] = callback; return this }, off() { this.events = {} }, addTo() { return this } }; layers.push(layer); return layer }, circleMarker(point) { const marker = { point, addTo() { return this }, bindTooltip() { return this }, setLatLng(value) { this.point = value } }; markers.push(marker); return marker } }
  return { L, layers, map, views, markers }
}
test('tile failures are explicit and stale events are ignored on replacement/disposal', () => {
  const fake = fakeLeaflet(), statuses = [], adapter = createRasterMap(fake.L, {}, text => statuses.push(text))
  const date = imageryDates()[0]
  adapter.setLayer('satellite', date)
  const old = fake.layers[0].events
  old.loading(); old.tileerror(); old.load()
  assert.match(statuses.at(-1), /1 tile request\(s\) failed/)
  adapter.setLayer('road', date)
  assert.equal(fake.layers[0].removed, true)
  const count = statuses.length
  old.load(); assert.equal(statuses.length, count)
  const current = fake.layers[1].events
  current.tileload(); current.load()
  assert.match(statuses.at(-1), /Road tiles received/)
  adapter.destroy()
  assert.equal(fake.map.removed, true)
  const after = statuses.length
  current.tileerror(); current.load(); assert.equal(statuses.length, after)
  assert.deepEqual(fake.layers[1].events, {})
})
test('location updates move existing approximate marker and never emit coordinates', () => {
  const fake = fakeLeaflet(), adapter = createRasterMap(fake.L, {}, () => {})
  adapter.setPoint({ latitude: 7.5, longitude: 4 })
  adapter.setPoint({ latitude: 8, longitude: 5 })
  assert.equal(fake.markers.length, 1)
  assert.deepEqual(fake.markers[0].point, [8, 5])
  assert.deepEqual(fake.views.at(-1), [[8, 5], 7, { animate: false }])
  assert.equal(mapPoint({ latitude: NaN, longitude: 0 }), null)
  assert.equal(mapPoint({ latitude: 91, longitude: 0 }), null)
  assert.ok(mapPoint({ latitude: 90, longitude: 180 })[0] < 86)
  adapter.destroy()
})
test('clicks and panning never select except in explicit one-shot pick mode, center supports keyboard', () => {
  const fake = fakeLeaflet(), picks = []
  const adapter = createRasterMap(fake.L, {}, () => {}, true, point => picks.push(point))
  fake.map.events.click({ latlng: { lat: 5, lng: 8 } })
  adapter.selectCenter()
  assert.equal(picks.length, 0)
  adapter.setPicking(true)
  fake.map.setView([2, 3], 7)
  assert.equal(picks.length, 0, 'panning alone must not change forecast')
  fake.map.events.click({ latlng: { lat: 5, lng: 8 } })
  assert.deepEqual(picks, [{ latitude: 5, longitude: 8 }])
  fake.map.events.click({ latlng: { lat: 10, lng: 12 } })
  assert.equal(picks.length, 1, 'pick mode ends after selection')
  adapter.setPicking(true)
  adapter.selectCenter()
  assert.deepEqual(picks[1], { latitude: 12.345, longitude: 6.789 })
  adapter.setPicking(true)
  fake.map.events.click({ latlng: { lat: 5, lng: 368 } })
  assert.deepEqual(picks.pop(), { latitude: 5, longitude: 8 })
  adapter.setPicking(true)
  adapter.setPicking(false)
  adapter.selectCenter()
  assert.equal(picks.length, 2)
  adapter.destroy()
  fake.map.events.click({ latlng: { lat: 5, lng: 8 } })
  assert.equal(picks.length, 2)
})
test('satellite SFC compiles with consent gate, client-only import, cleanup and accessible narrow layout', () => {
  const source = readFileSync(new URL('../components/FarmSatelliteMap.vue', import.meta.url), 'utf8')
  const { descriptor, errors } = parse(source)
  assert.deepEqual(errors, [])
  const script = compileScript(descriptor, { id: 'satellite' })
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'FarmSatelliteMap.vue', id: 'satellite', compilerOptions: { bindingMetadata: script.bindings } }).errors, [])
  assert.deepEqual(compileStyle({ source: descriptor.styles[0].content, filename: 'FarmSatelliteMap.vue', id: 'satellite', scoped: true }).errors, [])
  assert.match(source, /async function load\(\)[\s\S]*await import\('leaflet'\)/)
  assert.doesNotMatch(source, /getCurrentPosition|localStorage|\$fetch|onMounted/)
  assert.match(source, /onBeforeUnmount\(stop\)/)
  assert.match(source, /observer\?\.disconnect/)
  assert.match(source, /token !== generation/)
  assert.match(source, /focus-visible/)
  assert.match(source, /prefers-reduced-motion:reduce/)
  assert.match(source, /min-width:0/)
  assert.match(source, /not a claim of latest available imagery/)
  assert.match(source, /Open map/)
  assert.match(source, /Use map center/)
  assert.match(source, /mode = ref\('road'\)/)
  assert.match(source, /<header class="map-header">[\s\S]*<legend class="sr-only">Map view<\/legend>[\s\S]*<\/fieldset><\/div><\/header>/)
  assert.match(source, /<p v-if="mode === 'satellite'" class="caption satellite-caption">/)
  assert.match(source, /\.map-header \.tools\{margin:0\}/)
  assert.match(source, /Regional satellite image, not a crop diagnosis\./)
  assert.match(source, /Requested day: \$\{date\} UTC/)
  assert.match(source, /<details><summary>Map privacy, sources & limits<\/summary>/)
  assert.doesNotMatch(source, /type="checkbox"|<details open|Apply day|<h2/)
})

function setupSatellite(importer) {
  const source = readFileSync(new URL('../components/FarmSatelliteMap.vue', import.meta.url), 'utf8')
  const script = compileScript(parse(source).descriptor, { id: 'satellite-runtime' }).content
  const props = reactive({ point: null }), scope = effectScope()
  let unmount, imports = 0, disconnects = 0
  const emitted = []
  const fake = fakeLeaflet()
  const context = vm.createContext({ ref, watch, nextTick, imageryDates, createRasterMap,
    onBeforeUnmount(callback) { unmount = callback },
    window: { matchMedia: () => ({ matches: true }) },
    ResizeObserver: class { observe() {} disconnect() { disconnects++ } },
    importLeaflet() { imports++; return importer ? importer() : Promise.resolve(fake.L) } })
  vm.runInContext(script.replace(/^import .*$/gm, '').replace("import('leaflet')", 'importLeaflet()').replace('export default', 'globalThis.component ='), context)
  const state = scope.run(() => context.component.setup(props, { expose() {}, emit: (...args) => emitted.push(args) }))
  return { state, props, fake, emitted, imports: () => imports, disconnects: () => disconnects, stop() { unmount(); scope.stop() } }
}
test('actual component has no tile/import requests until Load, then moves point and unloads cleanly', async () => {
  const app = setupSatellite()
  assert.equal(app.imports(), 0)
  assert.equal(app.fake.layers.length, 0)
  app.props.point = { latitude: 7.5, longitude: 4 }
  await nextTick()
  assert.equal(app.fake.layers.length, 0)
  await app.state.load()
  assert.equal(app.imports(), 1)
  assert.equal(app.fake.layers.length, 1)
  assert.deepEqual(app.fake.markers[0].point, [7.5, 4])
  app.props.point = { latitude: 8, longitude: 5 }
  await nextTick()
  assert.deepEqual(app.fake.markers[0].point, [8, 5])
  app.state.stop()
  assert.equal(app.fake.map.removed, true)
  assert.equal(app.disconnects(), 1)
  assert.equal(app.state.consent.value, false)
  app.stop()
})
test('Choose on map loads only on action and emits the actual clicked point once', async () => {
  const app = setupSatellite()
  assert.equal(app.imports(), 0)
  await app.state.chooseOnMap()
  assert.equal(app.imports(), 1)
  assert.equal(app.state.picking.value, true)
  app.fake.map.events.click({ latlng: { lat: 7.456, lng: 3.987 } })
  assert.equal(app.emitted[0][0], 'point-select')
  assert.equal(app.emitted[0][1].latitude, 7.456)
  assert.equal(app.state.picking.value, false)
  app.stop()
})
test('unmount during Leaflet import prevents late map creation and import failure is recoverable', async () => {
  let resolve
  const app = setupSatellite(() => new Promise(yes => { resolve = yes }))
  const pending = app.state.load()
  await new Promise(done => setImmediate(done))
  assert.equal(app.imports(), 1)
  app.stop()
  resolve(app.fake.L)
  await pending
  assert.equal(app.fake.layers.length, 0)
  const failed = setupSatellite(() => Promise.reject(new Error('offline')))
  await failed.state.load()
  assert.equal(failed.state.consent.value, false)
  assert.match(failed.state.status.value, /Map could not load/)
  failed.stop()
})
