<script setup>
import { computed, reactive, ref, watch } from 'vue'
const props = defineProps({ state: { type: Object, required: true }, busy: Boolean })
const emit = defineEmits(['command'])
const planning = computed(() => props.state.planning || { plots: [], seasons: [], events: [] })
const canPlan = computed(() => ['owner', 'manager'].includes(props.state.farm?.role))
const canLog = computed(() => ['owner', 'manager', 'worker'].includes(props.state.farm?.role))
const selected = ref('')
const filter = ref('')
const error = ref('')
const notice = ref('')
const plot = reactive({ name: '', coordinates: '', areaHa: '' })
const season = reactive({ name: '', kind: 'crops', enterpriseId: '', plotId: '', startsOn: '', endsOn: '' })
const schedule = reactive({ title: '', date: '' })
const event = reactive({ type: 'observation', date: '', quantity: '', unit: '', note: '' })
const active = computed(() => planning.value.seasons.find(row => row.id === selected.value))
const history = computed(() => planning.value.events.filter(row => row.seasonId === selected.value && (!filter.value || row.type === filter.value)).slice().sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '')))
const agenda = computed(() => (active.value?.schedule || []).slice().sort((a, b) => a.date.localeCompare(b.date)))
const types = ['health', 'breeding', 'feeding', 'production', 'observation', 'planting']
watch(() => props.state.farm?.id, () => { selected.value = ''; filter.value = ''; error.value = ''; notice.value = '' })
watch(() => planning.value.seasons, rows => { if (!rows.some(row => row.id === selected.value)) selected.value = rows[0]?.id || '' }, { immediate: true })
function send(action, fields) {
  if (props.busy) return
  error.value = ''; notice.value = 'Draft retained. Saved entries appear below after the command succeeds.'
  emit('command', { action, ...fields })
}
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
    <header><p class="eyebrow">CONNECTED PRODUCTION</p><h2>Plan the season. Keep the history.</h2><p>Map plots, schedule farm work, and keep crop or animal-group observations together.</p></header>
    <p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="notice" role="status" class="notice">{{ notice }}</p>
    <div class="card"><h3>Plot boundaries</h3><ClientOnly><FarmPlotMap :plots="planning.plots" /><template #fallback><p>Loading plot map…</p></template></ClientOnly>
      <p v-if="!planning.plots.length">No plots yet. Add boundary coordinates to start your farm map.</p>
      <details v-for="row in planning.plots" :key="row.id"><summary>{{ row.name }} <span v-if="row.areaHa"> · {{ row.areaHa }} ha (entered)</span></summary><ol><li v-for="(point, index) in row.coordinates" :key="index">{{ point.join(', ') }}</li></ol></details>
      <form v-if="canPlan" @submit.prevent="savePlot"><fieldset :disabled="busy"><legend>Add a plot</legend><label>Plot name<input v-model="plot.name" required maxlength="150" /></label><label>Boundary coordinates<textarea v-model="plot.coordinates" required rows="4" placeholder="7.410, 3.910&#10;7.415, 3.910&#10;7.415, 3.915" /></label><small>Latitude, longitude per line, following the boundary in order. 3 to 100 points.</small><label>Area in hectares (optional, not calculated)<input v-model="plot.areaHa" type="number" min="0.000001" max="1000000000" step="any" /></label><button>Add plot</button></fieldset></form>
    </div>
    <div class="columns"><div class="card"><h3>Seasons & animal groups</h3><p v-if="!planning.seasons.length">No seasons yet. Create a crop cycle or a livestock group's management period.</p><label>View season<select v-model="selected"><option value="" disabled>Choose a season</option><option v-for="row in planning.seasons" :key="row.id" :value="row.id">{{ row.name }} · {{ row.kind }}</option></select></label>
      <form v-if="canPlan" @submit.prevent="saveSeason"><fieldset :disabled="busy"><legend>Create a season</legend><label>Season / animal group name<input v-model="season.name" required maxlength="150" placeholder="North field maize / Dairy herd 2026" /></label><label>Kind<select v-model="season.kind"><option value="crops">Crops</option><option value="livestock">Livestock</option></select></label><label>Farm register link (optional)<select v-model="season.enterpriseId"><option value="">No register link</option><option v-for="row in state.enterprises || []" :key="row.id" :value="row.id">{{ row.name }}</option></select></label><label>Plot (optional)<select v-model="season.plotId"><option value="">No plot</option><option v-for="row in planning.plots" :key="row.id" :value="row.id">{{ row.name }}</option></select></label><div class="columns"><label>Starts<input v-model="season.startsOn" type="date" required /></label><label>Ends<input v-model="season.endsOn" type="date" :min="season.startsOn" required /></label></div><button>Create season</button></fieldset></form>
    </div><div v-if="active" class="card"><h3>{{ active.name }}</h3><p>{{ active.startsOn }} to {{ active.endsOn }} · {{ active.kind }}</p><p v-if="active.plotId">Plot: {{ planning.plots.find(row => row.id === active.plotId)?.name || 'Unavailable' }}</p><h4>Schedule</h4><p v-if="!agenda.length">No scheduled work.</p><ol class="timeline"><li v-for="row in agenda" :key="row.id"><time>{{ row.date }}</time><strong>{{ row.title }}</strong></li></ol>
      <form v-if="canPlan" @submit.prevent="send('schedule.create', { ...schedule, seasonId: selected })"><fieldset :disabled="busy"><legend>Schedule work</legend><label>Work title<input v-model="schedule.title" required maxlength="200" /></label><label>Date<input v-model="schedule.date" type="date" :min="active.startsOn" :max="active.endsOn" required /></label><button>Add to schedule</button></fieldset></form>
    </div></div>
    <div v-if="active" class="card"><h3>{{ active.kind === 'livestock' ? 'Animal group history' : 'Crop season history' }}</h3><p>Observations do not change stock or bookkeeping. Record harvested stock through the business harvest tool.</p><label>Filter history<select v-model="filter"><option value="">All event types</option><option v-for="type in types" :key="type" :value="type">{{ type }}</option><option value="harvest">harvest</option></select></label><p v-if="!history.length">No matching events recorded.</p><ol class="timeline"><li v-for="row in history" :key="row.id"><time>{{ row.date }}</time><strong>{{ row.type }}</strong><span v-if="row.quantity !== undefined">{{ row.quantity }} {{ row.unit }}</span><p class="note">{{ row.note }}</p></li></ol>
      <form v-if="canLog" @submit.prevent="saveEvent"><fieldset :disabled="busy"><legend>Record an observation / activity</legend><div class="columns"><label>Event type<select v-model="event.type"><option v-for="type in types" :key="type" :value="type">{{ type }}</option></select></label><label>Date<input v-model="event.date" type="date" :min="active.startsOn" :max="active.endsOn" required /></label><label>Quantity (optional)<input v-model="event.quantity" type="number" min="0.000001" max="1000000000" step="any" /></label><label>Unit<input v-model="event.unit" :required="event.quantity !== ''" maxlength="60" placeholder="kg, head, litres" /></label></div><label>Notes<textarea v-model="event.note" maxlength="4000" rows="3" placeholder="Include animal tag / group, symptoms, feed or treatment details as appropriate." /></label><button>Save event</button></fieldset></form>
    </div>
    <p v-if="!canLog" class="notice">Read-only access. An owner or manager can update planning.</p>
  </section>
</template>
<style scoped>
.production{display:grid;gap:1.25rem;color:#173b27}.eyebrow{font-size:.72rem;font-weight:800;letter-spacing:.12em;color:#527331}h2{font-size:clamp(1.5rem,4vw,2.1rem);font-weight:800}h3{font-size:1.2rem;font-weight:750}h4{font-weight:700;margin-top:1rem}.card{background:#fff;border:1px solid #dce6d9;border-radius:20px;padding:clamp(1rem,3vw,1.5rem);min-width:0}.columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:1rem}form{margin-top:1.25rem;border-top:1px solid #e5ebdf;padding-top:1rem}fieldset{display:grid;gap:.8rem;min-width:0}legend{font-weight:750;padding-bottom:.6rem}label{display:grid;gap:.35rem;font-size:.88rem;font-weight:600}input,select,textarea{width:100%;min-width:0;border:1px solid #bdcbb8;border-radius:10px;padding:.65rem;background:#fcfdf9;color:#173b27;font:inherit}input:focus,select:focus,textarea:focus{outline:3px solid #e5d567;outline-offset:1px}button{justify-self:start;background:#285e31;color:#fff;border-radius:10px;padding:.7rem 1.1rem;font-weight:700}button:disabled,fieldset:disabled{opacity:.6}p{margin:.5rem 0;line-height:1.55}small{color:#5d6d5d}.notice{background:#faf7d8;padding:.8rem;border-radius:12px}.error{color:#922828;background:#fff0ed;padding:.8rem;border-radius:12px}.timeline{display:grid;gap:.7rem;max-height:32rem;overflow:auto;margin:1rem 0}.timeline li{border-left:3px solid #d8c94c;padding:.5rem .8rem;background:#f7faf3}.timeline time{font-size:.8rem;display:block;color:#586b57}.timeline strong{margin-right:.8rem;text-transform:capitalize}.note{white-space:pre-wrap;overflow-wrap:anywhere}details{margin:.6rem 0}summary{cursor:pointer;font-weight:600}details ol{padding-left:1.4rem;font-size:.85rem}
</style>
