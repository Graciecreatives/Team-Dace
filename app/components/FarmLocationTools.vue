<script setup>
import { CloudSun, MapPin, Users, LoaderCircle } from 'lucide-vue-next'
const props = defineProps({ user: { type: Object, required: true }, mode: { type: String, default: 'weather' } })
const latitude = ref(''), longitude = ref(''), radius = ref(100)
const forecast = ref(null), farmers = ref([]), searched = ref(false), community = ref({ profile: {}, requests: [] })
const error = ref(''), message = ref(''), busy = ref(false), locating = ref(false), mapPoint = ref(null)
const sharing = reactive({ displayName: props.user.farmName || '', bio: '', contact: '', consent: false })
const issue = cause => cause?.data?.statusMessage || cause?.data?.message || cause?.message || 'Unable to complete this action. Please try again.'
function point() {
  if (latitude.value === '' || longitude.value === '') throw new Error('Enter your approximate coordinates or choose Use my location.')
  const lat = Number(latitude.value), lon = Number(longitude.value)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Enter valid latitude and longitude.')
  return { latitude: Math.round(lat * 10) / 10, longitude: Math.round(lon * 10) / 10 }
}
function locate() {
  error.value = ''
  if (!navigator.geolocation) { error.value = 'Location is unavailable. Enter coordinates manually instead.'; return }
  locating.value = true
  navigator.geolocation.getCurrentPosition(position => {
    latitude.value = String(Math.round(position.coords.latitude * 10) / 10)
    longitude.value = String(Math.round(position.coords.longitude * 10) / 10)
    locating.value = false
  }, () => { error.value = 'Location was not shared. You can still enter approximate coordinates manually.'; locating.value = false }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 })
}
async function loadCommunity() {
  community.value = await $fetch('/api/community')
  const profile = community.value.profile
  Object.assign(sharing, { displayName: profile.displayName || props.user.farmName || '', bio: profile.bio || '', contact: profile.contact || '', consent: false })
  if (profile.latitude != null) latitude.value = String(profile.latitude)
  if (profile.longitude != null) longitude.value = String(profile.longitude)
}
onMounted(async () => { if (props.mode === 'community') { try { await loadCommunity() } catch (cause) { error.value = issue(cause) } } })
async function weather() {
  error.value = ''; message.value = ''; busy.value = true; forecast.value = null
  try { forecast.value = await $fetch('/api/weather', { method: 'POST', body: point() }) } catch (cause) { error.value = issue(cause) } finally { busy.value = false }
}
async function search() {
  error.value = ''; message.value = ''; busy.value = true; mapPoint.value = null; farmers.value = []
  try { const result = await $fetch('/api/community', { method: 'POST', body: { action: 'search', ...point(), radiusKm: Number(radius.value) } }); farmers.value = result.farmers; searched.value = true } catch (cause) { error.value = issue(cause) } finally { busy.value = false }
}
async function communityAction(action, extra = {}) {
  if (action === 'hide' && !window.confirm('Hide your farmer profile and remove its shared location and contact details?')) return
  if (action === 'block' && !window.confirm('Block this farmer? You will no longer appear to each other.')) return
  error.value = ''; message.value = ''; busy.value = true
  try {
    const body = action === 'publish' ? { action, ...point(), ...sharing } : { action, ...extra }
    community.value = await $fetch('/api/community', { method: 'POST', body })
    message.value = ({ publish: 'Your approximate farmer profile is now discoverable.', hide: 'Your profile is hidden and its shared location and contact details were removed.', request: 'Connection request saved. Your contact is shared only after acceptance.', respond: 'Connection updated.', block: 'Farmer blocked.' })[action]
    if (['hide', 'block'].includes(action)) { farmers.value = []; searched.value = false; mapPoint.value = null }
  } catch (cause) { error.value = issue(cause) } finally { busy.value = false }
}
const mapUrl = computed(() => {
  if (!mapPoint.value) return ''
  const lat = Math.max(-85, Math.min(85, mapPoint.value.latitude)), lon = mapPoint.value.longitude
  const bbox = [Math.max(-180, lon - .15), Math.max(-85.05, lat - .1), Math.min(180, lon + .15), Math.min(85.05, lat + .1)].join(',')
  return `https://www.openstreetmap.org/export/embed.html?${new URLSearchParams({ bbox, layer: 'mapnik', marker: `${lat},${lon}` })}`
})
</script>

<template>
  <div class="location-tools space-y-6">
    <section class="rounded-2xl border border-[#dce5d4] bg-white p-5 sm:p-7">
      <div class="flex items-center gap-3"><component :is="mode === 'weather' ? CloudSun : Users" :size="26" class="text-[#066136]" /><h2 class="text-xl font-bold">{{ mode === 'weather' ? 'Weather-aware farm planning' : 'Find your farming community' }}</h2></div>
      <p class="mt-3 text-sm leading-7 text-[#64745c]">{{ mode === 'weather' ? 'Check a real five-day forecast and in-app heat and rain planning indicators. These are not official emergency warnings or background notifications.' : 'Discover real FarmBuddy farmers who have chosen to share an approximate area. No sample profiles or exact farm pins.' }}</p>
      <p class="mt-2 text-xs leading-6 text-[#7b8972]">Coordinates are rounded to 0.1° (roughly a local area, not an exact address). Use my location requests device permission only when clicked. Weather checks share the rounded area with Open-Meteo, but do not publish it to farmers.</p>
      <form class="mt-5" @submit.prevent="mode === 'weather' ? weather() : search()">
        <div class="grid gap-4 sm:grid-cols-3"><label class="field">Latitude<input v-model="latitude" type="number" step="0.1" min="-90" max="90" required placeholder="e.g. 7.4" /></label><label class="field">Longitude<input v-model="longitude" type="number" step="0.1" min="-180" max="180" required placeholder="e.g. 3.9" /></label><label v-if="mode === 'community'" class="field">Search radius<select v-model="radius"><option :value="25">25 km</option><option :value="50">50 km</option><option :value="100">100 km</option><option :value="200">200 km</option></select></label></div>
        <div class="mt-4 flex flex-wrap gap-3"><button type="button" class="secondary" :disabled="locating || busy" @click="locate"><MapPin :size="15" />{{ locating ? 'Locating…' : 'Use my location' }}</button><button class="primary" :disabled="busy || locating"><LoaderCircle v-if="busy" :size="16" class="animate-spin" />{{ mode === 'weather' ? 'Check weather' : 'Find nearby farmers' }}</button></div>
      </form>
      <p v-if="error" role="alert" class="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{{ error }}</p><p v-if="message" role="status" class="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-900">{{ message }}</p>
    </section>

    <section v-if="mode === 'weather' && forecast" class="rounded-2xl border border-[#dce5d4] bg-white p-5 sm:p-7" aria-live="polite">
      <h3 class="font-bold">Your five-day forecast</h3><p class="mt-2 text-xs text-[#718068]">Area {{ forecast.latitude }}, {{ forecast.longitude }} · {{ forecast.timezone }} · Checked {{ new Date(forecast.checkedAt).toLocaleString() }}</p>
      <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><article v-for="day in forecast.days" :key="day.date" class="rounded-xl border border-[#e3eadc] bg-[#f8faf4] p-4"><h4 class="text-sm font-bold">{{ new Date(day.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) }}</h4><p class="mt-3 text-xl font-bold">{{ day.max }}°C</p><p class="mt-1 text-xs text-[#718068]">Low {{ day.min }}°C · {{ day.rain }} mm</p><p v-for="indicator in day.indicators" :key="indicator" class="mt-3 rounded-lg bg-[#fff0d8] p-2 text-xs leading-5 text-[#8a5819]">{{ indicator }}</p><p v-if="!day.indicators.length" class="mt-3 text-xs leading-5 text-[#718068]">No heat/rain threshold exceeded. Other hazards may still occur.</p></article></div>
      <p class="mt-5 text-xs leading-6 text-[#718068]">Planning thresholds: daily maximum ≥35°C or precipitation ≥20 mm. Forecasts are uncertain and conditions vary by crop, animal, and farm. Check local authorities for warnings.</p>
      <p class="mt-2 text-xs text-[#718068]">Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" class="underline">Open-Meteo</a>, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" class="underline">CC BY 4.0</a>. FarmBuddy derives the planning indicators.</p>
    </section>

    <template v-if="mode === 'community'">
      <section class="rounded-2xl border border-[#dce5d4] bg-white p-5 sm:p-7"><div class="flex flex-wrap items-center justify-between gap-3"><h3 class="font-bold">Your public farmer profile</h3><span class="rounded-full bg-[#edf3e5] px-3 py-1 text-xs">{{ community.profile.visible ? 'Discoverable' : 'Hidden by default' }}</span></div><p class="mt-3 text-xs leading-6 text-[#718068]">Publishing shares your chosen farm name, farming type, introduction, and rounded coordinates with signed-in farmers. Optional contact details are shared only with accepted connections. Do not enter an exact address.</p>
        <form class="mt-4 grid gap-4" @submit.prevent="communityAction('publish')"><label class="field">Public farm name<input v-model="sharing.displayName" maxlength="100" required /></label><label class="field">Introduction<textarea v-model="sharing.bio" maxlength="400" rows="2" placeholder="What do you grow or raise?" /></label><label class="field">Contact for accepted connections only (optional)<input v-model="sharing.contact" maxlength="150" placeholder="A contact detail you choose to share" /></label><label class="flex items-start gap-3 text-xs leading-6"><input v-model="sharing.consent" type="checkbox" required class="mt-1.5" />I agree to share this profile and the rounded coordinates entered above with other signed-in farmers.</label><div class="flex flex-wrap gap-3"><button class="primary" :disabled="busy">{{ community.profile.visible ? 'Update shared profile' : 'Publish my profile' }}</button><button v-if="community.profile.visible" type="button" class="secondary" :disabled="busy" @click="communityAction('hide')">Hide & remove shared details</button></div></form>
      </section>
      <section v-if="searched" class="rounded-2xl border border-[#dce5d4] bg-white p-5 sm:p-7"><h3 class="font-bold">Nearby farmers · {{ farmers.length }}</h3><p v-if="!farmers.length" class="mt-4 text-sm leading-7 text-[#718068]">No opted-in farmers were found in this area. Try a wider radius or invite your farming community to join. We never add made-up profiles.</p><ul v-else class="mt-4 space-y-4"><li v-for="farmer in farmers" :key="farmer.id" class="rounded-xl border border-[#e3eadc] p-4"><h4 class="font-bold">{{ farmer.displayName }}</h4><p class="mt-1 text-xs capitalize text-[#718068]">{{ farmer.farmType }} · Approximately {{ farmer.distanceKm }} km away</p><p class="mt-2 break-words text-sm text-[#718068]">{{ farmer.bio }}</p><div class="mt-3 flex flex-wrap gap-2"><button class="secondary" @click="mapPoint = farmer">Show approximate area on map</button><button class="primary" :disabled="busy" @click="communityAction('request', { targetId: farmer.id })">Request connection</button><button class="secondary" :disabled="busy" @click="communityAction('block', { targetId: farmer.id })">Block farmer</button></div></li></ul></section>
      <section class="rounded-2xl border border-[#dce5d4] bg-white p-5 sm:p-7"><h3 class="font-bold">Area map</h3><p class="mt-2 text-xs leading-6 text-[#718068]">Loading a map shares your IP and selected rounded coordinates with OpenStreetMap. Maps show an approximate area, not a farm address.</p><button class="secondary mt-4" @click="() => { try { mapPoint = point() } catch (cause) { error = issue(cause) } }">Load map for my entered area</button><iframe v-if="mapUrl" :src="mapUrl" title="Approximate farmer area on OpenStreetMap" class="mt-4 h-80 w-full rounded-xl border border-[#dce5d4]" loading="lazy" referrerpolicy="no-referrer" /><p v-if="mapUrl" class="mt-2 text-xs text-[#718068]">Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" class="underline">OpenStreetMap contributors</a></p></section>
      <section class="rounded-2xl border border-[#dce5d4] bg-white p-5 sm:p-7"><h3 class="font-bold">Your connections</h3><p v-if="!community.requests.length" class="mt-3 text-sm text-[#718068]">No requests yet. Connect with an opted-in farmer nearby.</p><ul class="mt-3 space-y-3"><li v-for="request in community.requests" :key="request.id" class="rounded-xl bg-[#f6f8f1] p-4"><p class="text-sm font-bold">{{ request.farmer }} <span class="text-xs font-normal">· {{ request.incoming ? 'Incoming' : 'Sent' }} · {{ request.status }}</span></p><p v-if="request.contact" class="mt-2 break-words text-xs">Shared contact: {{ request.contact }}</p><div v-if="request.incoming && request.status === 'pending'" class="mt-3 flex gap-2"><button class="primary" :disabled="busy" @click="communityAction('respond', { requestId: request.id, status: 'accepted' })">Accept & share my contact</button><button class="secondary" :disabled="busy" @click="communityAction('respond', { requestId: request.id, status: 'declined' })">Decline</button></div><button class="secondary mt-3" :disabled="busy" @click="communityAction('block', { targetId: request.farmerId })">Block this connection</button></li></ul><button class="secondary mt-4" :disabled="busy" @click="async () => { try { await loadCommunity() } catch (cause) { error = issue(cause) } }">Refresh connections</button><p class="mt-3 text-xs text-[#718068]">Connections exchange contact details only after acceptance. In-app farmer messaging is not included.</p></section>
    </template>
  </div>
</template>

<style scoped>
.field{display:flex;flex-direction:column;gap:8px;font-size:12px;font-weight:600;min-width:0}.field input,.field textarea,.field select{width:100%;border:1px solid #d5dfcb;border-radius:10px;background:#fcfdf9;padding:11px 12px;font-size:14px;color:#193d2b;font-weight:400;min-width:0}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:10px;padding:10px 14px;font-size:12px;font-weight:700}.primary{background:#066136;color:white}.secondary{border:1px solid #d5dfcb;background:#f8faf4;color:#275638}button:disabled{opacity:.55;cursor:wait}input:focus-visible,textarea:focus-visible,select:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #b58e27;outline-offset:3px}
</style>
