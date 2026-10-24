<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import 'leaflet/dist/leaflet.css'
import { safeTileUrl } from '../utils/farmer-map.js'
const props = defineProps({ plots: { type: Array, default: () => [] } })
const config = useRuntimeConfig()
const host = ref(null)
const error = ref('')
let map, layer, L, tiles, resizeObserver, disposed = false
function draw() {
  if (!map) return
  layer.clearLayers()
  for (const plot of props.plots) {
    const polygon = L.polygon(plot.coordinates, { color: '#166534', fillColor: '#eab308', fillOpacity: 0.25 }).addTo(layer)
    const label = document.createElement('span')
    label.textContent = plot.name
    polygon.bindTooltip(label)
  }
  if (layer.getLayers().length) map.fitBounds(layer.getBounds(), { padding: [24, 24], maxZoom: 16 })
}
onMounted(async () => {
  try {
    const tileUrl = config.public.mapTileUrl
    if (!safeTileUrl(tileUrl)) throw new Error('Invalid map provider configuration')
    L = await import('leaflet')
    if (disposed) return
    map = L.map(host.value, { scrollWheelZoom: false }).setView([8, 8], 3)
    tiles = L.tileLayer(tileUrl, { attribution: config.public.mapAttribution, maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin', updateWhenIdle: true, keepBuffer: 1 }).addTo(map)
    tiles.on('tileerror', () => { if (!disposed) error.value = 'Some map tiles could not load. Saved coordinates remain available below.' })
    layer = L.featureGroup().addTo(map)
    draw()
    resizeObserver = new ResizeObserver(() => map?.invalidateSize({ animate: false }))
    resizeObserver.observe(host.value)
  } catch { error.value = 'Map unavailable. Saved coordinates remain available below.' }
})
watch(() => props.plots, draw, { deep: true })
onBeforeUnmount(() => { disposed = true; resizeObserver?.disconnect(); map?.remove() })
</script>
<template><div><p v-if="error" role="status">{{ error }}</p><div ref="host" class="plot-map" role="region" aria-label="Saved farm plot boundaries"></div><p class="map-note">Map tiles need an internet connection. Boundaries are planning references, not a land survey.</p></div></template>
<style scoped>.plot-map{height:320px;min-height:240px;border-radius:16px;z-index:0}.map-note{font-size:.8rem;color:#647067;margin-top:.5rem}</style>
