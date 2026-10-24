<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { CloudSun, CloudRain, Sun, Snowflake, Droplets, RefreshCw, Check, X, MapPin, Bell, Sprout, ShieldCheck } from 'lucide-vue-next'
import { weatherAdvice } from '../utils/farm-watch.js'
import FarmSatelliteMap from './FarmSatelliteMap.vue'

const props = defineProps({ user: { type: Object, required: true } })
const emit = defineEmits(['unread-change'])
const account = computed(() => String(props.user?.id || props.user?._id || props.user?.email || ''))
const enterprises = computed(() => Array.isArray(props.user.mainEnterprises) ? props.user.mainEnterprises.join(', ') : props.user.mainEnterprises || 'your crops and livestock')
const latitude = ref(''), longitude = ref(''), country = ref(''), location = ref(null)
const manual = ref(false), locating = ref(false), locationError = ref('')
const mapWorkspace = ref(null), detailTab = ref('weather')
function chooseOnMap() { cancelGeo(); locationError.value = ''; mapWorkspace.value?.chooseOnMap() }
function selectMapPoint(point) { cancelGeo(); usePoint(point.latitude, point.longitude) }
const forecast = ref(null), health = ref(null), weatherError = ref(''), healthError = ref('')
const weatherBusy = ref(false), healthBusy = ref(false)
const read = ref([]), dismissed = ref([]), storageWarning = ref('')
const browserMessage = ref(''), browserEnabled = ref(false)
let active = false, generation = 0, geoGeneration = 0, geoTimer, timer, lastRefresh = 0
function cancelGeo() { geoGeneration++; clearTimeout(geoTimer); geoTimer = undefined; locating.value = false }
const controllers = new Set(), seen = { weather: new Set(), health: new Set() }
const initialized = { weather: false, health: false }
const advice = computed(() => forecast.value ? weatherAdvice(forecast.value, props.user) : [])
const notifications = computed(() => [
  ...advice.value.filter(item => item.level === 'watch').map(item => ({ ...item, key: `weather:${item.id}` })),
  ...(health.value?.items || []).map(item => ({ ...item, key: `health:${item.id}` }))
].filter(item => !dismissed.value.includes(item.key)))
const unread = computed(() => notifications.value.filter(item => !read.value.includes(item.key)).length)
watch(unread, value => emit('unread-change', value), { immediate: true })
const busy = computed(() => weatherBusy.value || healthBusy.value)
function safeUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null } catch { return null }
}
function time(value) { const date = new Date(value); return value && Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Not available' }
function dayLabel(value) { const date = new Date(`${value}T12:00:00`); return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : value }
function weatherIcon(day) {
  if (day.rain > 0) return CloudRain
  if (Number.isFinite(day.min) && day.min <= 2) return Snowflake
  if (day.max >= 35) return Sun
  return CloudSun
}
function weatherIdentity(day) {
  if (day.rain > 0) return 'Rain in forecast'
  if (Number.isFinite(day.min) && day.min <= 2) return 'Cold conditions'
  if (day.max >= 35) return 'Hot conditions'
  if (!Number.isFinite(day.max) || !Number.isFinite(day.min) || !Number.isFinite(day.rain)) return 'Forecast coverage incomplete'
  return 'No heat or rain threshold flagged'
}
function reportDate(item) { return item.datePrecision === 'month' ? String(item.publishedAt || '').slice(0, 7) : String(item.publishedAt || '').slice(0, 10) || 'Date unavailable' }
function storageKey() { return account.value ? `farmbuddy:watch:v1:${encodeURIComponent(account.value)}` : null }
function loadStored() {
  read.value = []; dismissed.value = []; storageWarning.value = ''
  if (!storageKey()) { storageWarning.value = 'No account identifier available. Notification choices are kept only for this visit.'; return }
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey()) || '{}')
    for (const [key, target] of [['read', read], ['dismissed', dismissed]]) target.value = Array.isArray(saved[key]) ? saved[key].filter(id => typeof id === 'string' && id.length < 500).slice(-300) : []
  } catch { storageWarning.value = 'Notification history could not be loaded. Choices may not survive this visit.' }
}
function saveStored() {
  read.value = read.value.slice(-300); dismissed.value = dismissed.value.slice(-300)
  if (!storageKey()) return
  try { localStorage.setItem(storageKey(), JSON.stringify({ read: read.value, dismissed: dismissed.value })) }
  catch { storageWarning.value = 'Notification choices could not be saved on this device. They remain active for this visit.' }
}
function markRead(key) { if (!read.value.includes(key)) read.value.push(key); saveStored() }
function dismiss(key) { if (!dismissed.value.includes(key)) dismissed.value.push(key); saveStored() }
function currentItem(item) {
  if (item.kind === 'weather') return typeof item.date === 'string' && item.date.slice(0, 10) >= new Date().toISOString().slice(0, 10)
  const date = Date.parse(item.publishedAt)
  return item.datePrecision === 'day' && Number.isFinite(date) && date <= Date.now() && Date.now() - date <= 7 * 86400000
}
function deliver(channel, items) {
  const baseline = initialized[channel]
  for (const item of items) {
    const key = `${channel}:${item.id}`
    if (baseline && !seen[channel].has(key) && browserEnabled.value && currentItem(item) && !read.value.includes(key) && !dismissed.value.includes(key) && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification(item.title, { body: channel === 'health' ? `${item.source} · ${item.scope} report. Open Farm watch for context.` : item.body, tag: key }) } catch { browserMessage.value = 'This browser could not display a notification. Your updates are still available here.' }
    }
    seen[channel].add(key)
  }
  initialized[channel] = true
  if (seen[channel].size > 1000) seen[channel] = new Set([...seen[channel]].slice(-1000))
}
async function enableBrowser() {
  if (browserEnabled.value) { browserEnabled.value = false; browserMessage.value = 'Browser updates paused for this visit.'; return }
  if (!('Notification' in window) || !window.isSecureContext) { browserMessage.value = 'Browser notifications are unavailable here. Use the notification center below.'; return }
  const token = generation
  try {
    const permission = await Notification.requestPermission()
    if (!active || token !== generation) return
    browserEnabled.value = permission === 'granted'
    browserMessage.value = permission === 'granted' ? 'Enabled for this visit. Only new, current updates after the first successful check will be sent.' : 'Permission was not granted. You can still read all updates below.'
  } catch { if (active && token === generation) browserMessage.value = 'Notification permission could not be requested. Updates remain available below.' }
}
async function request(channel, point, code, token) {
  const controller = new AbortController(); controllers.add(controller)
  const isWeather = channel === 'weather'
  const loading = isWeather ? weatherBusy : healthBusy, error = isWeather ? weatherError : healthError
  loading.value = true; error.value = ''
  try {
    const result = await $fetch(isWeather ? '/api/weather' : '/api/health-alerts', { method: 'POST', body: { ...point, ...(!isWeather && code ? { countryCode: code } : {}) }, signal: controller.signal, timeout: 25000 })
    if (!active || token !== generation) return
    if (isWeather) {
      if (!Array.isArray(result?.days)) throw new Error('Invalid forecast')
      forecast.value = result
      deliver(channel, weatherAdvice(result, props.user).filter(item => item.level === 'watch'))
    } else {
      if (!Array.isArray(result?.items) || !Array.isArray(result?.sources)) throw new Error('Invalid health reports')
      health.value = result; deliver(channel, result.items)
    }
  } catch {
    if (active && token === generation && !controller.signal.aborted) {
      error.value = isWeather ? 'Weather is unavailable. Try again. Health reports are checked independently.' : 'Disease reports are unavailable. This does not mean there are no outbreaks. Weather is checked independently.'
      if (isWeather) forecast.value = null
      else health.value = null
    }
  } finally { controllers.delete(controller); if (active && token === generation) loading.value = false }
}
function refresh() {
  if (!location.value || busy.value) return
  const code = country.value.trim().toUpperCase()
  if (code && !/^[A-Z]{2}$/.test(code)) { locationError.value = 'Use a two-letter ISO country code, or leave it blank.'; return }
  locationError.value = ''; lastRefresh = Date.now()
  const token = generation, point = { ...location.value }
  void request('weather', point, code, token); void request('health', point, code, token)
}
function usePoint(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { locationError.value = 'Enter latitude from -90 to 90 and longitude from -180 to 180.'; return }
  for (const controller of controllers) controller.abort()
  generation++; weatherBusy.value = false; healthBusy.value = false
  forecast.value = null; health.value = null
  location.value = { latitude: Math.round(lat * 10) / 10, longitude: Math.round(lon * 10) / 10 }
  latitude.value = String(location.value.latitude); longitude.value = String(location.value.longitude)
  refresh()
}
function submitManual() {
  cancelGeo()
  if (String(latitude.value).trim() === '' || String(longitude.value).trim() === '') { locationError.value = 'Enter both coordinates. No location is assumed.'; return }
  usePoint(Number(latitude.value), Number(longitude.value))
}
function locate() {
  cancelGeo()
  const token = geoGeneration
  locationError.value = ''
  if (!window.isSecureContext) { locationError.value = 'Browser location needs a secure connection (HTTPS or localhost). Choose on map or enter coordinates instead.'; return }
  if (!navigator.geolocation) { locationError.value = 'Browser location is unavailable. Choose on map or enter coordinates instead.'; return }
  locating.value = true
  const fail = error => {
    if (!active || token !== geoGeneration) return
    cancelGeo()
    const reason = error?.code === 1 ? 'Location permission was denied. Allow location in your browser’s site settings to retry.'
      : error?.code === 3 ? 'Finding your location timed out. Try again outdoors or with a better connection.'
      : 'Your browser could not determine your location. Check device location services and try again.'
    locationError.value = `${reason} Choose on map or enter coordinates instead.`
  }
  // Browser acquisition timeouts may not cover waiting for permission.
  geoTimer = setTimeout(() => fail({ code: 3 }), 15000)
  try { navigator.geolocation.getCurrentPosition(position => {
    if (!active || token !== geoGeneration) return
    cancelGeo(); usePoint(position.coords.latitude, position.coords.longitude)
  }, fail, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }) }
  catch (error) { fail(error) }
}
function visibleRefresh() { if (document.visibilityState === 'visible' && location.value && Date.now() - lastRefresh >= 15 * 60000) refresh() }
function reset() {
  generation++; cancelGeo(); controllers.forEach(controller => controller.abort()); controllers.clear()
  detailTab.value = 'weather'; manual.value = false
  location.value = null; latitude.value = ''; longitude.value = ''; country.value = ''; locating.value = false
  forecast.value = null; health.value = null; weatherBusy.value = false; healthBusy.value = false
  weatherError.value = ''; healthError.value = ''; locationError.value = ''; browserEnabled.value = false; browserMessage.value = ''
  for (const channel of ['weather', 'health']) { seen[channel].clear(); initialized[channel] = false }
}
watch(account, () => { reset(); if (active) loadStored() }, { flush: 'sync' })
onMounted(() => { active = true; loadStored(); timer = setInterval(visibleRefresh, 60000); document.addEventListener('visibilitychange', visibleRefresh) })
onBeforeUnmount(() => { active = false; reset(); clearInterval(timer); document.removeEventListener('visibilitychange', visibleRefresh) })
</script>

<template>
  <div class="farm-watch">
    <header class="workspace-heading"><div class="watch-identity"><h2>Farm watch</h2><p>Explore your area. Plan your farm day.</p></div><div class="actions"><button class="primary location-primary" :disabled="locating" @click="locate"><MapPin :size="20" />{{ locating ? 'Finding your area…' : 'Use my location' }}</button><button @click="chooseOnMap">Choose on map</button></div></header>
    <p v-if="locationError" role="alert" class="warning">{{ locationError }}</p>
    <div class="actions"><button :aria-expanded="manual" @click="manual = !manual">Enter coordinates instead</button></div>
    <form v-if="manual" class="manual" @submit.prevent="submitManual"><label>Latitude<input v-model="latitude" type="number" min="-90" max="90" step="any" required /></label><label>Longitude<input v-model="longitude" type="number" min="-180" max="180" step="any" required /></label><button type="submit">Use coordinates</button></form>
    <div class="map-workspace">
      <FarmSatelliteMap :key="account" :point="location" ref="mapWorkspace" @point-select="selectMapPoint" />
      <aside class="area-rail panel" aria-label="Current area details">
        <MapPin :size="24" /><h3>Current area</h3><strong>{{ location ? `${location.latitude}°, ${location.longitude}°` : 'No area selected' }}</strong><p class="fine">{{ location ? 'Approximate forecast point · rounded to 0.1°' : 'Use your location or choose a point on the map.' }}</p>
        <div class="rail-weather"><h4>Next forecast period</h4><p v-if="weatherBusy" role="status">Checking weather…</p><p v-else-if="weatherError" class="fine">{{ weatherError }}</p><template v-else-if="forecast?.days?.length"><component :is="weatherIcon(forecast.days[0])" :size="38" aria-hidden="true"/><strong class="rail-temperature">{{ forecast.days[0].max ?? 'Unavailable' }}°C</strong><p>{{ dayLabel(forecast.days[0].date) }}</p><p class="fine">{{ weatherIdentity(forecast.days[0]) }}<br/>{{ forecast.days[0].rain ?? 'Unavailable' }} mm across {{ forecast.days[0].coverageHours ?? 'unknown' }} forecast hours. {{ forecast.days[0].partial ? 'Partial day.' : 'Available-period forecast.' }}</p><p class="fine">{{ forecast.source || 'OpenWeather' }}<br/>Checked {{ time(forecast.checkedAt) }}</p></template><p v-else class="fine">Choose an area to request real weather. No sample weather is shown.</p></div>
        <h4>Data status</h4><p class="fine">Weather: {{ weatherBusy ? 'Checking' : forecast ? 'Forecast received' : 'Not available' }}<br/>Health: {{ healthBusy ? 'Checking' : health ? `${health.items.length} sourced reports` : 'Not available' }}</p><button v-if="location" :disabled="busy" @click="refresh"><RefreshCw :size="16"/>Refresh updates</button>
        <details><summary>Location privacy & report settings</summary><p class="fine">Coordinates are rounded to 0.1° before requests. Your area stays in memory for this visit, not on your profile. No automatic geolocation. Checks refresh at most every 15 minutes while visible.</p><label class="country">Country code <span>(optional)</span><input v-model="country" maxlength="2" placeholder="ISO2" autocomplete="off" aria-describedby="country-help"/><small id="country-help">Two-letter ISO code helps country reporting. Refresh to apply.</small></label><p class="fine">Planning for {{ enterprises }}. General advice, not diagnosis. Satellite images are regional, not live field health.</p></details>
      </aside>
    </div>
    <nav class="detail-tabs" aria-label="Farm watch details"><button :aria-pressed="detailTab === 'weather'" @click="detailTab = 'weather'">Forecast & planning</button><button :aria-pressed="detailTab === 'health'" @click="detailTab = 'health'">Health reports</button><button :aria-pressed="detailTab === 'notifications'" @click="detailTab = 'notifications'">Notifications ({{ unread }})</button></nav>
    <section v-if="detailTab === 'weather'" class="panel" aria-live="polite" :aria-busy="weatherBusy">
      <div class="section-title"><CloudSun :size="23" /><h3>Weather & everyday decisions</h3><span v-if="weatherBusy" class="badge">Checking…</span></div>
      <p v-if="weatherError" role="alert" class="warning">{{ weatherError }}</p>
      <p v-else-if="weatherBusy" role="status" class="empty">Checking the forecast for your chosen area…</p>
      <div v-else-if="!forecast" class="empty forecast-empty"><CloudSun :size="48" :stroke-width="1.3" aria-hidden="true" /><div><h4>Your forecast belongs here</h4><p>Choose an area to see a real forecast and practical planning notes. No sample weather is shown.</p></div></div>
      <template v-if="forecast">
        <p class="fine">{{ forecast.source || 'OpenWeather' }} · Checked {{ time(forecast.checkedAt) }} · {{ forecast.timezone }} · Area {{ forecast.latitude }}, {{ forecast.longitude }}</p>
        <div class="forecast"><article v-for="day in forecast.days" :key="day.date" :class="['day', { 'day-watch': day.max >= 35 || (Number.isFinite(day.min) && day.min <= 2) || day.rain >= 20 }]"><h4>{{ dayLabel(day.date) }}</h4><component :is="weatherIcon(day)" :size="40" :stroke-width="1.5" aria-hidden="true" /><p class="weather-description">{{ weatherIdentity(day) }}</p><strong>{{ day.max ?? 'Unavailable' }}°<span>C</span></strong><p>Available-period low {{ day.min ?? 'Unavailable' }}°C</p><p class="rain-measure"><Droplets :size="16" aria-hidden="true" />{{ day.rain ?? 'Unavailable' }} mm rain across {{ day.coverageHours }} forecast hours</p><p>{{ day.partial ? 'Partial day' : 'Eight three-hour periods' }} · Available-period temperatures</p><p>Mean humidity {{ day.humidity ?? 'Unavailable' }}% · Max wind {{ day.wind ?? 'Unavailable' }} m/s</p><span v-for="indicator in day.indicators || []" :key="indicator" class="indicator">{{ indicator }}</span></article></div>
        <div class="advisory-heading"><Sprout :size="21" /><h3>What this means for your farm</h3><span>{{ advice.filter(item => item.level === 'watch').length }} weather watches</span></div><div class="advice"><article v-for="item in advice" :key="item.id" :class="['advice-card', { watch: item.level === 'watch' }]"><span class="badge">{{ item.level === 'watch' ? 'Weather watch' : 'Planning note' }} · {{ item.date }}</span><h4>{{ item.title }}</h4><p>{{ item.body }}</p></article></div>
        <details><summary>Weather source & forecast limits</summary><p class="fine">Provider: {{ forecast.source || 'OpenWeather' }}. Weather data: <a href="https://openweathermap.org/" target="_blank" rel="noopener noreferrer">OpenWeather</a> (<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>). Five-day, three-hour forecast aggregated by provider UTC offset, not full-day measured extremes. First and last days may be partial. Planning notes by FarmBuddy. Forecasts are uncertain. Weather conducive to disease is not a confirmed outbreak.</p></details>
      </template>
    </section>

    <section v-if="detailTab === 'health'" class="panel" aria-live="polite" :aria-busy="healthBusy">
      <div class="section-title"><ShieldCheck :size="23" /><h3>Plant & livestock health</h3><span v-if="healthBusy" class="badge">Checking…</span></div>
      <p class="fine">Reports may cover a country or the world. A report is not evidence of disease on your farm. No treatment doses or disease diagnoses are provided.</p>
      <p v-if="healthError" role="alert" class="warning">{{ healthError }}</p>
      <p v-else-if="!health" class="empty">Choose an area to check available reporting sources. Country reports are more useful when you provide a country code.</p>
      <template v-if="health">
        <p class="fine">Checked {{ time(health.checkedAt) }}</p>
        <p v-if="!health.items.length" class="empty">No reports returned by the available sources for this check. This does not establish that your area is disease-free.</p>
        <div class="reports"><article v-for="item in health.items" :key="item.id" class="report"><div class="badge">{{ item.kind === 'plants' ? 'Plant health' : 'Animal health' }} · {{ item.scope === 'nearby' ? 'Nearby report' : item.scope === 'country' ? 'Country report, not farm-level' : 'Global report, not a nearby alert' }}</div><h4>{{ item.title }}</h4><p v-if="item.summary">{{ item.summary }}</p><p class="fine">Published {{ reportDate(item) }}{{ item.datePrecision === 'month' ? ' (month only)' : '' }} · {{ item.source }}</p><a v-if="safeUrl(item.sourceUrl)" :href="safeUrl(item.sourceUrl)" target="_blank" rel="noopener noreferrer">Read source report ↗</a><span v-else class="fine">Source link unavailable</span></article></div>
        <ul class="sources"><li v-for="source in health.sources" :key="source.name"><a v-if="safeUrl(source.url)" :href="safeUrl(source.url)" target="_blank" rel="noopener noreferrer">{{ source.name }}</a><strong v-else>{{ source.name }}</strong> · {{ source.status === 'ok' ? 'Available' : source.status === 'not-configured' ? 'Not configured' : 'Unavailable' }}<span v-if="source.message">: {{ source.message }}</span></li></ul>
        <p v-if="!health.sources.length || health.sources.some(source => source.status !== 'ok')" class="warning">Reporting coverage is incomplete. Missing or unavailable sources cannot confirm absence of disease.</p>
      </template>
      <details><summary>Health sources & help</summary><p class="fine">Official references: <a href="https://wahis.woah.org/" target="_blank" rel="noopener noreferrer">WOAH</a> · <a href="https://www.ippc.int/" target="_blank" rel="noopener noreferrer">IPPC</a> · <a href="https://www.eppo.int/" target="_blank" rel="noopener noreferrer">EPPO</a>. For suspected disease, contact your local extension service, plant-health authority or veterinarian.</p></details>
    </section>

    <section v-if="detailTab === 'notifications'" class="panel notifications" aria-live="polite">
      <div class="section-title"><Bell :size="23" /><h3>Your notification center</h3><span class="badge">{{ unread }} unread</span></div>
      <p class="fine">Weather watches and sourced health reports only. Updates while this page is open; no background push/SMS. Browser delivery is optional, for this visit only, and excludes old or month-only health reports.</p>
      <button @click="enableBrowser"><Bell :size="17" />{{ browserEnabled ? 'Pause browser notifications' : 'Enable browser notifications' }}</button><p v-if="browserMessage" role="status" class="fine">{{ browserMessage }}</p>
      <p v-if="storageWarning" role="alert" class="warning">{{ storageWarning }}</p>
      <p v-if="!notifications.length" class="empty">No active notifications to show. Check the source availability above before drawing conclusions.</p>
      <article v-for="item in notifications" :key="item.key" :class="['notification', { unread: !read.includes(item.key) }]"><div><span class="badge">{{ item.kind === 'weather' ? 'Weather watch' : `${item.kind === 'plants' ? 'Plant' : 'Animal'} health · ${item.scope}` }} · {{ read.includes(item.key) ? 'Read' : 'Unread' }}</span><h4>{{ item.title }}</h4><p>{{ item.body || item.summary }}</p><p class="fine">{{ item.kind === 'weather' ? item.date : `${item.source} · ${reportDate(item)}` }}</p><a v-if="item.kind !== 'weather' && safeUrl(item.sourceUrl)" :href="safeUrl(item.sourceUrl)" target="_blank" rel="noopener noreferrer">Read source ↗</a></div><div class="actions"><button v-if="!read.includes(item.key)" :aria-label="`Mark ${item.title} as read`" @click="markRead(item.key)"><Check :size="17" />Mark read</button><button :aria-label="`Dismiss ${item.title}`" @click="dismiss(item.key)"><X :size="17" />Dismiss</button></div></article>
    </section>
  </div>
</template>

<style scoped>
.farm-watch{display:grid;gap:24px;color:#203e30;min-width:0}.panel{background:#fff;border:1px solid #dce5d5;border-radius:22px;padding:clamp(20px,4vw,32px);min-width:0}.intro{background:linear-gradient(120deg,#edf3e5,#faf8ed);position:relative}.eyebrow{display:flex;align-items:center;gap:8px;color:#60724b;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}h2{font-size:clamp(27px,4vw,36px);font-weight:750;letter-spacing:-.04em;margin:12px 0}h3{font-size:18px;font-weight:700}h4{font-size:14px;font-weight:700;margin:10px 0}.lead{max-width:650px;font-size:15px;line-height:1.8;color:#536850}.scope{display:flex;align-items:flex-start;gap:10px;margin:20px 0 12px;font-size:13px;line-height:1.7}.scope svg{flex-shrink:0;margin-top:3px}.fine{font-size:12px;line-height:1.9;color:#66745f;margin:12px 0;overflow-wrap:anywhere}.actions{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}button{display:inline-flex;align-items:center;justify-content:center;gap:9px;border:1px solid #cddac3;background:#f6f8f0;padding:11px 15px;border-radius:11px;font-size:12px;font-weight:700;cursor:pointer}.primary{color:white;background:#17613e;border-color:#17613e}button:disabled{opacity:.55;cursor:wait}label{display:flex;flex-direction:column;gap:7px;font-size:12px;font-weight:650}input{background:#fff;border:1px solid #cdd7c4;border-radius:9px;padding:11px;min-width:0;width:100%;color:#203e30}label.country{margin:20px 0;max-width:490px;display:grid;grid-template-columns:auto 1fr 80px;align-items:center;gap:8px}label.country span{font-weight:400}label.country small{grid-column:1/-1;font-weight:400;line-height:1.8;color:#66745f}.country input{text-transform:uppercase}details{margin-top:18px}summary{font-size:12px;cursor:pointer;text-decoration:underline;text-underline-offset:4px}.manual{display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end;margin-top:18px}.section-title{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.section-title svg{color:#587b42}.badge{display:inline-block;background:#eef3e7;color:#526743;padding:5px 9px;border-radius:8px;font-size:11px;line-height:1.6}.empty{color:#6b7861;font-size:13px;line-height:1.9;padding:18px 0}.warning{background:#fff4dc;color:#795616;border:1px solid #ead7a7;border-radius:10px;padding:12px;font-size:12px;line-height:1.8;margin:14px 0}.forecast{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin:22px 0}.day{background:#f5f8ef;border:1px solid #e3e9d9;border-radius:15px;padding:16px}.day h4{margin:0 0 18px}.day strong{font-size:28px;letter-spacing:-.05em}.day strong span{font-size:15px}.day p{font-size:12px;line-height:1.9;color:#68765f}.indicator{display:block;background:#f6eac8;color:#775d23;border-radius:7px;margin-top:10px;padding:6px;font-size:11px}.advice,.reports{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr));gap:14px}.advice-card,.report{border:1px solid #e0e8d8;border-radius:14px;padding:18px}.advice-card.watch{background:#fffbef;border-color:#e8d6a2}.advice-card p,.report p,.notification p{font-size:13px;line-height:1.9;color:#65745d}.sources{font-size:12px;line-height:2;color:#65745d;padding-top:16px;overflow-wrap:anywhere}a{text-decoration:underline;text-underline-offset:3px;color:#276746;font-size:12px}.notification{border-top:1px solid #e3e9da;margin-top:18px;padding:18px 0 0}.notification.unread{border-left:3px solid #b69a45;padding-left:16px}.notification .actions{margin-bottom:0}button:focus-visible,input:focus-visible,summary:focus-visible,a:focus-visible{outline:3px solid #b49940;outline-offset:4px}@media(max-width:550px){.manual{grid-template-columns:1fr}.section-title h3{font-size:16px}.actions button{width:100%}.forecast{grid-template-columns:repeat(2,minmax(0,1fr))}.country{max-width:100%}}

.watch-identity{display:grid;grid-template-columns:1fr minmax(140px,280px);align-items:center;gap:24px;margin-bottom:24px}.weather-landscape{width:100%;border-radius:26px;max-height:210px}.watch-identity h2{font-size:15px;letter-spacing:0;margin:0 0 14px;color:#476647}.watch-identity .lead{font-size:clamp(28px,4vw,44px);line-height:1.15;font-weight:750;letter-spacing:-.045em;color:#174b31;margin:0}.intro-note{font-size:13px;line-height:1.8;max-width:38ch;margin-top:16px;color:#53664d}.intro{background:#edf3e5}.location-consent{background:#fff;border:1px solid #cddbc2;border-radius:20px;padding:clamp(16px,3vw,24px)}.report-settings{margin:0}.report-settings summary{color:#526743}.scope{margin-bottom:0}.farm-watch{font-family:'Plus Jakarta Sans',sans-serif}button,summary{min-height:44px}summary{align-content:center;line-height:1.7;padding:8px 0}.fine{color:#52634c}.day svg{color:#416b44;margin:0 0 9px}.day-watch{background:#fff8df;border-color:#d9bf68}.day .weather-description{font-size:12px;min-height:40px;color:#3f5a3c;line-height:1.6}.day strong{display:block;font-size:36px;margin:12px 0}.day .rain-measure{display:flex;gap:5px;align-items:flex-start}.rain-measure svg{flex-shrink:0;margin:3px 0}.advisory-heading{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:30px 0 16px}.advisory-heading span{font-size:12px;color:#56664c}.advice-card.watch{border-left:5px solid #c29725}.forecast-empty{display:flex;gap:20px;align-items:center;background:#f3f6ee;border-radius:18px;padding:26px;margin-top:20px}.forecast-empty>svg{flex-shrink:0;color:#718664}.forecast-empty h4{font-size:16px;color:#345738;margin-top:0}.notifications{background:#f8faf4}.notifications .section-title{margin-bottom:12px}.forecast{grid-template-columns:repeat(auto-fit,minmax(155px,1fr))}.day{min-width:0}.day h4{line-height:1.7}.panel{overflow-wrap:anywhere}@media(max-width:550px){.watch-identity{grid-template-columns:1fr;gap:12px}.weather-landscape{max-width:220px;justify-self:end;max-height:130px;margin-top:-8px}.forecast{grid-template-columns:1fr 1fr}.day{padding:12px}.day strong{font-size:29px}.forecast-empty{align-items:flex-start;gap:12px;padding:18px}.location-consent .actions button{white-space:normal}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}

.workspace-heading{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap}.workspace-heading .watch-identity{display:block;margin:0}.workspace-heading h2{font-size:28px;margin:0;color:#174b31}.workspace-heading p{font-size:13px;color:#52634c;margin:8px 0}.workspace-heading .actions{margin:0}.location-primary{min-height:48px;padding:14px 22px;font-size:14px}.map-workspace{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:16px;align-items:start}.area-rail.panel{padding:22px;background:#f5f8ee}.area-rail h3{margin:12px 0}.area-rail strong{font-variant-numeric:tabular-nums}.rail-weather{border-top:1px solid #d9e4ce;border-bottom:1px solid #d9e4ce;padding:12px 0;margin:18px 0}.rail-temperature{display:block;font-size:34px;color:#174b31;margin:10px 0}.rail-weather>p{font-size:12px}.area-rail label.country{display:flex;align-items:stretch}.detail-tabs{display:flex;flex-wrap:wrap;gap:8px}.detail-tabs button[aria-pressed=true]{background:#f3d875;color:#25452e;border-color:#dbc15f}button{transition:background-color 160ms ease-out}button:active{transform:scale(.98)}@media(max-width:900px){.map-workspace{grid-template-columns:minmax(0,1fr) 235px}.area-rail.panel{padding:16px}}@media(max-width:700px){.map-workspace{grid-template-columns:1fr}.workspace-heading .actions{width:100%}.area-rail.panel{display:block}.detail-tabs button{flex:1}.workspace-heading .watch-identity{margin:0}}@media(prefers-reduced-motion:reduce){button{transition:none}}
</style>
