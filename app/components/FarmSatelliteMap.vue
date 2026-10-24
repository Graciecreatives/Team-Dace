<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import 'leaflet/dist/leaflet.css'
import { imageryDates, createRasterMap } from '../utils/satellite-map.js'
const props = defineProps({ point: { type: Object, default: null } })
const canvas = ref(null), consent = ref(false), loading = ref(false), mode = ref('satellite')
const dates = ref(imageryDates()), date = ref(dates.value[0]), status = ref('Map not loaded. No tile requests sent.')
let adapter, observer, generation = 0
function stop() {
  generation++; observer?.disconnect(); observer = null; adapter?.destroy(); adapter = null
  consent.value = false; loading.value = false; status.value = 'Map not loaded. No tile requests sent.'
}
async function load() {
  if (loading.value || consent.value) return
  consent.value = true; loading.value = true
  const token = ++generation
  try {
    await nextTick()
    if (token !== generation) return
    const module = await import('leaflet')
    if (token !== generation) return
    const L = module.default || module
    adapter = createRasterMap(L, canvas.value, text => { status.value = text }, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    adapter.setPoint(props.point)
    adapter.setLayer(mode.value, date.value)
    if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(() => adapter?.resize()); observer.observe(canvas.value) }
  } catch {
    if (token === generation) { observer?.disconnect(); adapter?.destroy(); adapter = null; consent.value = false; status.value = 'Map could not load. Check your connection and try again.' }
  } finally { if (token === generation) loading.value = false }
}
function changeLayer() {
  dates.value = imageryDates()
  try { adapter?.setLayer(mode.value, date.value) }
  catch { status.value = 'Choose a date in the previous seven UTC days, then apply it.' }
}
watch(() => props.point, point => adapter?.setPoint(point), { deep: true })
onBeforeUnmount(stop)
</script>

<template>
  <section class="satellite-watch" aria-labelledby="satellite-heading">
    <header><h3 id="satellite-heading">Area map</h3></header>
    <p class="caption">Regional satellite image, not a crop diagnosis.</p>
    <div class="tools"><fieldset><legend>Map view</legend><button :aria-pressed="mode === 'satellite'" @click="mode = 'satellite'; changeLayer()">Satellite</button><button :aria-pressed="mode === 'road'" @click="mode = 'road'; changeLayer()">Road</button></fieldset><div><label for="imagery-day">Image day (UTC)</label><div class="date-tools"><select id="imagery-day" v-model="date" :disabled="mode === 'road'" @change="changeLayer"><option v-for="day in dates" :key="day" :value="day">{{ day }}</option></select></div></div></div>
    <div v-if="!consent" class="placeholder"><p class="privacy">{{ mode === 'satellite' ? 'NASA GIBS' : 'OpenStreetMap' }} receives your IP address and viewed area when loaded.</p><button class="primary" @click="load">{{ mode === 'satellite' ? 'Load NASA map' : 'Load road map' }}</button></div>
    <template v-else><div ref="canvas" class="canvas" tabindex="0" role="region" aria-label="Area map. Use arrow keys to pan and plus or minus to zoom."/><button class="pause" @click="stop">Unload map</button></template>
    <p class="status" role="status">{{ loading ? 'Starting map…' : status }}</p>
    <p class="caption">{{ mode === 'satellite' ? `Requested day: ${date} UTC` : 'Road view · OpenStreetMap' }}{{ point ? ` · Your approximate area: ${point.latitude}, ${point.longitude}` : ' · Choose your area above to add a point.' }}</p>
    <details><summary>Map privacy, sources & limits</summary><p>NASA GIBS supplies MODIS Terra satellite images. OpenStreetMap supplies the road map. These providers receive your IP address and viewed map area only after you load the map. Panning, zooming and changing the chosen forecast area request more tiles while loaded. Unload map stops further requests. No automatic geolocation. Your approximate area is not saved.</p><p>Yesterday is the default, not a claim of latest available imagery. Gold point marks the approximate forecast area, not a field boundary. Pan and zoom do not change your forecast location.</p><p>Daily true-color imagery at approximately 250 m visualization resolution (sensor bands 250–500 m). Clouds, haze, acquisition gaps and processing latency can hide the ground. A received tile does not establish cloud-free coverage for the requested date. Zooming beyond native level 9 adds no detail. This cannot detect individual plant disease, provide accurate field NDVI, or predict harvests. No plot-precision claims.</p><a href="https://nasa-gibs.github.io/gibs-api-docs/access-basics/" target="_blank" rel="noopener noreferrer">NASA GIBS documentation</a> · <a href="https://github.com/nasa-gibs/worldview/blob/main/config/default/common/config/metadata/layers/modis/terra/MODIS_Terra_CorrectedReflectance_TrueColor.md" target="_blank" rel="noopener noreferrer">NASA imagery metadata</a></details>
  </section>
</template>

<style scoped>
.satellite-watch{min-width:0;background:#fff;border:1px solid #dce5d5;border-radius:22px;padding:clamp(16px,3vw,28px);color:#203e30;overflow-wrap:anywhere}header,.tools,.date-tools{display:flex;gap:12px;flex-wrap:wrap;align-items:center}header{justify-content:space-between}h3{font-size:22px;letter-spacing:-.03em;margin:5px 0}.eyebrow,.source{font-size:11px;color:#5b7055}.eyebrow{letter-spacing:.06em;text-transform:uppercase}.privacy,.caption,details,.status{font-size:12px;line-height:1.8;margin:14px 0}.privacy{color:#52634c;max-width:95ch}.source{padding:7px 10px;background:#edf3e5;border-radius:8px}.tools{justify-content:space-between;margin:18px 0}fieldset{border:0;padding:0;display:flex;gap:6px}legend,label{font-size:11px;font-weight:700;margin-bottom:6px}form{min-width:0}label{display:block}button,select{min-height:44px;border:1px solid #cddac3;border-radius:9px;background:#f6f8f0;color:#203e30;padding:9px 12px;font-size:12px;cursor:pointer}button{font-weight:700;transition:background-color 160ms ease-out}button[aria-pressed=true],.primary{background:#17613e;color:#fff;border-color:#17613e}button:disabled{opacity:.5;cursor:default}button:active{transform:scale(.98)}button:focus-visible,select:focus-visible,summary:focus-visible,a:focus-visible,.canvas:focus-visible{outline:3px solid #b49940;outline-offset:3px}.canvas{height:420px;z-index:0;isolation:isolate;border-radius:14px;background:#e9eee0}.placeholder{min-height:260px;border-radius:14px;background:radial-gradient(ellipse at top right,#dbe9c8,#f4f7ee);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;font-size:13px;gap:12px}.placeholder strong{font-size:20px}.pause{margin-top:12px}.status{font-variant-numeric:tabular-nums;background:#f4f7ee;padding:10px;border-radius:8px}summary{cursor:pointer;min-height:44px;align-content:center}a{text-decoration:underline;color:#276746}.satellite-watch :deep(.leaflet-control-attribution){white-space:normal;font-size:10px;max-width:100%}@media(max-width:550px){.canvas{height:320px}.tools{align-items:stretch;flex-direction:column}.date-tools>*{flex:1;min-width:0}.source{font-size:10px}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
</style>
