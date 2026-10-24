<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import FbTabs from './ui/FbTabs.vue'
import { Sprout, Beef, CalendarPlus, NotebookPen, Search } from 'lucide-vue-next'
import FbPanel from './ui/FbPanel.vue'
import FbButton from './ui/FbButton.vue'
import FbBadge from './ui/FbBadge.vue'
import FbEmptyState from './ui/FbEmptyState.vue'
const props = defineProps({ state: { type: Object, required: true }, busy: Boolean, commandError: { type: String, default: '' } })
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
const showHistory = ref(false)
async function startSeason(value, trigger) {
  if (props.busy) return
  season.kind = value
  seasonDetails.value = true
  await openEditor('season.create', trigger)
}
function selectSeason(id) {
  if (props.busy) return
  selected.value = id
  scheduleView.value = 'upcoming'
  showHistory.value = false
}
const seasonDetails = ref(false)
const editorTrigger = ref(null)
const editorRegion = ref(null)
async function showSeasonDetails(value) {
  if (props.busy) return
  seasonDetails.value = value
  await nextTick()
  if (value) editorRegion.value?.querySelector('input')?.focus()
  else editorRegion.value?.querySelector('.choice-grid button')?.focus()
}
async function openEditor(action, trigger) {
  if (props.busy) return
  editorTrigger.value = trigger?.currentTarget || null
  editor.value = action
  tab.value = action === 'plot.create' ? 'plots' : 'seasons'
  await nextTick()
  editorRegion.value?.focus()
}
async function closeEditor() {
  if (props.busy) return
  editor.value = ''
  await nextTick()
  editorTrigger.value?.focus()
}
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
const scopedDrafts = new Map()
const active = computed(() => planning.value.seasons.find(row => row.id === selected.value))
const history = computed(() => planning.value.events.filter(row => row.seasonId === selected.value && (!filter.value || row.type === filter.value) && `${row.type} ${row.note || ''} ${row.unit || ''}`.toLowerCase().includes(search.value.toLowerCase())).slice().sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '')))
const agenda = computed(() => (active.value?.schedule || []).slice().sort((a, b) => a.date.localeCompare(b.date)))
const scheduleView = ref('upcoming')
const upcoming = computed(() => agenda.value.filter(row => row.date >= today))
const visibleAgenda = computed(() => scheduleView.value === 'upcoming' ? upcoming.value : agenda.value)
const stage = row => today < row.startsOn ? 'Preparing' : today > row.endsOn ? 'Season ended' : 'In season'
const nextWork = row => (row.schedule || []).filter(work => work.date >= today).slice().sort((a, b) => a.date.localeCompare(b.date))[0]
const seasonProgress = row => {
  const duration = Date.parse(row.endsOn) - Date.parse(row.startsOn)
  return duration > 0 ? Math.max(0, Math.min(100, (Date.parse(today) - Date.parse(row.startsOn)) / duration * 100)) : today >= row.startsOn ? 100 : 0
}
const types = ['health', 'breeding', 'feeding', 'production', 'observation', 'planting']
watch(() => `${props.state.farm?.id || ''}:${props.state.currentUserId || ''}:${props.state.user?.id || ''}:${props.state.account?.id || ''}`, () => {
  selected.value = planning.value.seasons[0]?.id || ''; scheduleView.value = 'upcoming'; filter.value = ''; search.value = ''; kind.value = ''; editor.value = ''; error.value = ''; notice.value = ''; showMap.value = false
  showHistory.value = false
  pendingDrafts.clear()
  scopedDrafts.clear()
  seasonDetails.value = false
  editorTrigger.value = null
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
  const scoped = action === 'schedule.create' || action === 'event.create'
  const currentScope = !scoped || submitted.fields.seasonId === selected.value
  const targetDraft = currentScope ? draft : scopedDrafts.get(submitted.fields.seasonId)?.[action]
  if (targetDraft && submitted.draft === JSON.stringify(targetDraft)) {
    Object.assign(targetDraft, defaults[action])
    if (action === 'season.create') seasonDetails.value = false
    if (currentScope && editor.value === action) {
      editor.value = ''
      nextTick(() => editorTrigger.value?.focus())
    }
  }
  if (!snapshots.length) pendingDrafts.delete(action)
  error.value = ''; notice.value = 'Saved to your farm.'
})
watch(selected, (id, previous) => {
  if (previous) scopedDrafts.set(previous, { 'schedule.create': { ...schedule }, 'event.create': { ...event } })
  const saved = scopedDrafts.get(id)
  Object.assign(schedule, saved?.['schedule.create'] || defaults['schedule.create'])
  Object.assign(event, saved?.['event.create'] || defaults['event.create'])
  if (editor.value === 'schedule.create' || editor.value === 'event.create') editor.value = ''
}, { flush: 'sync' })
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
    <header class="season-heading"><h2>Production</h2><nav v-if="canPlan" class="production-entry" aria-label="Production tasks"><FbButton :disabled="busy" @click="startSeason('crops', $event)"><Sprout :size="19" aria-hidden="true" />New crop season</FbButton><FbButton variant="secondary" :disabled="busy" @click="startSeason('livestock', $event)"><Beef :size="19" aria-hidden="true" />New animal group</FbButton></nav></header>
    <p v-if="error || commandError" role="alert" class="error">{{ error || commandError }}</p><p v-if="notice" role="status" class="notice">{{ notice }}</p>
    <FbTabs v-model="tab" :items="[{ value: 'seasons', label: 'Seasons & groups', count: planning.seasons.length }, { value: 'plots', label: 'Plot boundaries', count: planning.plots.length }]">
    <template #plots><FbPanel title="Plot boundaries"><template #actions><FbButton v-if="canPlan" :disabled="busy" @click="openEditor('plot.create', $event)">Add plot</FbButton></template><p>The interactive map is optional. Opening it contacts the configured map provider and shares your IP address and viewed map area. Saved coordinates are available below without loading map tiles.</p><button type="button" :aria-expanded="showMap" @click="showMap = !showMap">{{ showMap ? 'Close map' : 'Load interactive map' }}</button><ClientOnly v-if="showMap"><FarmPlotMap :plots="planning.plots" /><template #fallback><p>Loading plot map…</p></template></ClientOnly>
      <FbEmptyState v-if="!planning.plots.length" title="Give your fields a boundary" description="Add ordered coordinates to save a plot. No map provider is contacted until you explicitly load the map." />
      <details v-for="row in planning.plots" :key="row.id"><summary>{{ row.name }} <span v-if="row.areaHa"> · {{ row.areaHa }} ha (entered)</span></summary><ol><li v-for="(point, index) in row.coordinates" :key="index">{{ point.join(', ') }}</li></ol></details>
      <Transition name="editor"><section v-if="editor === 'plot.create' && canPlan" ref="editorRegion" class="inline-editor" tabindex="-1" aria-label="Add plot boundary"><header><h3>Add plot boundary</h3><FbButton variant="secondary" :disabled="busy" @click="closeEditor">Close, keep draft</FbButton></header><p v-if="error || commandError" role="alert" class="error">{{ error || commandError }}</p><form @submit.prevent="savePlot"><fieldset :disabled="busy"><legend>Add a plot</legend><label>Plot name<input v-model="plot.name" required maxlength="150" /></label><label>Boundary coordinates<textarea v-model="plot.coordinates" required rows="4" placeholder="7.410, 3.910&#10;7.415, 3.910&#10;7.415, 3.915" /></label><small>Latitude, longitude per line, following the boundary in order. 3 to 100 points.</small><label>Area in hectares (optional, not calculated)<input v-model="plot.areaHa" type="number" min="0.000001" max="1000000000" step="any" /></label><FbButton type="submit" :busy="busy">Add plot</FbButton></fieldset></form></section></Transition>
    </FbPanel></template><template #seasons>
    <div class="season-layout"><FbPanel title="Seasons & animal groups"><FbEmptyState v-if="!visibleSeasons.length" :title="planning.seasons.length ? 'No matching seasons' : 'Start your first season'" description="Create a crop cycle or an animal group management period. Try clearing the filters if you expected to find a season." />
      <details class="find-tools"><summary>Find a season or activity</summary><div class="planner-tools"><label class="planner-search"><Search :size="19" aria-hidden="true" /><span class="sr-only">Search seasons and history</span><input v-model="search" type="search" placeholder="Find a season or activity" /></label><div class="kind-switch" role="group" aria-label="Season kind"><button type="button" :aria-pressed="kind === ''" @click="kind = ''">All seasons</button><button type="button" :aria-pressed="kind === 'crops'" @click="kind = 'crops'"><Sprout :size="18" aria-hidden="true" />Crops</button><button type="button" :aria-pressed="kind === 'livestock'" @click="kind = 'livestock'"><Beef :size="18" aria-hidden="true" />Animals</button></div></div></details>
      <div class="season-cards" role="group" aria-label="Choose a season"><button v-for="row in visibleSeasons" :key="row.id" type="button" class="season-card" :aria-pressed="selected === row.id" :disabled="busy" @click="selectSeason(row.id)"><span class="season-identity"><span class="identity-symbol" aria-hidden="true"><component :is="row.kind === 'livestock' ? Beef : Sprout" :size="28" /></span><span><small>{{ row.kind === 'livestock' ? 'Animal group' : 'Crop cycle' }}</small><strong>{{ row.name }}</strong></span><span class="selection-mark" aria-hidden="true">{{ selected === row.id ? '●' : '○' }}</span></span><span class="season-stage">{{ stage(row) }}</span></button></div>
      <Transition name="editor"><section v-if="editor === 'season.create' && canPlan" ref="editorRegion" class="inline-editor" tabindex="-1" aria-label="Create a season or animal group"><header><h3>{{ seasonDetails ? (season.kind === 'livestock' ? 'New animal group' : 'New crop season') : 'Choose a season type' }}</h3><FbButton variant="secondary" :disabled="busy" @click="closeEditor">Close, keep draft</FbButton></header><div v-if="!seasonDetails" class="choice-grid" role="group" aria-label="Season kind"><button type="button" :disabled="busy" :aria-pressed="season.kind === 'crops'" @click="season.kind = 'crops'; showSeasonDetails(true)"><Sprout aria-hidden="true" /><strong>Crop cycle</strong><span>Plan planting through harvest</span></button><button type="button" :disabled="busy" :aria-pressed="season.kind === 'livestock'" @click="season.kind = 'livestock'; showSeasonDetails(true)"><Beef aria-hidden="true" /><strong>Animal group</strong><span>Plan care and production</span></button></div><button v-if="!seasonDetails" type="button" :disabled="busy" @click="showSeasonDetails(true)">Continue with {{ season.kind === 'crops' ? 'crop cycle' : 'animal group' }}</button><div v-if="seasonDetails"><button type="button" :disabled="busy" @click="showSeasonDetails(false)">Back to season choices</button><p v-if="error || commandError" role="alert" class="error">{{ error || commandError }}</p><form @submit.prevent="saveSeason"><fieldset :disabled="busy"><legend>Create a season</legend><label>Season / animal group name<input v-model="season.name" required maxlength="150" placeholder="North field maize / Dairy herd 2026" /></label><details><summary>Link a register entry or plot (optional)</summary><div v-if="(state.enterprises || []).length <= 6"><p>Farm register link (optional)</p><div class="choice-grid" role="group" aria-label="Farm register link"><button type="button" :aria-pressed="!season.enterpriseId" @click="season.enterpriseId = ''">No register link</button><button v-for="row in state.enterprises || []" :key="row.id" type="button" :aria-pressed="season.enterpriseId === row.id" @click="season.enterpriseId = row.id">{{ row.name }}</button></div></div><label v-else>Farm register link (optional)<select v-model="season.enterpriseId"><option value="">No register link</option><option v-for="row in state.enterprises || []" :key="row.id" :value="row.id">{{ row.name }}</option></select></label><div v-if="planning.plots.length <= 6"><p>Plot (optional)</p><div class="choice-grid" role="group" aria-label="Season plot"><button type="button" :aria-pressed="!season.plotId" @click="season.plotId = ''">No plot</button><button v-for="row in planning.plots" :key="row.id" type="button" :aria-pressed="season.plotId === row.id" @click="season.plotId = row.id">{{ row.name }}</button></div></div><label v-else>Plot (optional)<select v-model="season.plotId"><option value="">No plot</option><option v-for="row in planning.plots" :key="row.id" :value="row.id">{{ row.name }}</option></select></label></details><div class="columns"><label>Starts<input v-model="season.startsOn" type="date" required /></label><label>Ends<input v-model="season.endsOn" type="date" :min="season.startsOn" required /></label></div><FbButton type="submit" :busy="busy">Create season</FbButton></fieldset></form></div></section></Transition>
    </FbPanel><FbPanel v-if="active" :title="active.name"><div class="active-season"><span class="active-kind">{{ active.kind === 'livestock' ? 'Animal group' : 'Crop cycle' }} · {{ stage(active) }}</span><p class="next-action"><strong>Next task</strong>{{ upcoming[0] ? `${upcoming[0].title} · ${upcoming[0].date}` : 'No upcoming work scheduled.' }}</p><p class="season-range"><time>{{ active.startsOn }}</time><span> to </span><time>{{ active.endsOn }}</time></p></div><div class="selected-actions"><FbButton v-if="canPlan" :disabled="busy" @click="openEditor('schedule.create', $event)"><CalendarPlus :size="19" aria-hidden="true" />Schedule work</FbButton><FbButton v-if="canLog" variant="secondary" :disabled="busy" @click="openEditor('event.create', $event)"><NotebookPen :size="19" aria-hidden="true" />Record activity</FbButton></div><details v-if="active.plotId || active.enterpriseId" class="season-links"><summary>Season links</summary><p v-if="active.plotId">Plot: {{ planning.plots.find(row => row.id === active.plotId)?.name || 'Unavailable' }}</p><p v-if="active.enterpriseId">Register: {{ (state.enterprises || []).find(row => row.id === active.enterpriseId)?.name || 'Unavailable' }}</p></details><h4>Work timeline <FbBadge>{{ upcoming.length }} upcoming</FbBadge></h4><div class="schedule-tools"><FbButton variant="secondary" :aria-pressed="scheduleView === 'upcoming'" @click="scheduleView = 'upcoming'">Upcoming ({{ upcoming.length }})</FbButton><FbButton variant="secondary" :aria-pressed="scheduleView === 'all'" @click="scheduleView = 'all'">All work ({{ agenda.length }})</FbButton></div><FbEmptyState v-if="!visibleAgenda.length && scheduleView === 'all'" :title="scheduleView === 'upcoming' ? 'No upcoming work' : 'No work scheduled'" description="Schedule the next task for this season, or choose All work to review earlier dates." /><ol class="timeline"><li v-for="row in visibleAgenda" :key="row.id"><time>{{ row.date }}</time><FbBadge v-if="row.date >= today" tone="success">Upcoming</FbBadge><strong>{{ row.title }}</strong></li></ol>
      <Transition name="editor"><section v-if="editor === 'schedule.create' && canPlan" ref="editorRegion" class="inline-editor" tabindex="-1" :aria-label="`Schedule work · ${active.name}`"><header><h3>Schedule work · {{ active.name }}</h3><FbButton variant="secondary" :disabled="busy" @click="closeEditor">Close, keep draft</FbButton></header><p v-if="error || commandError" role="alert" class="error">{{ error || commandError }}</p><form @submit.prevent="saveSchedule"><fieldset :disabled="busy"><legend>Schedule work</legend><label>Work title<input v-model="schedule.title" required maxlength="200" /></label><label>Date<input v-model="schedule.date" type="date" :min="active.startsOn" :max="active.endsOn" required /></label><FbButton type="submit" :busy="busy">Add to schedule</FbButton></fieldset></form></section></Transition>
    </FbPanel></div>
    <FbPanel v-if="active" title="Activity"><button type="button" class="history-toggle" :aria-expanded="showHistory" aria-controls="production-history" @click="showHistory = !showHistory">{{ showHistory ? 'Hide activity history' : 'View activity history' }}</button><div v-if="showHistory" id="production-history"><p>Observations do not change stock or bookkeeping. Record harvested stock through the business harvest tool.</p><label>Filter history<select v-model="filter"><option value="">All event types</option><option v-for="type in types" :key="type" :value="type">{{ type }}</option><option value="harvest">harvest</option></select></label><p>{{ history.length }} matching history entries</p><FbEmptyState v-if="!history.length" title="No matching history" description="Record an activity, or clear the search and type filters. Harvest entries appear here only after a real harvest is recorded through Business." /><ol class="timeline"><li v-for="row in history" :key="row.id"><time>{{ row.date }}</time><strong>{{ row.type }}</strong><span v-if="row.quantity !== undefined">{{ row.quantity }} {{ row.unit }}</span><p class="note">{{ row.note }}</p></li></ol></div>
      <Transition name="editor"><section v-if="editor === 'event.create' && canLog" ref="editorRegion" class="inline-editor" tabindex="-1" :aria-label="`Record activity · ${active.name}`"><header><h3>Record activity · {{ active.name }}</h3><FbButton variant="secondary" :disabled="busy" @click="closeEditor">Close, keep draft</FbButton></header><p v-if="error || commandError" role="alert" class="error">{{ error || commandError }}</p><p>Activities do not change stock or bookkeeping. Use Business to record a harvest.</p><form @submit.prevent="saveEvent"><fieldset :disabled="busy"><legend>Record an observation / activity</legend><div class="columns"><div><span>Event type</span><div class="choice-grid event-choices" role="group" aria-label="Event type"><button v-for="type in types" :key="type" type="button" :aria-pressed="event.type === type" @click="event.type = type">{{ type }}</button></div></div><label>Date<input v-model="event.date" type="date" :min="active.startsOn" :max="active.endsOn" required /></label><label>Quantity (optional)<input v-model="event.quantity" type="number" min="0.000001" max="1000000000" step="any" /></label><label>Unit<input v-model="event.unit" :required="event.quantity !== ''" maxlength="60" placeholder="kg, head, litres" /></label></div><label>Notes<textarea v-model="event.note" maxlength="4000" rows="3" placeholder="Include animal tag / group, symptoms, feed or treatment details as appropriate." /></label><FbButton type="submit" :busy="busy">Save event</FbButton></fieldset></form></section></Transition>
    </FbPanel></template></FbTabs>
    <p v-if="!canLog" class="notice">Your role cannot change planning or record activities. Owners and managers can plan, and workers can log activities.</p>
  </section>
</template>
<style scoped>
.production-entry{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.production-entry :deep(button){min-height:44px;border-radius:12px;gap:8px}.selected-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.find-tools{border:1px solid #dce6d5;border-radius:12px;padding:0 12px;background:#f8faf3}.find-tools summary,.season-links summary{cursor:pointer;align-content:center;font-weight:600}.find-tools[open] .planner-tools{padding:8px 0}.season-links{margin:8px 0;color:#526858}.production .season-card{padding:12px}.production .history-toggle{background:#edf3e4;color:#173b27}.production .active-season{padding:16px;margin-top:12px;border-radius:14px}.production .active-season .next-action{border:0;padding:0;margin:8px 0;font-size:1.1rem}.season-range{display:flex;flex-wrap:wrap;gap:.35rem;font-size:.8rem;color:#d4e6d2}.production .season-heading h2{max-width:none;font-size:28px}.production .season-heading{padding:0;gap:12px;flex-wrap:wrap}.production.production{gap:12px}.production .season-layout{gap:16px;grid-template-columns:minmax(220px,.65fr) minmax(0,1.5fr)}@media(max-width:800px){.production .season-layout{grid-template-columns:minmax(0,1fr)}.production .season-cards{grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))}.production .season-card .identity-symbol{width:36px;height:36px;border-radius:10px}}@media(max-width:480px){.production-entry{width:100%}.production-entry :deep(button){flex:1;font-size:.8rem;padding:10px}.selected-actions :deep(button){flex:1}.production .season-heading{align-items:flex-start}.production .season-heading h2{font-size:24px}}
.inline-editor{margin-top:20px;padding:clamp(14px,3vw,24px);border:2px solid #b6cb97;border-left:5px solid #066136;border-radius:16px;background:white;min-width:0;scroll-margin-top:24px}.inline-editor>header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}.choice-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:10px;margin:16px 0}.production .choice-grid button{display:grid;align-content:start;justify-content:start;gap:6px;width:100%;min-width:0;text-align:left;background:#f5f6f0;border:2px solid #dce6d5;color:#173b27;overflow-wrap:anywhere}.choice-grid span{font-size:.85rem;font-weight:400}.production .choice-grid button[aria-pressed=true]{background:#e5edcf;border-color:#066136;box-shadow:inset 4px 0 #066136}.production .event-choices{grid-template-columns:repeat(auto-fit,minmax(min(100%,110px),1fr))}.production button{transition:background-color 160ms ease-out,transform 160ms ease-out}.production button:active:not(:disabled){transform:scale(.98)}.inline-editor:focus-visible{outline:3px solid #b48000;outline-offset:3px}.editor-enter-active,.editor-leave-active{transition:opacity 200ms ease-out,transform 200ms ease-out}.editor-enter-from,.editor-leave-to{opacity:0;transform:translateY(-6px)}.editor-leave-active{pointer-events:none}.production :deep(button){white-space:normal;max-width:100%}
.production{grid-template-columns:minmax(0,1fr)}.production>*{min-width:0}.production .planner-tools{display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap}.production .planner-search{position:relative;display:flex;gap:10px;align-items:center;flex:1;max-width:380px;min-width:0}.planner-search>svg{position:absolute;left:14px;color:#61745c}.production .planner-search input{padding-left:42px;background:white;border-radius:14px}.kind-switch{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.production .kind-switch button{display:inline-flex;align-items:center;gap:7px;background:transparent;color:#526c46;border:1px solid transparent;border-radius:13px;padding:10px 14px;font-size:13px}.production .kind-switch button[aria-pressed=true]{background:#e5eedc;color:#066136;border-color:#c9d9bd}.production .season-card{justify-content:stretch;justify-items:stretch}.season-heading{padding-bottom:0!important}.production .season-ledger{margin:0}@media(max-width:600px){.production .planner-search{max-width:none;flex-basis:100%}.production .kind-switch button{padding:10px}.planner-tools{gap:10px!important}}
.production{display:grid;gap:1.25rem;color:#173b27;width:100%;max-width:none;font:inherit}.filters{background:#faf7d8;padding:1rem;border-radius:14px}.schedule-tools{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.75rem}.schedule-tools [aria-pressed=true]{box-shadow:inset 0 -3px #d5b92c}.season-cards{display:grid;gap:.75rem;margin-top:1rem}.season-card{display:grid;gap:.5rem;width:100%;text-align:left;background:#f8faf3;color:#173b27;border:1px solid #dce6d9;font:inherit}.season-card[aria-pressed=true]{border:2px solid #285e31;background:#f7f2bc}.season-card:focus-visible,button:focus-visible{outline:3px solid #b69f19;outline-offset:3px}.season-card strong{font-size:1.1rem}h2{font-size:clamp(1.5rem,4vw,2.1rem);font-weight:800}h3{font-size:1.2rem;font-weight:750}h4{font-weight:700;margin-top:1rem}.columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:1rem}form{margin-top:1.25rem;border-top:1px solid #e5ebdf;padding-top:1rem}fieldset{display:grid;gap:.8rem;min-width:0}legend{font-weight:750;padding-bottom:.6rem}label{display:grid;gap:.35rem;font-size:.88rem;font-weight:600}input,select,textarea{width:100%;min-width:0;border:1px solid #bdcbb8;border-radius:10px;padding:.65rem;background:#fcfdf9;color:#173b27;font:inherit}input:focus,select:focus,textarea:focus{outline:3px solid #e5d567;outline-offset:1px}button{justify-self:start;background:#285e31;color:#fff;border-radius:10px;padding:.7rem 1.1rem;font-weight:700}button:disabled,fieldset:disabled{opacity:.6}p{margin:.5rem 0;line-height:1.55}small{color:#5d6d5d}.notice{background:#faf7d8;padding:.8rem;border-radius:12px}.error{color:#922828;background:#fff0ed;padding:.8rem;border-radius:12px}.timeline{display:grid;gap:.7rem;max-height:32rem;overflow:auto;margin:1rem 0}.timeline li{border-left:3px solid #d8c94c;padding:.5rem .8rem;background:#f7faf3}.timeline time{font-size:.8rem;display:block;color:#586b57}.timeline strong{margin-right:.8rem;text-transform:capitalize}.note{white-space:pre-wrap;overflow-wrap:anywhere}details{margin:.6rem 0}summary{cursor:pointer;font-weight:600}details ol{padding-left:1.4rem;font-size:.85rem}
.production{display:grid;gap:1.5rem;color:#173b27;width:100%;min-width:0;font-family:'Plus Jakarta Sans',sans-serif}.season-heading{display:flex;align-items:center;justify-content:space-between;gap:1.5rem;padding:1.5rem 0}.season-heading h2{font-size:clamp(2rem,4vw,3.3rem);line-height:1.12;letter-spacing:-.055em;max-width:14ch}.season-heading p{max-width:55ch;color:#526858}.heading-actions{display:flex;gap:.7rem;flex-wrap:wrap}.season-ledger{display:flex;flex-wrap:wrap;gap:.65rem;color:#526858;font-size:.85rem}.season-ledger span{color:#8c9d90}.season-layout{display:grid;grid-template-columns:minmax(260px,.85fr) minmax(0,1.4fr);gap:1.5rem;align-items:start}.season-layout>*{min-width:0}.season-identity{display:flex;gap:.8rem;align-items:center}.season-identity>span:nth-child(2){display:grid;gap:.25rem;flex:1}.identity-symbol{display:grid;place-items:center;width:52px;height:52px;flex-shrink:0;border-radius:16px;background:#e4eddf;color:#066136}.selection-mark{color:#066136}.season-dates,.season-stage{display:flex;justify-content:space-between;gap:.4rem;font-size:.8rem}.season-track{height:6px;border-radius:10px;background:#dfe5da;overflow:hidden}.season-track>span{display:block;height:100%;background:#066136;border-radius:inherit}.next-work{border-top:1px solid #dce6d9;padding-top:.8rem;font-size:.85rem;font-weight:500}.active-season{margin-top:1rem;border-radius:20px;background:#066136;color:white;padding:1.5rem}.active-kind{font-size:.85rem;color:#e1efda}.date-journey{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin:1.5rem 0}.date-journey>div{display:grid;gap:.4rem}.date-journey small{color:#d4e6d2}.date-journey time{font-size:clamp(.85rem,1.5vw,1.15rem);font-weight:700}.next-action{display:grid;gap:.4rem;border-top:1px solid #568767;padding-top:1rem}.next-action strong{color:#F9C23C}.production :deep(button),.production summary{min-height:44px}.production :deep(button:focus-visible),summary:focus-visible{outline:3px solid #b48000;outline-offset:3px}.production :deep(.fb-panel){min-width:0}.production :deep(button){font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:.5rem}.production .season-card{display:grid;overflow-wrap:anywhere}.season-identity>span:nth-child(2){min-width:0}.production *{box-sizing:border-box}.production .filters{background:#F5F6F0}.production .season-card{padding:1.2rem;border-radius:20px;gap:1rem;background:white;border:2px solid #e0e7dc;box-shadow:0 3px 0 #e6eadf}.production .season-card[aria-pressed=true]{border-color:#066136;background:#F5F6F0;box-shadow:inset 5px 0 #066136}.production .timeline{list-style:none;padding-left:.6rem;max-height:none;overflow:visible}.production .timeline li{position:relative;padding:1rem 1.2rem;border-left:2px solid #b6cdb7;background:#F5F6F0;border-radius:0 14px 14px 0}.production .timeline li:before{content:'';position:absolute;left:-6px;top:1.3rem;width:10px;height:10px;border-radius:50%;background:#066136;border:2px solid white}.production .timeline time{margin-bottom:.4rem}.production input,.production select{min-height:44px}@media(max-width:850px){.season-layout{grid-template-columns:1fr}.season-cards{grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}.season-heading{align-items:start;flex-direction:column}}@media(max-width:380px){.active-season{padding:1rem}.date-journey{gap:.35rem}.date-journey time{font-size:.8rem}}@media(prefers-reduced-motion:reduce){.production *{transition:none!important;animation:none!important}}
.production .season-heading{flex-direction:row;align-items:center}.production .season-card{padding:12px;gap:8px;border-radius:14px}.production .season-heading h2{margin:0}.production .season-layout{align-items:start}
.production .find-tools summary{font-size:.85rem}.production .schedule-tools :deep(button){background:#f5f6f0;color:#173b27;border:1px solid #dce6d5}.production .schedule-tools :deep(button[aria-pressed=true]){background:#edf3e4}.production .active-season{padding:12px 16px}.production .active-season .next-action{margin:5px 0;gap:2px;font-size:1rem}.production .active-kind,.production .season-range{font-size:.8rem}
</style>
