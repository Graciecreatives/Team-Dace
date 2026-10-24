<script setup>
import { computed, reactive, ref, watch } from 'vue'
import FbTabs from './ui/FbTabs.vue'
import FbDialog from './ui/FbDialog.vue'
import FbPageHeader from './ui/FbPageHeader.vue'
import FbPanel from './ui/FbPanel.vue'
import FbButton from './ui/FbButton.vue'
import FbBadge from './ui/FbBadge.vue'
import FbEmptyState from './ui/FbEmptyState.vue'
const props = defineProps({ state: { type: Object, required: true }, busy: Boolean })
const emit = defineEmits(['command'])
const planning = computed(() => props.state.planning || { plots: [], seasons: [], events: [] })
const canPlan = computed(() => ['owner', 'manager'].includes(props.state.farm?.role))
const canLog = computed(() => ['owner', 'manager', 'worker'].includes(props.state.farm?.role))
const selected = ref('')
const filter = ref('')
const search = ref('')
const kind = ref('')
const tab = ref('seasons')
const editor = ref('')
const today = new Date().toISOString().slice(0,10)
const visibleSeasons = computed(() => planning.value.seasons.filter(row => (!kind.value || row.kind === kind.value) && `${row.name} ${row.kind}`.toLowerCase().includes(search.value.toLowerCase())))
const error = ref('')
const notice = ref('')
const showMap = ref(false)
const plot = reactive({ name: '', coordinates: '', areaHa: '' })
const season = reactive({ name: '', kind: 'crops', enterpriseId: '', plotId: '', startsOn: '', endsOn: '' })
const schedule = reactive({ title: '', date: '' })
const event = reactive({ type: 'observation', date: '', quantity: '', unit: '', note: '' })
const defaults = {
  'plot.create': { name: '', coordinates: '', areaHa: '' },
  'season.create': { name: '', kind: 'crops', enterpriseId: '', plotId: '', startsOn: '', endsOn: '' },
  'schedule.create': { title: '', date: '' },
  'event.create': { type: 'observation', date: '', quantity: '', unit: '', note: '' }
}
const drafts = { 'plot.create': plot, 'season.create': season, 'schedule.create': schedule, 'event.create': event }
const pendingDrafts = new Map()
const active = computed(() => planning.value.seasons.find(row => row.id === selected.value))
const history = computed(() => planning.value.events.filter(row => row.seasonId === selected.value && (!filter.value || row.type === filter.value) && `${row.type} ${row.note || ''} ${row.unit || ''}`.toLowerCase().includes(search.value.toLowerCase())).slice().sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '')))
const agenda = computed(() => (active.value?.schedule || []).slice().sort((a, b) => a.date.localeCompare(b.date)))
const scheduleView = ref('upcoming')
const upcoming = computed(() => agenda.value.filter(row => row.date >= today))
const visibleAgenda = computed(() => scheduleView.value === 'upcoming' ? upcoming.value : agenda.value)
const types = ['health', 'breeding', 'feeding', 'production', 'observation', 'planting']
watch(() => `${props.state.farm?.id || ''}:${props.state.currentUserId || ''}:${props.state.user?.id || ''}:${props.state.account?.id || ''}`, () => {
  selected.value = planning.value.seasons[0]?.id || ''; scheduleView.value = 'upcoming'; filter.value = ''; search.value = ''; kind.value = ''; editor.value = ''; error.value = ''; notice.value = ''; showMap.value = false
  pendingDrafts.clear()
  for (const action of Object.keys(drafts)) Object.assign(drafts[action], defaults[action])
}, { flush: 'sync' })
watch(editor, value => { if (value) tab.value = value === 'plot.create' ? 'plots' : 'seasons' })
watch(() => props.state.lastCommandId, (id, previous) => {
  if (!id || id === previous) return
  const action = props.state.result?.action
  const draft = drafts[action]
  if (!draft || !pendingDrafts.has(action)) return
  // A retry or queued confirmation must not erase edits made since submission.
  const snapshots = pendingDrafts.get(action)
  const result = props.state.result
  const saved = action === 'plot.create' ? planning.value.plots.find(row => row.id === result.plotId)
    : action === 'season.create' ? planning.value.seasons.find(row => row.id === result.seasonId)
    : action === 'event.create' ? planning.value.events.find(row => row.id === result.eventId)
    : planning.value.seasons.flatMap(season => (season.schedule || []).map(row => ({ ...row, seasonId: season.id }))).find(row => row.id === result.scheduleId)
  const normalized = value => typeof value === 'string' ? value.trim() || undefined : value
  const index = saved ? snapshots.findIndex(snapshot => Object.entries(snapshot.fields).every(([key, value]) => JSON.stringify(normalized(saved[key])) === JSON.stringify(normalized(value)))) : 0
  if (index < 0) return
  const [submitted] = snapshots.splice(index, 1)
  if (submitted.draft === JSON.stringify(draft)) {
    Object.assign(draft, defaults[action])
    if (editor.value === action) editor.value = ''
  }
  if (!snapshots.length) pendingDrafts.delete(action)
  error.value = ''; notice.value = 'Saved to your farm.'
})
watch(() => planning.value.seasons, rows => { if (!rows.some(row => row.id === selected.value)) selected.value = rows[0]?.id || '' }, { immediate: true })
function send(action, fields) {
  if (props.busy) return
  if (!(action === 'event.create' ? canLog.value : canPlan.value)) { error.value = 'Your role cannot make this change.'; return }
  try { validate(action, fields) } catch (e) { error.value = e.message; return }
  error.value = ''; notice.value = 'Draft retained. Saved entries appear below after the command succeeds.'
  const snapshots = pendingDrafts.get(action) || []
  snapshots.push({ draft: JSON.stringify(drafts[action]), fields: JSON.parse(JSON.stringify(fields)) })
  pendingDrafts.set(action, snapshots)
  emit('command', { action, ...fields })
}
function validate(action, fields) {
  const text = (value, max, label, optional = false) => {
    if (optional && (value === undefined || value === '')) return
    if (typeof value !== 'string' || !value.trim() || value.length > max || /[<>\u0000-\u001f\u007f]/.test(value)) throw new Error(`Enter ${label} (up to ${max} characters, without markup or control characters).`)
  }
  const date = value => typeof value === 'string' && !value.startsWith('0000') && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
  const positive = value => Number.isFinite(value) && value > 0 && value <= 1e9
  if (action === 'plot.create') {
    text(fields.name, 150, 'a plot name')
    if (fields.areaHa !== undefined && !positive(fields.areaHa)) throw new Error('Enter a positive area no greater than 1 billion hectares.')
    const points = fields.coordinates
    if (!Array.isArray(points) || points.length < 3 || points.length > 100 || points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180)) throw new Error('Enter 3 to 100 valid latitude, longitude pairs.')
    const ring = points.length > 3 && points[0].join() === points.at(-1).join() ? points.slice(0, -1) : points
    if (new Set(ring.map(p => p.join())).size !== ring.length || ring.length < 3) throw new Error('Use at least three distinct boundary vertices.')
    const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    const between = (a,b,c) => Math.min(a[0],b[0]) <= c[0] && c[0] <= Math.max(a[0],b[0]) && Math.min(a[1],b[1]) <= c[1] && c[1] <= Math.max(a[1],b[1])
    for (let i=0;i<ring.length;i++) for (let j=i+1;j<ring.length;j++) {
      if (j===i+1 || (i===0 && j===ring.length-1)) continue
      const a=ring[i], b=ring[(i+1)%ring.length], c=ring[j], d=ring[(j+1)%ring.length]
      const ac=cross(a,b,c), ad=cross(a,b,d), ca=cross(c,d,a), cb=cross(c,d,b)
      if ((ac*ad<0 && ca*cb<0) || (!ac && between(a,b,c)) || (!ad && between(a,b,d)) || (!ca && between(c,d,a)) || (!cb && between(c,d,b))) throw new Error('Boundary edges must not cross.')
    }
    if (Math.abs(ring.reduce((sum,p,i) => sum + cross(ring[0],p,ring[(i+1)%ring.length]),0)) < 1e-14) throw new Error('Boundary must enclose an area.')
  } else if (action === 'season.create') {
    text(fields.name,150,'a season name')
    if (!['crops','livestock'].includes(fields.kind) || !date(fields.startsOn) || !date(fields.endsOn) || fields.endsOn < fields.startsOn) throw new Error('Choose a kind and valid ordered season dates.')
    if (fields.plotId && !planning.value.plots.some(row => row.id === fields.plotId)) throw new Error('Choose an available plot.')
    if (fields.enterpriseId && !(props.state.enterprises || []).some(row => row.id === fields.enterpriseId)) throw new Error('Choose an available register entry.')
  } else if (['schedule.create', 'event.create'].includes(action)) {
    const target = planning.value.seasons.find(row => row.id === fields.seasonId)
    if (!target || !date(fields.date) || fields.date < target.startsOn || fields.date > target.endsOn) throw new Error('Choose a date within the selected season.')
    if (action === 'schedule.create') text(fields.title,200,'a work title')
    else {
      if (!types.includes(fields.type)) throw new Error('Choose an available event type.')
      if (fields.quantity !== undefined && (!positive(fields.quantity) || !fields.unit.trim())) throw new Error('A positive quantity and unit are required together.')
      text(fields.unit, 60, 'a unit', true)
      text(fields.note, 4000, 'a note', true)
    }
  } else throw new Error('Unsupported production command.')
}
function saveSchedule() { send('schedule.create', { ...schedule, seasonId: selected.value }) }
function savePlot() {
  try {
    const lines = plot.coordinates.trim().split(/\n/).filter(line => line.trim())
    const coordinates = lines.map(line => {
      const values = line.split(',').map(value => value.trim())
      if (values.length !== 2 || values.some(value => !value || !Number.isFinite(Number(value)))) throw new Error('Use one latitude, longitude pair per line.')
      return values.map(Number)
    })
    if (coordinates.length < 3 || coordinates.length > 100) throw new Error('Enter 3 to 100 boundary points.')
    send('plot.create', { name: plot.name, coordinates, ...(plot.areaHa === '' ? {} : { areaHa: Number(plot.areaHa) }) })
  } catch (e) { error.value = e.message }
}
function saveSeason() { send('season.create', { ...season, enterpriseId: season.enterpriseId || undefined, plotId: season.plotId || undefined }) }
function saveEvent() { send('event.create', { ...event, seasonId: selected.value, ...(event.quantity === '' ? { quantity: undefined } : { quantity: Number(event.quantity) }) }) }
</script>
<template>
  <section class="production">
    <FbPageHeader title="Production workspace" description="Plan the season. Keep the history. Your crop cycles, animal groups and field work, connected."><template #actions><FbButton v-if="canPlan" :disabled="busy" @click="editor = 'season.create'">New season</FbButton><FbButton v-if="canPlan" variant="secondary" :disabled="busy" @click="editor = 'plot.create'">Add plot</FbButton></template></FbPageHeader>
    <div class="summary-strip"><span><strong>{{ planning.seasons.length }}</strong> seasons &amp; groups</span><span><strong>{{ planning.plots.length }}</strong> mapped plots</span><span><strong>{{ planning.events.length }}</strong> history entries</span></div>
    <div class="columns filters"><label>Search seasons and history<input v-model="search" type="search" placeholder="Name, activity or note" /></label><label>Season kind<select v-model="kind"><option value="">All kinds</option><option value="crops">Crops</option><option value="livestock">Livestock</option></select></label></div>
    <p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="notice" role="status" class="notice">{{ notice }}</p>
    <FbTabs v-model="tab" :items="[{ value: 'seasons', label: 'Seasons & history', count: planning.seasons.length }, { value: 'plots', label: 'Plot boundaries', count: planning.plots.length }]">
    <template #plots><FbPanel title="Plot boundaries"><p>The interactive map is optional. Opening it contacts the configured map provider and shares your IP address and viewed map area. Saved coordinates are available below without loading map tiles.</p><button type="button" :aria-expanded="showMap" @click="showMap = !showMap">{{ showMap ? 'Close map' : 'Load interactive map' }}</button><ClientOnly v-if="showMap"><FarmPlotMap :plots="planning.plots" /><template #fallback><p>Loading plot map…</p></template></ClientOnly>
      <FbEmptyState v-if="!planning.plots.length" title="Give your fields a boundary" description="Add ordered coordinates to save a plot. No map provider is contacted until you explicitly load the map." />
      <details v-for="row in planning.plots" :key="row.id"><summary>{{ row.name }} <span v-if="row.areaHa"> · {{ row.areaHa }} ha (entered)</span></summary><ol><li v-for="(point, index) in row.coordinates" :key="index">{{ point.join(', ') }}</li></ol></details>
      <FbDialog :open="editor === 'plot.create' && canPlan" title="Add plot boundary" :busy="busy" @update:open="!$event && (editor = '')"><p v-if="error" role="alert" class="error">{{ error }}</p><form @submit.prevent="savePlot"><fieldset :disabled="busy"><legend>Add a plot</legend><label>Plot name<input v-model="plot.name" required maxlength="150" /></label><label>Boundary coordinates<textarea v-model="plot.coordinates" required rows="4" placeholder="7.410, 3.910&#10;7.415, 3.910&#10;7.415, 3.915" /></label><small>Latitude, longitude per line, following the boundary in order. 3 to 100 points.</small><label>Area in hectares (optional, not calculated)<input v-model="plot.areaHa" type="number" min="0.000001" max="1000000000" step="any" /></label><FbButton type="submit" :busy="busy">Add plot</FbButton></fieldset></form></FbDialog>
    </FbPanel></template><template #seasons>
    <div class="columns"><FbPanel title="Seasons & animal groups"><FbEmptyState v-if="!visibleSeasons.length" :title="planning.seasons.length ? 'No matching seasons' : 'Start your first season'" description="Create a crop cycle or an animal group management period. Try clearing the filters if you expected to find a season." />
      <div class="season-cards" role="group" aria-label="Choose a season"><button v-for="row in visibleSeasons" :key="row.id" type="button" class="season-card" :aria-pressed="selected === row.id" @click="selected = row.id"><FbBadge>{{ row.kind }}</FbBadge><strong>{{ row.name }}</strong><small>{{ row.startsOn }} to {{ row.endsOn }}</small><small>{{ (row.schedule || []).length }} scheduled · {{ planning.events.filter(event => event.seasonId === row.id).length }} history entries</small></button></div>
      <FbDialog :open="editor === 'season.create' && canPlan" title="Create a season or animal group" :busy="busy" @update:open="!$event && (editor = '')"><p v-if="error" role="alert" class="error">{{ error }}</p><form @submit.prevent="saveSeason"><fieldset :disabled="busy"><legend>Create a season</legend><label>Season / animal group name<input v-model="season.name" required maxlength="150" placeholder="North field maize / Dairy herd 2026" /></label><label>Kind<select v-model="season.kind"><option value="crops">Crops</option><option value="livestock">Livestock</option></select></label><label>Farm register link (optional)<select v-model="season.enterpriseId"><option value="">No register link</option><option v-for="row in state.enterprises || []" :key="row.id" :value="row.id">{{ row.name }}</option></select></label><label>Plot (optional)<select v-model="season.plotId"><option value="">No plot</option><option v-for="row in planning.plots" :key="row.id" :value="row.id">{{ row.name }}</option></select></label><div class="columns"><label>Starts<input v-model="season.startsOn" type="date" required /></label><label>Ends<input v-model="season.endsOn" type="date" :min="season.startsOn" required /></label></div><FbButton type="submit" :busy="busy">Create season</FbButton></fieldset></form></FbDialog>
    </FbPanel><FbPanel v-if="active" :title="active.name"><FbBadge>{{ active.kind }}</FbBadge><p>{{ active.startsOn }} to {{ active.endsOn }} · {{ active.kind }}</p><p v-if="active.plotId">Plot: {{ planning.plots.find(row => row.id === active.plotId)?.name || 'Unavailable' }}</p><p v-if="active.enterpriseId">Register: {{ (state.enterprises || []).find(row => row.id === active.enterpriseId)?.name || 'Unavailable' }}</p><h4>Work timeline <FbBadge>{{ upcoming.length }} upcoming</FbBadge></h4><div class="schedule-tools"><FbButton variant="secondary" :aria-pressed="scheduleView === 'upcoming'" @click="scheduleView = 'upcoming'">Upcoming ({{ upcoming.length }})</FbButton><FbButton variant="secondary" :aria-pressed="scheduleView === 'all'" @click="scheduleView = 'all'">All work ({{ agenda.length }})</FbButton><FbButton v-if="canPlan" :disabled="busy" @click="editor = 'schedule.create'">Schedule work</FbButton></div><FbEmptyState v-if="!visibleAgenda.length" :title="scheduleView === 'upcoming' ? 'No upcoming work' : 'No work scheduled'" description="Schedule the next task for this season, or choose All work to review earlier dates." /><ol class="timeline"><li v-for="row in visibleAgenda" :key="row.id"><time>{{ row.date }}</time><FbBadge v-if="row.date >= today" tone="success">Upcoming</FbBadge><strong>{{ row.title }}</strong></li></ol>
      <FbDialog :open="editor === 'schedule.create' && canPlan" :title="`Schedule work · ${active.name}`" :busy="busy" @update:open="!$event && (editor = '')"><p v-if="error" role="alert" class="error">{{ error }}</p><form @submit.prevent="saveSchedule"><fieldset :disabled="busy"><legend>Schedule work</legend><label>Work title<input v-model="schedule.title" required maxlength="200" /></label><label>Date<input v-model="schedule.date" type="date" :min="active.startsOn" :max="active.endsOn" required /></label><FbButton type="submit" :busy="busy">Add to schedule</FbButton></fieldset></form></FbDialog>
    </FbPanel></div>
    <FbPanel v-if="active" :title="active.kind === 'livestock' ? 'Animal group history' : 'Crop season history'"><template #actions><FbButton v-if="canLog" :disabled="busy" @click="editor = 'event.create'">Record activity</FbButton></template><p>Observations do not change stock or bookkeeping. Record harvested stock through the business harvest tool.</p><label>Filter history<select v-model="filter"><option value="">All event types</option><option v-for="type in types" :key="type" :value="type">{{ type }}</option><option value="harvest">harvest</option></select></label><p>{{ history.length }} matching history entries</p><FbEmptyState v-if="!history.length" title="No matching history" description="Record an activity, or clear the search and type filters. Harvest entries appear here only after a real harvest is recorded through Business." /><ol class="timeline"><li v-for="row in history" :key="row.id"><time>{{ row.date }}</time><strong>{{ row.type }}</strong><span v-if="row.quantity !== undefined">{{ row.quantity }} {{ row.unit }}</span><p class="note">{{ row.note }}</p></li></ol>
      <FbDialog :open="editor === 'event.create' && canLog" :title="`Record activity · ${active.name}`" :busy="busy" @update:open="!$event && (editor = '')"><p v-if="error" role="alert" class="error">{{ error }}</p><form @submit.prevent="saveEvent"><fieldset :disabled="busy"><legend>Record an observation / activity</legend><div class="columns"><label>Event type<select v-model="event.type"><option v-for="type in types" :key="type" :value="type">{{ type }}</option></select></label><label>Date<input v-model="event.date" type="date" :min="active.startsOn" :max="active.endsOn" required /></label><label>Quantity (optional)<input v-model="event.quantity" type="number" min="0.000001" max="1000000000" step="any" /></label><label>Unit<input v-model="event.unit" :required="event.quantity !== ''" maxlength="60" placeholder="kg, head, litres" /></label></div><label>Notes<textarea v-model="event.note" maxlength="4000" rows="3" placeholder="Include animal tag / group, symptoms, feed or treatment details as appropriate." /></label><FbButton type="submit" :busy="busy">Save event</FbButton></fieldset></form></FbDialog>
    </FbPanel></template></FbTabs>
    <p v-if="!canLog" class="notice">Your role cannot change planning or record activities. Owners and managers can plan, and workers can log activities.</p>
  </section>
</template>
<style scoped>
.production{display:grid;gap:1.25rem;color:#173b27;width:100%;max-width:none;font:inherit}.summary-strip{display:flex;flex-wrap:wrap;gap:1rem;padding:1.25rem;background:#eaf2df;border:1px solid #d7e3c9;border-radius:16px}.summary-strip span{flex:1;min-width:130px}.summary-strip strong{display:block;font-size:1.8rem}.filters{background:#faf7d8;padding:1rem;border-radius:14px}.schedule-tools{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.75rem}.schedule-tools [aria-pressed=true]{box-shadow:inset 0 -3px #d5b92c}.season-cards{display:grid;gap:.75rem;margin-top:1rem}.season-card{display:grid;gap:.5rem;width:100%;text-align:left;background:#f8faf3;color:#173b27;border:1px solid #dce6d9;font:inherit}.season-card[aria-pressed=true]{border:2px solid #285e31;background:#f7f2bc}.season-card:focus-visible,button:focus-visible{outline:3px solid #b69f19;outline-offset:3px}.season-card strong{font-size:1.1rem}.eyebrow{font-size:.72rem;font-weight:800;letter-spacing:.12em;color:#527331}h2{font-size:clamp(1.5rem,4vw,2.1rem);font-weight:800}h3{font-size:1.2rem;font-weight:750}h4{font-weight:700;margin-top:1rem}.card{background:#fff;border:1px solid #dce6d9;border-radius:20px;padding:clamp(1rem,3vw,1.5rem);min-width:0}.columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:1rem}form{margin-top:1.25rem;border-top:1px solid #e5ebdf;padding-top:1rem}fieldset{display:grid;gap:.8rem;min-width:0}legend{font-weight:750;padding-bottom:.6rem}label{display:grid;gap:.35rem;font-size:.88rem;font-weight:600}input,select,textarea{width:100%;min-width:0;border:1px solid #bdcbb8;border-radius:10px;padding:.65rem;background:#fcfdf9;color:#173b27;font:inherit}input:focus,select:focus,textarea:focus{outline:3px solid #e5d567;outline-offset:1px}button{justify-self:start;background:#285e31;color:#fff;border-radius:10px;padding:.7rem 1.1rem;font-weight:700}button:disabled,fieldset:disabled{opacity:.6}p{margin:.5rem 0;line-height:1.55}small{color:#5d6d5d}.notice{background:#faf7d8;padding:.8rem;border-radius:12px}.error{color:#922828;background:#fff0ed;padding:.8rem;border-radius:12px}.timeline{display:grid;gap:.7rem;max-height:32rem;overflow:auto;margin:1rem 0}.timeline li{border-left:3px solid #d8c94c;padding:.5rem .8rem;background:#f7faf3}.timeline time{font-size:.8rem;display:block;color:#586b57}.timeline strong{margin-right:.8rem;text-transform:capitalize}.note{white-space:pre-wrap;overflow-wrap:anywhere}details{margin:.6rem 0}summary{cursor:pointer;font-weight:600}details ol{padding-left:1.4rem;font-size:.85rem}
</style>
