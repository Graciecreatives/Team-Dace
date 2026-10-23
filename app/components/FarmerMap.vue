<script setup>
import 'leaflet/dist/leaflet.css'
import { mapGroups, safeTileUrl } from '../utils/farmer-map.js'
const props = defineProps({ center: { type: Object, required: true }, farmers: { type: Array, default: () => [] }, selectedId: { type: String, default: '' } })
const emit = defineEmits(['select'])
const host = ref(null), loading = ref(true), error = ref('')
const config = useRuntimeConfig()
let L, map, tiles, markerLayer, resizeObserver, disposed = false
const markers = new Map()
function fitArea() {
  if (!map || !L) return
  const points = [[props.center.latitude, props.center.longitude], ...mapGroups(props.farmers).map(group => [group.latitude, group.longitude])]
  map.fitBounds(L.latLngBounds(points), { padding: [35, 35], maxZoom: 11, animate: false })
}
function renderMarkers() {
  if (!map || !L) return
  markerLayer.clearLayers(); markers.clear()
  L.circleMarker([props.center.latitude, props.center.longitude], { radius: 9, color: '#fff', weight: 3, fillColor: '#b48726', fillOpacity: 1 }).addTo(markerLayer).bindTooltip('Your search area, not an exact farm address')
  for (const group of mapGroups(props.farmers)) {
    const element = document.createElement('span')
    element.className = 'farmer-pin'
    element.textContent = group.farmers.length > 1 ? String(group.farmers.length) : '🌱'
    const title = group.farmers.length > 1 ? `${group.farmers.length} farmers in this approximate area` : `${group.farmers[0].displayName}, approximate farm area`
    const marker = L.marker([group.latitude, group.longitude], { icon: L.divIcon({ html: element, className: 'farmer-marker', iconSize: [38, 46], iconAnchor: [19, 42], popupAnchor: [0, -38] }), title, alt: title, keyboard: true }).addTo(markerLayer)
    const popup = document.createElement('div')
    popup.className = 'farmer-map-popup'
    const note = document.createElement('p'); note.textContent = 'Approximate area only'; note.className = 'area-label'; popup.appendChild(note)
    for (const farmer of group.farmers) {
      const button = document.createElement('button')
      button.type = 'button'; button.className = 'farmer-popup-choice'
      button.textContent = `${farmer.displayName} · ${farmer.farmType}`
      button.addEventListener('click', () => emit('select', farmer))
      popup.appendChild(button)
      markers.set(farmer.id, marker)
    }
    marker.bindPopup(popup, { maxWidth: 260 })
    marker.on('click', () => { if (group.farmers.length === 1) emit('select', group.farmers[0]) })
  }
}
function selectMarker() {
  const marker = markers.get(props.selectedId)
  if (!marker || !map) return
  marker.openPopup()
  map.panTo(marker.getLatLng(), { animate: false })
}
watch(() => [props.farmers, props.center.latitude, props.center.longitude], () => { renderMarkers(); fitArea(); selectMarker() }, { deep: true })
watch(() => props.selectedId, selectMarker)
function retryTiles() { error.value = ''; tiles?.redraw() }
onMounted(async () => {
  try {
    const tileUrl = config.public.mapTileUrl
    if (!safeTileUrl(tileUrl)) throw new Error('Invalid tile provider configuration')
    const module = await import('leaflet')
    if (disposed || !host.value) return
    L = module.default || module
    map = L.map(host.value, { scrollWheelZoom: false, maxZoom: 15, minZoom: 2, keyboard: true, zoomAnimation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches })
    map.setView([props.center.latitude, props.center.longitude], 10)
    tiles = L.tileLayer(tileUrl, { maxZoom: 19, attribution: config.public.mapAttribution, referrerPolicy: 'strict-origin-when-cross-origin', updateWhenIdle: true, keepBuffer: 1 }).addTo(map)
    tiles.on('tileerror', () => { if (!disposed) error.value = 'Some map tiles could not load. You can still use the farmer list and connection buttons.' })
    markerLayer = L.layerGroup().addTo(map)
    renderMarkers(); fitArea(); selectMarker()
    resizeObserver = new ResizeObserver(() => map?.invalidateSize({ animate: false }))
    resizeObserver.observe(host.value)
  } catch (issue) { console.error('FarmBuddy map startup failed', issue); error.value = 'The map could not start. Use the farmer list above, or reload to try again.' }
  finally { if (!disposed) loading.value = false }
})
onBeforeUnmount(() => { disposed = true; resizeObserver?.disconnect(); map?.remove(); map = null; markers.clear() })
</script>

<template>
  <div class="farmer-map">
    <div class="map-toolbar"><span><i class="search-dot"></i> Search area</span><span><i class="farmer-dot"></i> Opted-in farmers</span><button type="button" @click="fitArea">Fit all areas</button></div>
    <p v-if="loading" role="status" class="map-notice">Opening the interactive map…</p>
    <div ref="host" class="map-canvas" role="region" aria-label="Interactive map of approximate farmer areas. Use the farmer list as an accessible alternative." />
    <div v-if="error" role="status" class="map-notice">{{ error }} <button type="button" @click="retryTiles">Retry map tiles</button></div>
    <p class="map-caption">Select a green marker to view a farmer. Numbered markers group farmers sharing the same rounded area. Zoom does not reveal exact addresses.</p>
    <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer" class="map-issue">Report a map issue</a>
  </div>
</template>

<style scoped>
.farmer-map{position:relative;isolation:isolate;overflow:hidden;border:1px solid #dce5d4;border-radius:18px;background:#f6f8ef}.map-canvas{height:440px;width:100%;z-index:0;background:#e9eee0}.map-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:14px;padding:12px 16px;font-size:11px;color:#52684e;background:#fbfcf8}.map-toolbar span{display:flex;align-items:center;gap:6px}.map-toolbar i{display:block;width:9px;height:9px;border-radius:50%}.search-dot{background:#b48726}.farmer-dot{background:#066136}.map-toolbar button{margin-left:auto;font-weight:700;color:#066136}.map-notice{padding:12px 16px;font-size:12px;line-height:1.7;background:#fff3d6;color:#805b20}.map-notice button{margin-left:5px;text-decoration:underline}.map-caption{padding:12px 16px 6px;font-size:11px;line-height:1.7;color:#65785e}.map-issue{display:inline-block;font-size:11px;color:#066136;text-decoration:underline;padding:0 16px 12px}.farmer-map :deep(.farmer-marker){background:none;border:0}.farmer-map :deep(.farmer-pin){display:grid;place-items:center;width:36px;height:40px;border:3px solid #fff;border-radius:18px 18px 18px 4px;transform:rotate(-8deg);background:#066136;color:#fff;font:700 15px 'Plus Jakarta Sans',sans-serif;box-shadow:0 3px 8px #103c2840}.farmer-map :deep(.farmer-map-popup){font-family:'Plus Jakarta Sans',sans-serif;max-height:230px;overflow:auto}.farmer-map :deep(.area-label){font-size:10px;color:#75826a;margin:0 0 8px}.farmer-map :deep(.farmer-popup-choice){display:block;width:100%;text-align:left;border:1px solid #dce5d4;background:#f4f8ee;border-radius:8px;padding:10px;margin-top:6px;font-size:12px;font-weight:600;color:#174b31;white-space:normal;overflow-wrap:anywhere}.farmer-map :deep(.leaflet-control-attribution){font-size:10px;background:#fffffff2;max-width:100%;white-space:normal}.farmer-map :deep(.leaflet-control-attribution a){color:#215a3c}button:focus-visible,a:focus-visible,.farmer-map :deep(button:focus-visible),.farmer-map :deep(.leaflet-marker-icon:focus-visible){outline:3px solid #a77e20;outline-offset:3px}@media(max-width:600px){.map-canvas{height:330px}.map-toolbar{gap:10px;font-size:10px}}
</style>
