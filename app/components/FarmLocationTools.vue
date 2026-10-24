<script setup>
import { MapPin, Map as MapIcon, ShieldCheck, Users, Search, UserPlus, EyeOff, RefreshCw, Check, X, Ban, Sprout, CloudSun } from 'lucide-vue-next'
const props = defineProps({ user: { type: Object, required: true }, mode: { type: String, default: 'weather' } })
const latitude = ref(''), longitude = ref(''), radius = ref(100)
const forecast = ref(null), farmers = ref([]), searched = ref(false), community = ref({ profile: {}, requests: [] })
const error = ref(''), message = ref(''), busy = ref(false), locating = ref(false), mapPoint = ref(null)
const loading = ref(false), loaded = ref(false), selectedId = ref('')
const selectedFarmer = computed(() => farmers.value.find(farmer => farmer.id === selectedId.value))
const sharing = reactive({ displayName: props.user?.farmName || '', bio: '', contact: '', consent: false })
const issue = cause => cause?.data?.statusMessage || cause?.data?.message || cause?.message || 'Unable to complete this action. Please try again.'
let generation = 0, controller, disposed = false, mounted = false
const available = () => !disposed && Boolean(props.user?.id) && !busy.value && !locating.value
function clearResults() { farmers.value = []; searched.value = false; selectedId.value = ''; mapPoint.value = null }
function reset() {
  generation++; controller?.abort(); controller = undefined
  busy.value = false; locating.value = false; loading.value = false; loaded.value = false
  latitude.value = ''; longitude.value = ''; radius.value = 100; forecast.value = null
  error.value = ''; message.value = ''; community.value = { profile: {}, requests: [] }
  Object.assign(sharing, { displayName: props.user?.farmName || '', bio: '', contact: '', consent: false })
  clearResults()
}
function applyCommunity(result, hydrate = false) {
  community.value = result
  if (hydrate) {
    const profile = result.profile
    Object.assign(sharing, { displayName: profile.displayName || props.user?.farmName || '', bio: profile.bio || '', contact: profile.contact || '', consent: false })
    latitude.value = profile.latitude == null ? '' : String(profile.latitude)
    longitude.value = profile.longitude == null ? '' : String(profile.longitude)
  }
}
async function run(path, options, apply) {
  if (!available()) return
  const token = ++generation, account = props.user.id, mode = props.mode
  const current = () => !disposed && generation === token && props.user?.id === account && props.mode === mode
  controller = new AbortController()
  busy.value = true; error.value = ''; message.value = ''
  try {
    const result = await $fetch(path, { ...options, signal: controller.signal, timeout: 15000, retry: 0 })
    if (current()) apply(result)
  } catch (cause) { if (current()) error.value = issue(cause) }
  finally { if (current()) { busy.value = false; loading.value = false; controller = undefined } }
}
function point() {
  if (latitude.value === '' || longitude.value === '') throw new Error('Enter your approximate coordinates or choose Use my location.')
  const lat = Number(latitude.value), lon = Number(longitude.value)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Enter valid latitude and longitude.')
  return { latitude: Math.round(lat * 10) / 10, longitude: Math.round(lon * 10) / 10 }
}
function locate() {
  if (!available()) return
  error.value = ''
  if (!navigator.geolocation) { error.value = 'Location is unavailable. Enter coordinates manually instead.'; return }
  const token = ++generation, account = props.user.id, mode = props.mode
  const current = () => !disposed && locating.value && token === generation && props.user?.id === account && props.mode === mode
  locating.value = true
  const failed = () => { if (current()) { error.value = 'Location was not shared. You can still enter approximate coordinates manually.'; locating.value = false } }
  try { navigator.geolocation.getCurrentPosition(position => {
    if (!current()) return
    if (!Number.isFinite(position?.coords?.latitude) || !Number.isFinite(position?.coords?.longitude)) { failed(); return }
    latitude.value = String(Math.round(position.coords.latitude * 10) / 10)
    longitude.value = String(Math.round(position.coords.longitude * 10) / 10)
    locating.value = false
  }, failed, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }) } catch { failed() }
}
async function loadCommunity() {
  if (!available() || props.mode !== 'community') return
  loading.value = true
  await run('/api/community', {}, result => { applyCommunity(result, true); loaded.value = true })
}
watch(() => [props.user?.id, props.mode], () => { reset(); if (mounted && props.mode === 'community' && props.user?.id) loadCommunity() }, { immediate: true, flush: 'sync' })
onMounted(() => { mounted = true; if (props.mode === 'community') loadCommunity() })
onUnmounted(() => { disposed = true; reset() })
async function weather() {
  if (!available() || props.mode !== 'weather') return
  forecast.value = null
  try { await run('/api/weather', { method: 'POST', body: point() }, result => { forecast.value = result }) } catch (cause) { error.value = issue(cause) }
}
async function search() {
  if (!available() || props.mode !== 'community' || !loaded.value) return
  const mapWasOpen = Boolean(mapPoint.value)
  clearResults()
  try { await run('/api/community', { method: 'POST', body: { action: 'search', ...point(), radiusKm: Number(radius.value) } }, result => {
    farmers.value = result.farmers; searched.value = true
    if (mapWasOpen) mapPoint.value = { latitude: result.latitude, longitude: result.longitude }
  }) } catch (cause) { error.value = issue(cause) }
}
async function communityAction(action, extra = {}) {
  if (!available() || props.mode !== 'community' || !loaded.value) return
  if (action === 'hide' && !window.confirm('Hide your farmer profile and remove its shared location and contact details?')) return
  if (action === 'block' && !window.confirm('Block this farmer? You will no longer appear to each other.')) return
  try {
    if (action === 'publish' && !sharing.consent) throw new Error('Location sharing consent is required.')
    const body = action === 'publish' ? { action, ...point(), ...sharing } : { action, ...extra }
    await run('/api/community', { method: 'POST', body }, result => {
      applyCommunity(result, ['publish', 'hide', 'block'].includes(action))
      message.value = ({ publish: 'Your approximate farmer profile is now discoverable.', hide: 'Your profile is hidden and its shared location and contact details were removed.', request: 'Connection request saved. Your contact is shared only after acceptance.', respond: 'Connection updated.', block: 'Farmer blocked.' })[action]
      if (['hide', 'block'].includes(action)) clearResults()
    })
  } catch (cause) { error.value = issue(cause) }
}
function showFarmer(farmer) {
  if (!available() || !farmers.value.some(item => item.id === farmer.id)) return
  selectedId.value = farmer.id
  // Selecting a farmer is not consent to load external map tiles.
  const token = generation
  nextTick(() => { if (!disposed && token === generation) document.getElementById('nearby-farmer-map')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }) })
}
function loadMap() { if (!available()) return; try { error.value = ''; mapPoint.value = point() } catch (cause) { error.value = issue(cause) } }

</script>

<template>
  <div class="location-tools space-y-6">
    <section class="community-intro rounded-2xl border border-[#dce5d4] bg-white p-5 sm:p-7">
      <FbPageHeader :title="mode === 'weather' ? 'Weather-aware farm planning' : 'Your farming neighbourhood'" :description="mode === 'weather' ? 'Check a real five-day forecast and in-app heat and rain planning indicators. These are not official emergency warnings or background notifications.' : 'Discover real FarmBuddy farmers who have chosen to share an approximate area. No sample profiles or exact farm pins.'">
        <template #actions><FbBadge>{{ mode === 'weather' ? 'Approximate area' : 'Opt-in community' }}</FbBadge></template>
      </FbPageHeader>
      <p class="mt-2 text-xs leading-6 text-[#7b8972]">Coordinates are rounded to 0.1° (roughly a local area, not an exact address). Use my location requests device permission only when clicked. Weather checks share the rounded area with OpenWeather, but do not publish it to farmers.</p>
      <div v-if="mode === 'community'" class="privacy-strip"><ShieldCheck :size="20" aria-hidden="true" /><span>Looking around does not make you discoverable. Your sharing status: {{ !loaded ? 'not loaded yet' : community.profile.visible ? 'shared by your choice' : 'private' }}.</span><button v-if="loaded && community.profile.visible" type="button" class="secondary" :disabled="busy || locating" @click="communityAction('hide')"><EyeOff :size="17" />Hide my profile</button></div>
      <form class="area-toolbar" @submit.prevent="mode === 'weather' ? weather() : search()">
        <div class="search-actions"><FbButton type="button" variant="secondary" :disabled="locating || busy || !user?.id" @click="locate"><MapPin :size="18" />{{ locating ? 'Locating…' : 'Use my location' }}</FbButton><label v-if="mode === 'community'" class="radius-field">Within<select v-model="radius"><option :value="25">25 km</option><option :value="50">50 km</option><option :value="100">100 km</option><option :value="200">200 km</option></select></label><FbButton type="submit" :busy="busy" :disabled="busy || locating || !user?.id || (mode === 'community' && !loaded)"><Search :size="18" />{{ mode === 'weather' ? 'Check weather' : 'Find nearby farmers' }}</FbButton></div>
        <p v-if="latitude !== '' && longitude !== ''" class="area-readout"><MapPin :size="15" />Search area: {{ latitude }}, {{ longitude }}. Not an exact farm pin.</p>
        <details class="manual-area"><summary>Choose approximate coordinates instead</summary><div class="coordinate-fields"><label class="field">Latitude<input v-model="latitude" type="number" step="0.1" min="-90" max="90" placeholder="Latitude" /></label><label class="field">Longitude<input v-model="longitude" type="number" step="0.1" min="-180" max="180" placeholder="Longitude" /></label></div></details>
      </form>
      <p v-if="error" role="alert" class="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{{ error }}</p><p v-if="message" role="status" class="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-900">{{ message }}</p>
    </section>

    <section v-if="mode === 'weather' && forecast" class="rounded-2xl border border-[#dce5d4] bg-white p-5 sm:p-7" aria-live="polite">
      <h3 class="font-bold"><CloudSun :size="22" />Your five-day forecast</h3><p class="mt-2 text-xs text-[#718068]">Area {{ forecast.latitude }}, {{ forecast.longitude }} · {{ forecast.timezone }} · Checked {{ new Date(forecast.checkedAt).toLocaleString() }}</p>
      <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><article v-for="day in forecast.days" :key="day.date" class="rounded-xl border border-[#e3eadc] bg-[#f8faf4] p-4"><h4 class="text-sm font-bold">{{ new Date(day.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) }}</h4><p class="mt-3 text-xl font-bold">{{ day.max }}°C</p><p class="mt-1 text-xs text-[#718068]">Low {{ day.min }}°C · {{ day.rain }} mm</p><p v-for="indicator in day.indicators" :key="indicator" class="mt-3 rounded-lg bg-[#fff0d8] p-2 text-xs leading-5 text-[#8a5819]">{{ indicator }}</p><p v-if="!day.indicators.length" class="mt-3 text-xs leading-5 text-[#718068]">No heat/rain threshold exceeded. Other hazards may still occur.</p></article></div>
      <p class="mt-5 text-xs leading-6 text-[#718068]">Planning thresholds: sampled temperature ≥35°C or rain across available forecast periods ≥20 mm. Partial-day totals are not full-day measurements. Forecasts are uncertain and conditions vary by crop, animal, and farm. Check local authorities for warnings.</p>
      <p class="mt-2 text-xs text-[#718068]">Weather data by <a href="https://openweathermap.org/" target="_blank" rel="noopener noreferrer" class="underline">OpenWeather</a>. FarmBuddy derives the planning indicators.</p>
    </section>

    <section v-if="mode === 'community'" id="nearby-farmer-map" class="neighbourhood-workspace" aria-labelledby="neighbourhood-title">
      <div class="workspace-heading"><h3 id="neighbourhood-title"><MapIcon :size="22" />Explore your area</h3><span v-if="searched">{{ farmers.length }} opted-in farmers found</span><span v-else>Only real, opted-in farmers appear here</span></div>
      <div class="map-surface">
        <FarmerMap v-if="mapPoint" :center="mapPoint" :farmers="farmers" :selected-id="selectedId" @select="showFarmer($event)" />
        <div v-else class="map-consent"><MapIcon :size="52" :stroke-width="1.25" aria-hidden="true" /><h4>Your neighbourhood, on your terms</h4><p>Choose your area above, then open the map. No map tiles or farmer locations are loaded here until you choose.</p><p class="provider-consent">Loading shares map-view information and your IP with the tile provider (OpenStreetMap by default). Markers show rounded areas, never exact addresses.</p><FbButton type="button" :disabled="busy || locating || !user?.id || !loaded" @click="loadMap"><MapIcon :size="18" />Load interactive farmer map</FbButton><p class="list-alternative">Prefer not to share with a tile provider? Find farmers above and use the results list below.</p></div>
      </div>
      <div v-if="mapPoint" class="map-controls"><span><ShieldCheck :size="16" />Approximate areas, not exact farm pins</span><button class="secondary" :disabled="busy || locating" @click="loadMap"><MapPin :size="17" />Recenter on entered area</button><button class="secondary" :disabled="busy || locating" @click="mapPoint = null"><EyeOff :size="17" />Close external map</button></div>
      <div v-if="selectedFarmer" aria-live="polite" class="selected-farmer"><div class="farmer-avatar"><Sprout :size="26" /></div><div><h4>{{ selectedFarmer.displayName }}</h4><p>{{ selectedFarmer.farmType }} · Approximately {{ selectedFarmer.distanceKm }} km away</p><p>{{ selectedFarmer.bio }}</p><p class="connection-note">Publish your own profile to connect. Contact details are shared only after acceptance.</p><div class="farmer-actions"><button class="primary" :disabled="busy || locating" @click="communityAction('request', { targetId: selectedFarmer.id })"><UserPlus :size="17" />Request connection</button><button class="secondary" :disabled="busy || locating" @click="communityAction('block', { targetId: selectedFarmer.id })"><Ban :size="17" />Block farmer</button></div></div></div>
    </section>
    <p v-if="!user?.id" role="status">Sign in to use location tools.</p>
    <p v-if="mode === 'community' && loading" role="status">Loading your farmer profile and connections…</p>
    <FbButton v-if="mode === 'community' && user?.id && !loaded && !loading" type="button" @click="loadCommunity"><RefreshCw :size="17" />Retry loading community</FbButton>
    <template v-if="mode === 'community' && loaded">
      <details class="profile-editor rounded-2xl border border-[#dce5d4] bg-white p-5 sm:p-7"><summary><span><UserPlus :size="21" />{{ community.profile.visible ? 'Manage your shared profile' : 'Let nearby farmers find you' }}</span><span class="profile-state">{{ community.profile.visible ? 'Discoverable' : 'Private until you publish' }}</span></summary><div class="flex flex-wrap items-center justify-between gap-3 mt-5"><h3 class="font-bold">Your public farmer profile</h3><span class="rounded-full bg-[#edf3e5] px-3 py-1 text-xs">{{ community.profile.visible ? 'Discoverable' : 'Hidden by default' }}</span></div><p class="mt-3 text-xs leading-6 text-[#718068]">Publishing shares your chosen farm name, farming type, introduction, and rounded coordinates with signed-in farmers. Optional contact details are shared only with accepted connections. Do not enter an exact address.</p>
        <form class="mt-4 grid gap-4" @submit.prevent="communityAction('publish')"><label class="field">Public farm name<input v-model="sharing.displayName" maxlength="100" required /></label><label class="field">Introduction<textarea v-model="sharing.bio" maxlength="400" rows="2" placeholder="What do you grow or raise?" /></label><label class="field">Contact for accepted connections only (optional)<input v-model="sharing.contact" maxlength="150" placeholder="A contact detail you choose to share" /></label><label class="flex items-start gap-3 text-xs leading-6"><input v-model="sharing.consent" type="checkbox" required class="mt-1.5" />I agree to share this profile and the rounded coordinates entered above with other signed-in farmers.</label><div class="flex flex-wrap gap-3"><button class="primary" :disabled="busy || locating"><UserPlus :size="17" />{{ community.profile.visible ? 'Update shared profile' : 'Publish my profile' }}</button><button v-if="community.profile.visible" type="button" class="secondary" :disabled="busy || locating" @click="communityAction('hide')"><EyeOff :size="17" />Hide & remove shared details</button></div></form>
      </details>
      <section v-if="searched" class="rounded-2xl border border-[#dce5d4] bg-white p-5 sm:p-7"><h3 class="font-bold">Nearby farmers · {{ farmers.length }}</h3><p v-if="!farmers.length" class="mt-4 text-sm leading-7 text-[#718068]">No opted-in farmers were found in this area. Try a wider radius or invite your farming community to join. We never add made-up profiles.</p><ul v-else class="mt-4 space-y-4"><li v-for="farmer in farmers" :key="farmer.id" class="rounded-xl border border-[#e3eadc] p-4"><h4 class="font-bold">{{ farmer.displayName }}</h4><p class="mt-1 text-xs capitalize text-[#718068]">{{ farmer.farmType }} · Approximately {{ farmer.distanceKm }} km away</p><p class="mt-2 break-words text-sm text-[#718068]">{{ farmer.bio }}</p><div class="mt-3 flex flex-wrap gap-2"><button type="button" class="secondary" :disabled="busy || locating" @click="showFarmer(farmer)"><MapPin :size="17" />View farmer details</button><button class="primary" :disabled="busy || locating" @click="communityAction('request', { targetId: farmer.id })"><UserPlus :size="17" />Request connection</button><button class="secondary" :disabled="busy || locating" @click="communityAction('block', { targetId: farmer.id })"><Ban :size="17" />Block farmer</button></div></li></ul></section>

      <section class="rounded-2xl border border-[#dce5d4] bg-white p-5 sm:p-7"><h3 class="font-bold"><Users :size="21" />Your connections</h3><p v-if="!community.requests.length" class="mt-3 text-sm text-[#718068]">No requests yet. Connect with an opted-in farmer nearby.</p><ul class="mt-3 space-y-3"><li v-for="request in community.requests" :key="request.id" class="rounded-xl bg-[#f6f8f1] p-4"><p class="text-sm font-bold">{{ request.farmer }} <span class="text-xs font-normal">· {{ request.incoming ? 'Incoming' : 'Sent' }} · {{ request.status }}</span></p><p v-if="request.status === 'accepted' && request.contact" class="mt-2 break-words text-xs">Shared contact: {{ request.contact }}</p><div v-if="request.incoming && request.status === 'pending'" class="mt-3 flex gap-2"><button class="primary" :disabled="busy || locating" @click="communityAction('respond', { requestId: request.id, status: 'accepted' })"><Check :size="17" />Accept & share my contact</button><button class="secondary" :disabled="busy || locating" @click="communityAction('respond', { requestId: request.id, status: 'declined' })"><X :size="17" />Decline</button></div><button class="secondary mt-3" :disabled="busy || locating" @click="communityAction('block', { targetId: request.farmerId })"><Ban :size="17" />Block this connection</button></li></ul><button class="secondary mt-4" :disabled="busy || locating" @click="loadCommunity"><RefreshCw :size="17" />Refresh connections</button><p class="mt-3 text-xs text-[#718068]">Connections exchange contact details only after acceptance. In-app farmer messaging is not included.</p></section>
    </template>
  </div>
</template>

<style scoped>
.field{display:flex;flex-direction:column;gap:8px;font-size:12px;font-weight:600;min-width:0}.field input,.field textarea,.field select{width:100%;border:1px solid #d5dfcb;border-radius:10px;background:#fcfdf9;padding:11px 12px;font-size:14px;color:#193d2b;font-weight:400;min-width:0}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:10px;padding:10px 14px;font-size:12px;font-weight:700}.primary{background:#066136;color:white}.secondary{border:1px solid #d5dfcb;background:#f8faf4;color:#275638}button:disabled{opacity:.55;cursor:wait}input:focus-visible,textarea:focus-visible,select:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #b58e27;outline-offset:3px}

.location-tools{font-family:'Plus Jakarta Sans',sans-serif;min-width:0;color:#23452f;overflow-wrap:anywhere}.location-tools>*{min-width:0}.community-intro{border-radius:26px;background:#f7faf2}.privacy-strip{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#eaf1df;border-radius:14px;padding:14px 16px;margin-top:18px;font-size:12px;line-height:1.8}.privacy-strip>svg{flex-shrink:0}.privacy-strip>span{flex:1;min-width:180px}.area-toolbar{margin-top:22px}.search-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:end}.radius-field{display:flex;gap:8px;align-items:center;font-size:12px;font-weight:600}.radius-field select{background:#fff;border:1px solid #cbd8bd;border-radius:12px;min-height:44px;padding:8px 12px;color:#254e32}.coordinate-fields{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:520px;margin-top:12px}.area-readout{display:flex;align-items:center;gap:6px;font-size:12px;color:#526747;margin-top:14px}.manual-area{margin-top:12px}summary{min-height:44px;cursor:pointer;padding:10px 0;font-size:13px;font-weight:600;line-height:1.8}button{min-height:44px;white-space:normal}.neighbourhood-workspace{background:#fff;border:1px solid #ccdac1;border-radius:26px;overflow:hidden;scroll-margin-top:20px}.workspace-heading{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:22px 26px}.workspace-heading h3,h3.font-bold{display:flex;align-items:center;gap:9px;font-size:18px;font-weight:700}.workspace-heading>span{font-size:12px;color:#53694a}.map-surface{background:#eaf0e1;padding:14px}.map-consent{min-height:370px;padding:38px 24px;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:center;border:1px dashed #9eaf8c;border-radius:18px;background:#f4f7ee}.map-consent>svg{color:#618256;margin-bottom:16px}.map-consent h4{font-size:clamp(20px,3vw,27px);font-weight:750;letter-spacing:-.03em;line-height:1.3}.map-consent p{font-size:13px;line-height:1.85;max-width:57ch;color:#506448;margin:12px 0}.map-consent .provider-consent{font-size:12px;margin:0 0 20px}.map-consent .list-alternative{font-size:11px;margin:16px 0 0;max-width:58ch}.map-controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:16px 22px}.map-controls>span{display:flex;align-items:center;gap:7px;flex:1;font-size:12px;min-width:180px}.selected-farmer{display:grid;grid-template-columns:48px 1fr;gap:16px;background:#f5f8ed;padding:24px;border-top:1px solid #d8e3c9}.farmer-avatar{display:grid;place-items:center;background:#e1ebcf;border-radius:16px;height:48px}.selected-farmer h4{font-size:18px;font-weight:700}.selected-farmer p{font-size:13px;line-height:1.85;color:#506448;margin-top:8px}.selected-farmer .connection-note{font-size:12px}.farmer-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.profile-editor{background:#fffdf1;border-color:#e4d9ab}.profile-editor>summary{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;list-style:revert}.profile-editor>summary>span:first-child{display:flex;gap:10px;align-items:center;font-size:16px}.profile-state{font-size:11px;background:#eee9d1;padding:5px 10px;border-radius:20px}.profile-editor input[type=checkbox]{width:22px;height:22px;flex-shrink:0;accent-color:#17613e}.profile-editor label:has(input[type=checkbox]){padding:10px 0;min-height:44px}summary:focus-visible{outline:3px solid #b58e27;outline-offset:3px}.location-tools .text-\[\#718068\],.location-tools .text-\[\#7b8972\]{color:#52654a}@media(max-width:550px){.coordinate-fields{grid-template-columns:1fr}.search-actions>*{width:100%}.radius-field{justify-content:space-between}.radius-field select{flex:1}.map-consent{padding:26px 16px;min-height:360px}.map-surface{padding:8px}.workspace-heading{padding:20px}.selected-farmer{grid-template-columns:1fr;padding:20px}.farmer-actions button,.map-controls button{width:100%}.profile-editor>summary{align-items:flex-start}.profile-editor .flex{flex-wrap:wrap}.profile-editor button{width:100%}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
</style>
