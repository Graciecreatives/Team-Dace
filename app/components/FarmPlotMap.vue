<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import 'leaflet/dist/leaflet.css'
const props = defineProps({ plots: { type: Array, default: () => [] } })
const host = ref(null)
const error = ref('')
let map, layer, L, disposed = false
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
    L = await import('leaflet')
    if (disposed) return
    map = L.map(host.value).setView([8, 8], 3)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map)
    layer = L.featureGroup().addTo(map)
    draw()
  } catch { error.value = 'Map unavailable. Saved coordinates remain available below.' }
})
watch(() => props.plots, draw, { deep: true })
onBeforeUnmount(() => { disposed = true; map?.remove() })
</script>
<template><div><p v-if="error" role="status">{{ error }}</p><div ref="host" class="plot-map" role="region" aria-label="Saved farm plot boundaries"></div><p class="map-note">Map tiles need an internet connection. Boundaries are planning references, not a land survey.</p></div></template>
<style scoped>.plot-map{height:320px;min-height:240px;border-radius:16px;z-index:0}.map-note{font-size:.8rem;color:#647067;margin-top:.5rem}</style>
