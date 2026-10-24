<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
const props = defineProps({ section: { type: String, default: 'enterprises' }, user: { type: Object, required: true } })
const rows = ref([])
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const message = ref('')
const editing = ref('')
const deleting = ref('')
const form = reactive({})
const config = computed(() => ({ enterprises: { title: 'Your farm register', singular: 'enterprise', intro: 'Keep crops and livestock together, with the details that matter to your farm.' }, inventory: { title: 'Supplies, without surprises', singular: 'supply', intro: 'Track physical stock: seed, feed, fertiliser, tools, and harvested produce. Set low-stock thresholds and expiry dates. Bookkeeping tracks the money spent or earned, not these quantities. Stock changes do not automatically create financial records.' }, referrals: { title: 'Prepare for expert advice', singular: 'case summary', intro: 'Organise your observations before speaking with an agronomist or veterinarian.' } }[props.section]))
const fields = computed(() => props.section === 'enterprises' ? ['name', 'quantity', 'unit', 'startedOn', 'notes'] : props.section === 'inventory' ? ['name', 'quantity', 'unit', 'threshold', 'expiresOn', 'notes'] : ['title', 'summary', 'contact'])
const labels = { name: 'Name', quantity: 'Quantity', unit: 'Unit (e.g. head, acres, kg)', startedOn: 'Started on (optional)', notes: 'Notes (optional)', threshold: 'Low stock threshold', expiresOn: 'Expires on (optional)', title: 'Case title', summary: 'Observations and questions', contact: 'Your chosen professional / contact (optional)' }
const limits = { name: 150, unit: 60, notes: 4000, title: 200, summary: 6000, contact: 300 }
function reset(item) {
  for (const key of Object.keys(form)) delete form[key]
  Object.assign(form, props.section === 'enterprises' ? { kind: props.user.farmType === 'livestock' ? 'livestock' : 'crops', name: '', quantity: '', unit: '', startedOn: '', notes: '' } : props.section === 'inventory' ? { name: '', quantity: 0, unit: '', threshold: 0, expiresOn: '', notes: '' } : { title: '', professionalType: 'agronomist', summary: '', contact: '', status: 'draft' })
  editing.value = item?.id || ''
  if (item) for (const key of Object.keys(form)) form[key] = item[key] ?? ''
  deleting.value = ''
}
let generation = 0
async function load() {
  const version = ++generation
  rows.value = []
  loading.value = true
  error.value = ''
  message.value = ''
  reset()
  try {
    const result = await $fetch('/api/tools')
    if (version === generation) rows.value = result[props.section] || []
  } catch (e) { if (version === generation) error.value = e.data?.statusMessage || 'Could not load saved items. Please try again.' }
  finally { if (version === generation) loading.value = false }
}
onMounted(load)
watch(() => [props.section, props.user.id], load)
async function save() {
  busy.value = true
  error.value = ''
  message.value = ''
  const section = props.section
  const version = generation
  const input = { ...form }
  for (const key of ['quantity', 'threshold']) if (key in input) input[key] = input[key] === '' ? null : Number(input[key])
  try {
    const result = await $fetch(`/api/tools/${section}${editing.value ? `/${editing.value}` : ''}`, { method: editing.value ? 'PATCH' : 'POST', body: input })
    if (version !== generation) return
    const item = result[{ enterprises: 'enterprise', inventory: 'inventory', referrals: 'referral' }[section]]
    const index = rows.value.findIndex(row => row.id === item.id)
    if (index < 0) rows.value.unshift(item)
    else rows.value[index] = item
    reset()
    message.value = 'Saved to your farm.'
  } catch (e) { if (version === generation) error.value = e.data?.statusMessage || 'Could not save. Your form is still here. Please try again.' }
  finally { busy.value = false }
}
async function remove(item) {
  busy.value = true
  error.value = ''
  const version = generation
  try {
    await $fetch(`/api/tools/${props.section}/${item.id}`, { method: 'DELETE' })
    if (version !== generation) return
    rows.value = rows.value.filter(row => row.id !== item.id)
    if (editing.value === item.id) reset()
    deleting.value = ''
    message.value = 'Item deleted.'
  } catch (e) { if (version === generation) error.value = e.data?.statusMessage || 'Could not delete. Please try again.' }
  finally { busy.value = false }
}
function expired(item) {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return item.expiresOn && item.expiresOn < today
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
    <header class="rounded-3xl bg-[#173f35] p-6 text-white sm:p-8">
      <p class="text-xs font-semibold uppercase tracking-[.2em] text-emerald-200">Farm management</p>
      <h2 class="mt-2 text-2xl font-semibold sm:text-3xl">{{ config.title }}</h2>
      <p class="mt-3 max-w-2xl text-sm leading-6 text-emerald-50">{{ config.intro }}</p>
    </header>
    <p v-if="section === 'referrals'" class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">These are saved case summaries, not verified providers or sent requests. Contacts are entered by you. Nothing is sent externally. For urgent animal or crop health concerns, contact a qualified local professional directly.</p>
    <p v-if="error" role="alert" class="rounded-xl bg-red-50 p-4 text-sm text-red-800">{{ error }}</p>
    <p v-if="message" role="status" class="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{{ message }}</p>
    <div class="grid items-start gap-6 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
      <form class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" @submit.prevent="save">
        <h3 class="text-lg font-semibold text-slate-900">{{ editing ? 'Edit' : 'Add' }} {{ config.singular }}</h3>
        <fieldset class="mt-5 space-y-4" :disabled="busy || loading">
          <label v-if="section === 'enterprises'" class="block text-sm font-medium text-slate-700">Register type<select v-model="form.kind" class="management-input"><option value="crops">Crops</option><option value="livestock">Livestock / poultry</option></select></label>
          <template v-if="section === 'referrals'">
            <label class="block text-sm font-medium text-slate-700">Professional type<select v-model="form.professionalType" class="management-input"><option value="agronomist">Agronomist</option><option value="veterinarian">Veterinarian</option></select></label>
            <label class="block text-sm font-medium text-slate-700">Your case status<select v-model="form.status" class="management-input"><option value="draft">Draft</option><option value="contacted">Contacted by me</option><option value="resolved">Resolved</option></select></label>
          </template>
          <label v-for="field in fields" :key="field" class="block text-sm font-medium text-slate-700">{{ labels[field] }}
            <textarea v-if="['notes','summary'].includes(field)" v-model="form[field]" :required="field === 'summary'" :maxlength="limits[field]" rows="4" class="management-input" />
            <input v-else v-model="form[field]" :type="['quantity','threshold'].includes(field) ? 'number' : ['startedOn','expiresOn'].includes(field) ? 'date' : 'text'" :min="['quantity','threshold'].includes(field) ? 0 : undefined" :max="['quantity','threshold'].includes(field) ? 1000000000000 : undefined" :step="['quantity','threshold'].includes(field) ? 'any' : undefined" :maxlength="limits[field]" :required="['name','title','threshold'].includes(field) || (field === 'quantity' && section === 'inventory')" class="management-input" />
          </label>
          <div class="flex flex-wrap gap-3 pt-2"><button type="submit" class="rounded-xl bg-[#173f35] px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50">{{ busy ? 'Saving…' : editing ? 'Save changes' : 'Save ' + config.singular }}</button><button v-if="editing" type="button" class="rounded-xl border border-slate-300 px-4 py-3 text-sm" @click="reset()">Cancel editing</button></div>
        </fieldset>
      </form>
      <div class="space-y-4" :aria-busy="loading">
        <div class="flex items-center justify-between"><h3 class="font-semibold text-slate-900">Saved items <span class="text-slate-400">({{ rows.length }})</span></h3><button type="button" :disabled="busy || loading" class="rounded-lg px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50" @click="load">Refresh</button></div>
        <p v-if="loading" role="status" class="p-8 text-center text-slate-500">Loading your farm…</p>
        <div v-else-if="!rows.length" class="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center"><h4 class="font-semibold text-slate-800">A little organisation goes a long way</h4><p class="mt-2 text-sm leading-6 text-slate-500">Add your first {{ config.singular }} using the form. It will be saved privately to your account.</p></div>
        <article v-for="item in rows" :key="item.id" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="flex flex-wrap items-start justify-between gap-3"><h4 class="break-words text-lg font-semibold text-slate-900">{{ item.name || item.title }}</h4><span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize text-slate-600">{{ item.kind || item.status || 'Supply' }}</span></div>
          <template v-if="section === 'inventory'"><div class="mt-3 flex flex-wrap gap-2"><span v-if="item.quantity <= item.threshold" class="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">Low stock</span><span v-if="expired(item)" class="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">Expired</span></div><p class="mt-3 text-sm text-slate-700">{{ item.quantity }} {{ item.unit }} on hand · Low stock at {{ item.threshold }}</p><p v-if="item.expiresOn" class="mt-1 text-sm text-slate-500">Expires {{ item.expiresOn }}</p></template>
          <template v-else-if="section === 'enterprises'"><p v-if="item.quantity !== null" class="mt-3 text-sm text-slate-700">{{ item.quantity }} {{ item.unit }}</p><p v-if="item.startedOn" class="mt-1 text-sm text-slate-500">Started {{ item.startedOn }}</p></template>
          <template v-else><p class="mt-3 text-sm capitalize text-slate-600">For an {{ item.professionalType }}</p><p class="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{{ item.summary }}</p><p v-if="item.contact" class="mt-3 break-words text-sm text-slate-500">Farmer-entered contact: {{ item.contact }}</p><div class="mt-3 flex flex-wrap gap-3"><button type="button" class="text-sm font-medium text-emerald-800 underline" @click="copy(item)">Copy summary</button><button type="button" class="text-sm font-medium text-emerald-800 underline" @click="download(item)">Download summary</button></div></template>
          <p v-if="item.notes" class="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{{ item.notes }}</p>
          <div v-if="deleting === item.id" class="mt-4 rounded-xl bg-red-50 p-3" role="group" aria-label="Confirm deletion"><p class="text-sm text-red-900">Delete this {{ config.singular }} permanently?</p><div class="mt-3 flex gap-3"><button type="button" :disabled="busy" class="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="remove(item)">Yes, delete</button><button type="button" :disabled="busy" class="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-900" @click="deleting = ''">Keep item</button></div></div>
          <div v-else class="mt-4 flex gap-4 border-t border-slate-100 pt-3"><button type="button" :disabled="busy" class="rounded px-1 py-1 text-sm font-semibold text-emerald-800 disabled:opacity-50" @click="reset(item)">Edit</button><button type="button" :disabled="busy" class="rounded px-1 py-1 text-sm text-red-700 disabled:opacity-50" @click="deleting = item.id">Delete</button></div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.management-input { display: block; width: 100%; margin-top: .5rem; border: 1px solid #cbd5e1; border-radius: .75rem; padding: .7rem .85rem; background: white; color: #0f172a; font-weight: 400; }
.management-input:focus { outline: 2px solid #059669; outline-offset: 2px; }
button:focus-visible { outline: 2px solid #059669; outline-offset: 3px; }
</style>
