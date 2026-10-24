<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import FbButton from './ui/FbButton.vue'
import FbBadge from './ui/FbBadge.vue'
import FbPageHeader from './ui/FbPageHeader.vue'
import FbPanel from './ui/FbPanel.vue'
import FbEmptyState from './ui/FbEmptyState.vue'
import FbDialog from './ui/FbDialog.vue'
import { filterManagementRows, stockStatus, numericInput } from '../utils/management-board.js'
const props = defineProps({ section: { type: String, default: 'enterprises' }, user: { type: Object, required: true } })
const rows = ref([])
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const message = ref('')
const editing = ref('')
const editingVersion = ref('')
const deleting = ref('')
const form = reactive({})
const dialogOpen = ref(false)
const search = ref('')
const filter = ref('all')
const sort = ref('name')
const visibleRows = computed(() => filterManagementRows(rows.value, { search: search.value, filter: filter.value, sort: sort.value, section: props.section }))
const lowCount = computed(() => rows.value.filter(row => stockStatus(row).low).length)
const expiredCount = computed(() => rows.value.filter(row => stockStatus(row).expired).length)
function compose(item) {
  if (busy.value || loading.value) return
  reset(item)
  dialogOpen.value = true
}
const config = computed(() => ({ enterprises: { title: 'Your farm register', singular: 'enterprise', intro: 'Keep crops and livestock together, with the details that matter to your farm.' }, inventory: { title: 'Supplies, without surprises', singular: 'supply', intro: 'Track physical stock: seed, feed, fertiliser, tools, and harvested produce. Set low-stock thresholds and expiry dates. Bookkeeping tracks the money spent or earned, not these quantities. Manual stock adjustments do not create financial records. Production harvests, task input use and confirmed sales update linked stock through their workflows.' }, referrals: { title: 'Prepare for expert advice', singular: 'case summary', intro: 'Organise your observations before speaking with an agronomist or veterinarian.' } }[props.section]))
const fields = computed(() => props.section === 'enterprises' ? ['name', 'quantity', 'unit', 'startedOn', 'notes'] : props.section === 'inventory' ? ['name', 'quantity', 'unit', 'threshold', 'expiresOn', 'notes'] : ['title', 'summary', 'contact'])
const labels = { name: 'Name', quantity: 'Quantity', unit: 'Unit (e.g. head, acres, kg)', startedOn: 'Started on (optional)', notes: 'Notes (optional)', threshold: 'Low stock threshold', expiresOn: 'Expires on (optional)', title: 'Case title', summary: 'Observations and questions', contact: 'Your chosen professional / contact (optional)' }
const limits = { name: 150, unit: 60, notes: 4000, title: 200, summary: 6000, contact: 300 }
function reset(item) {
  for (const key of Object.keys(form)) delete form[key]
  Object.assign(form, props.section === 'enterprises' ? { kind: props.user.farmType === 'livestock' ? 'livestock' : 'crops', name: '', quantity: '', unit: '', startedOn: '', notes: '' } : props.section === 'inventory' ? { name: '', quantity: 0, unit: '', threshold: 0, expiresOn: '', notes: '' } : { title: '', professionalType: 'agronomist', summary: '', contact: '', status: 'draft' })
  editing.value = item?.id || ''
  editingVersion.value = item?.updatedAt || ''
  if (item) for (const key of Object.keys(form)) form[key] = item[key] ?? ''
  deleting.value = ''
}
let generation = 0
let controller
function invalidate() {
  generation++
  controller?.abort()
  controller = new AbortController()
  busy.value = false
  return generation
}
async function load() {
  const version = invalidate()
  rows.value = []
  loading.value = true
  error.value = ''
  message.value = ''
  reset()
  dialogOpen.value = false
  search.value = ''
  filter.value = 'all'
  try {
    const result = await $fetch('/api/tools', { signal: controller.signal })
    if (version === generation) rows.value = result[props.section] || []
  } catch (e) { if (version === generation) error.value = e.data?.statusMessage || 'Could not load saved items. Please try again.' }
  finally { if (version === generation) loading.value = false }
}
onMounted(load)
watch(() => [props.section, props.user.id], load, { flush: 'sync' })
onBeforeUnmount(() => { invalidate(); rows.value = []; loading.value = false })
async function save() {
  if (busy.value || loading.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  const section = props.section
  const version = generation
  const input = { ...form, ...(editing.value && editingVersion.value ? { expectedUpdatedAt: editingVersion.value } : {}) }
  try {
    for (const key of ['quantity', 'threshold']) if (key in input) input[key] = numericInput(input[key], key === 'quantity' && section === 'enterprises', key)
    const result = await $fetch(`/api/tools/${section}${editing.value ? `/${editing.value}` : ''}`, { method: editing.value ? 'PATCH' : 'POST', body: input, signal: controller.signal })
    if (version !== generation) return
    const item = result[{ enterprises: 'enterprise', inventory: 'inventory', referrals: 'referral' }[section]]
    const index = rows.value.findIndex(row => row.id === item.id)
    if (index < 0) rows.value.unshift(item)
    else rows.value[index] = item
    reset()
    dialogOpen.value = false
    message.value = 'Saved to your farm.'
  } catch (e) { if (version === generation) error.value = e.data?.statusMessage || e.message || 'Could not save. Your form is still here. Please try again.' }
  finally { if (version === generation) busy.value = false }
}
async function remove(item) {
  if (busy.value || loading.value || deleting.value !== item.id) return
  busy.value = true
  error.value = ''
  const version = generation
  try {
    await $fetch(`/api/tools/${props.section}/${item.id}`, { method: 'DELETE', signal: controller.signal })
    if (version !== generation) return
    rows.value = rows.value.filter(row => row.id !== item.id)
    if (editing.value === item.id) reset()
    deleting.value = ''
    message.value = 'Item deleted.'
  } catch (e) { if (version === generation) error.value = e.data?.statusMessage || 'Could not delete. Please try again.' }
  finally { if (version === generation) busy.value = false }
}
function summary(item) { return `${item.title}\nProfessional: ${item.professionalType}\nStatus: ${item.status}\n\n${item.summary}\n\nFarmer-entered contact: ${item.contact || 'Not provided'}\n\nSaved case summary only. No request has been sent and no provider has been verified.` }
async function copy(item) {
  try { await navigator.clipboard.writeText(summary(item)); message.value = 'Summary copied. Share it only with someone you trust.' }
  catch { error.value = 'Clipboard unavailable. Use Download summary instead.' }
}
function download(item) {
  const url = URL.createObjectURL(new Blob([summary(item)], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'farm-case-summary.txt'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <section v-if="config" class="space-y-6" :aria-label="config.title">
    <FbPageHeader :title="config.title" :description="config.intro">
      <template #actions><FbButton :disabled="busy || loading" @click="compose()">Add {{ config.singular }}</FbButton></template>
    </FbPageHeader>
    <p v-if="section === 'referrals'" class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">These are saved case summaries, not verified providers or sent requests. Contacts are entered by you. Nothing is sent externally. For urgent animal or crop health concerns, contact a qualified local professional directly.</p>
    <p v-if="error" role="alert" class="rounded-xl bg-red-50 p-4 text-sm text-red-800">{{ error }}</p>
    <p v-if="message" role="status" class="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{{ message }}</p>
    <div class="space-y-6">
      <FbDialog v-model:open="dialogOpen" :title="`${editing ? 'Edit' : 'Add'} ${config.singular}`" :busy="busy" description="Save the details for your farm. Stock changes here do not create financial records.">
      <form @submit.prevent="save">
        <p v-if="error" role="alert" class="text-sm text-red-800">{{ error }} Your entered details have been kept.</p>
        <fieldset class="mt-5 space-y-4" :disabled="busy || loading">
          <label v-if="section === 'enterprises'" class="block text-sm font-medium text-slate-700">Register type<select v-model="form.kind" class="fb-input"><option value="crops">Crops</option><option value="livestock">Livestock / poultry</option></select></label>
          <template v-if="section === 'referrals'">
            <label class="block text-sm font-medium text-slate-700">Professional type<select v-model="form.professionalType" class="fb-input"><option value="agronomist">Agronomist</option><option value="veterinarian">Veterinarian</option></select></label>
            <label class="block text-sm font-medium text-slate-700">Your case status<select v-model="form.status" class="fb-input"><option value="draft">Draft</option><option value="contacted">Contacted by me</option><option value="resolved">Resolved</option></select></label>
          </template>
          <label v-for="field in fields" :key="field" class="block text-sm font-medium text-slate-700">{{ labels[field] }}
            <textarea v-if="['notes','summary'].includes(field)" v-model="form[field]" :required="field === 'summary'" :maxlength="limits[field]" rows="4" class="fb-input" />
            <input v-else v-model="form[field]" :type="['quantity','threshold'].includes(field) ? 'number' : ['startedOn','expiresOn'].includes(field) ? 'date' : 'text'" :min="['quantity','threshold'].includes(field) ? 0 : undefined" :max="['quantity','threshold'].includes(field) ? 1000000000000 : undefined" :step="['quantity','threshold'].includes(field) ? 'any' : undefined" :maxlength="limits[field]" :required="['name','title','threshold'].includes(field) || (field === 'quantity' && section === 'inventory')" class="fb-input" />
          </label>
          <div class="flex flex-wrap gap-3 pt-2"><FbButton type="submit" :busy="busy" :disabled="loading">{{ editing ? 'Save changes' : 'Save ' + config.singular }}</FbButton><FbButton variant="secondary" :disabled="busy" @click="dialogOpen = false">Cancel</FbButton></div>
        </fieldset>
      </form>
      </FbDialog>
      <FbPanel>
      <div class="space-y-4" :aria-busy="loading">
        <div class="flex flex-wrap items-center justify-between gap-3"><h3 class="font-semibold text-slate-900">Saved items ({{ rows.length }})</h3><div v-if="section === 'inventory'" class="flex gap-2"><FbBadge tone="warning">{{ lowCount }} low stock</FbBadge><FbBadge tone="danger">{{ expiredCount }} expired</FbBadge></div><FbButton variant="ghost" :disabled="busy || loading" @click="load">Refresh</FbButton></div>
        <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label class="text-sm">Search items<input v-model="search" type="search" class="fb-input" placeholder="Search name, unit or notes" /></label>
          <label class="text-sm">Filter<select v-model="filter" class="fb-input"><option value="all">All items</option><template v-if="section === 'inventory'"><option value="low">Low stock</option><option value="expired">Expired</option><option value="healthy">In stock, not expired</option></template><template v-else-if="section === 'enterprises'"><option value="crops">Crops</option><option value="livestock">Livestock / poultry</option></template><template v-else><option value="draft">Draft</option><option value="contacted">Contacted by me</option><option value="resolved">Resolved</option></template></select></label>
          <label class="text-sm">Sort<select v-model="sort" class="fb-input"><option value="name">Name A–Z</option><option value="quantity">Quantity: low first</option><option value="newest">Recently updated</option></select></label>
        </div>
        <p v-if="loading" role="status" class="p-8 text-center text-slate-500">Loading your farm…</p>
        <FbEmptyState v-else-if="error && !rows.length" title="Unable to load saved items" :description="error"><FbButton :disabled="busy" @click="load">Try again</FbButton></FbEmptyState>
        <FbEmptyState v-else-if="!rows.length" :title="`No ${config.singular} saved yet`" description="Add your first item. It will be saved privately to your account."><FbButton @click="compose()">Add {{ config.singular }}</FbButton></FbEmptyState>
        <FbEmptyState v-else-if="!visibleRows.length" title="No matching items" description="Try another search or filter."><FbButton variant="secondary" @click="search = ''; filter = 'all'">Clear filters</FbButton></FbEmptyState>
        <p v-if="!loading && rows.length" class="text-sm text-slate-500">Showing {{ visibleRows.length }} of {{ rows.length }} saved items</p>
        <article v-for="item in visibleRows" :key="item.id" class="management-row border-b border-slate-200 py-5">
          <div class="flex flex-wrap items-start justify-between gap-3"><h4 class="break-words text-lg font-semibold text-slate-900">{{ item.name || item.title }}</h4><FbBadge>{{ item.kind || item.status || 'Supply' }}</FbBadge></div>
          <template v-if="section === 'inventory'"><div class="mt-3 flex flex-wrap gap-2"><FbBadge v-if="stockStatus(item).low" tone="warning">Low stock</FbBadge><FbBadge v-if="stockStatus(item).expired" tone="danger">Expired</FbBadge></div><p class="mt-3 text-sm text-slate-700">{{ item.quantity }} {{ item.unit }} on hand · Low stock at {{ item.threshold }}</p><p v-if="item.expiresOn" class="mt-1 text-sm text-slate-500">Expires {{ item.expiresOn }}</p></template>
          <template v-else-if="section === 'enterprises'"><p v-if="item.quantity !== null" class="mt-3 text-sm text-slate-700">{{ item.quantity }} {{ item.unit }}</p><p v-if="item.startedOn" class="mt-1 text-sm text-slate-500">Started {{ item.startedOn }}</p></template>
          <template v-else><p class="mt-3 text-sm capitalize text-slate-600">For an {{ item.professionalType }}</p><p class="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{{ item.summary }}</p><p v-if="item.contact" class="mt-3 break-words text-sm text-slate-500">Farmer-entered contact: {{ item.contact }}</p><div class="mt-3 flex flex-wrap gap-3"><button type="button" class="text-sm font-medium text-emerald-800 underline" @click="copy(item)">Copy summary</button><button type="button" class="text-sm font-medium text-emerald-800 underline" @click="download(item)">Download summary</button></div></template>
          <p v-if="item.notes" class="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{{ item.notes }}</p>
          <div v-if="deleting === item.id" class="mt-4 rounded-xl bg-red-50 p-3" role="group" aria-label="Confirm deletion"><p class="text-sm text-red-900">Delete this {{ config.singular }} permanently?</p><div class="mt-3 flex gap-3"><FbButton variant="danger" :busy="busy" :disabled="loading" @click="remove(item)">Yes, delete</FbButton><FbButton variant="secondary" :disabled="busy || loading" @click="deleting = ''">Keep item</FbButton></div></div>
          <div v-else class="mt-4 flex gap-3"><FbButton variant="ghost" :disabled="busy || loading" @click="compose(item)">Edit</FbButton><FbButton variant="danger" :disabled="busy || loading" @click="deleting = item.id">Delete</FbButton></div>
        </article>
      </div>
      </FbPanel>
    </div>
  </section>
</template>

<style scoped>
.management-row:last-child { border-bottom: 0; }
@media (min-width: 1024px) {
  .management-row { display: grid; grid-template-columns: minmax(180px, 1.3fr) repeat(2, minmax(140px, 1fr)); gap: .5rem 1.5rem; align-items: start; }
}
</style>
