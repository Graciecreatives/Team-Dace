// Fixed public raster providers only. No credentials or caller-supplied hosts.
export const SATELLITE_LAYER = 'MODIS_Terra_CorrectedReflectance_TrueColor'
export function imageryDates(now = new Date()) {
  const day = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`)
  return Array.from({ length: 7 }, (_, i) => new Date(day - (i + 1) * 86400000).toISOString().slice(0, 10))
}
export function rasterConfig(mode, date, now = new Date(), layer = SATELLITE_LAYER) {
  if (layer !== SATELLITE_LAYER || !['satellite', 'road'].includes(mode)) throw new Error('Unsupported map layer')
  if (!imageryDates(now).includes(date)) throw new Error('Choose one of the previous seven UTC days')
  const common = { tileSize: 256, maxZoom: 12, updateWhenIdle: true, keepBuffer: 1, referrerPolicy: 'no-referrer' }
  return mode === 'satellite'
    ? { url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${SATELLITE_LAYER}/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`, options: { ...common, maxNativeZoom: 9, attribution: 'NASA GIBS · MODIS Terra' } }
    : { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', options: { ...common, referrerPolicy: 'strict-origin-when-cross-origin', maxNativeZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' } }
}
export function mapPoint(point) {
  if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) return null
  return [Math.max(-85.05112878, Math.min(85.05112878, point.latitude)), point.longitude]
}
// Lifecycle adapter keeps old layer events and disposed maps from updating UI.
export function createRasterMap(L, element, status, reducedMotion = false, onPick = () => {}) {
  const map = L.map(element, { zoomAnimation: !reducedMotion, fadeAnimation: !reducedMotion }).setView([0, 20], 2)
  let tiles, marker, disposed = false, serial = 0, picking = false, selectedPoint = null
  function select(coordinates) {
    if (disposed || !picking || !coordinates || !Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) return
    picking = false
    onPick({ latitude: Math.max(-85.05112878, Math.min(85.05112878, coordinates.lat)), longitude: Math.abs(coordinates.lng) <= 180 ? coordinates.lng : ((coordinates.lng + 180) % 360 + 360) % 360 - 180 })
  }
  map.on('click', event => select(event.latlng))
  function setLayer(mode, date) {
    if (disposed) return
    const config = rasterConfig(mode, date), token = ++serial
    if (tiles) { tiles.off(); map.removeLayer(tiles) }
    let loaded = 0, failed = 0
    status('Loading requested tiles…')
    tiles = L.tileLayer(config.url, config.options)
    const publish = text => { if (!disposed && token === serial) status(text) }
    tiles.on('loading', () => { loaded = 0; failed = 0; publish('Loading requested tiles…') })
    tiles.on('tileload', () => { loaded++ })
    tiles.on('tileerror', () => { failed++; publish('Some tiles unavailable. Try another date or road view.') })
    tiles.on('load', () => publish(failed ? `${failed} tile request(s) failed. Coverage incomplete.` : loaded ? mode === 'satellite' ? 'Tiles received for this view. Clouds or missing imagery may still obscure the area.' : 'Road tiles received for this view. OpenStreetMap contributors.' : 'No tiles received for this view.'))
    tiles.addTo(map)
  }
  function setPoint(point) {
    const coordinates = mapPoint(point)
    if (!coordinates || disposed) return
    selectedPoint = coordinates
    if (marker) marker.setLatLng(coordinates)
    else marker = L.circleMarker(coordinates, { radius: 8, color: '#fff', weight: 3, fillColor: '#c18b20', fillOpacity: 1 }).addTo(map).bindTooltip('Your approximate forecast area')
    map.setView(coordinates, 7, { animate: false })
  }
  return { setLayer, setPoint, setPicking(value) { picking = Boolean(value) }, selectCenter() { if (!disposed && picking) select(map.getCenter()) }, recenter() { if (!disposed && selectedPoint) map.setView(selectedPoint, 7, { animate: false }) }, resize() { if (!disposed) map.invalidateSize() }, destroy() { if (disposed) return; disposed = true; serial++; if (tiles) tiles.off(); map.remove() } }
}
