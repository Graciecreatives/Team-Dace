<script setup>
import FarmHome from './FarmHome.vue'
import FarmProfile from './FarmProfile.vue'
import FarmJournal from './FarmJournal.vue'
import FbDialog from './ui/FbDialog.vue'
import FbButton from './ui/FbButton.vue'
import FarmSettings from './FarmSettings.vue'
import FarmWatch from './FarmWatch.vue'
import FarmBookkeeping from './FarmBookkeeping.vue'
import FarmMarketplace from './FarmMarketplace.vue'
import FarmWorkspace from './FarmWorkspace.vue'
import { Sprout, LayoutDashboard, ClipboardList, Bell, UserRound, Settings, ArrowUpRight, Plus, Wallet, TrendingUp, TrendingDown, CalendarDays, Check, X, Menu, Leaf, ShieldCheck, Camera, LoaderCircle, Trash2, Bot, CloudSun, Users, Store, Package, NotebookPen } from 'lucide-vue-next'

useHead({ title: 'Your farm dashboard | FarmBuddy' })
const { data: session, error: sessionError, refresh: refreshSession } = await useFetch('/api/auth/me')
if (sessionError.value || !session.value?.user) await navigateTo('/login', { replace: true })
else if (session.value.user.onboardingCompleted !== true) await navigateTo('/onboarding', { replace: true })
const user = computed(() => session.value?.user || {})
const farmerInitials = computed(() => (user.value.name || 'Farmer').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase())
const route = useRoute()
const canonicalPath = computed(() => user.value.farmType === 'crops' ? '/dashboard/crops' : ['livestock', 'poultry'].includes(user.value.farmType) ? '/dashboard/livestock' : '/dashboard')
if (session.value?.user?.onboardingCompleted === true && route.path.replace(/\/$/, '') !== canonicalPath.value) await navigateTo(canonicalPath.value, { replace: true })
const farmTypeLabel = computed(() => ({ crops: 'Crop farming', livestock: 'Livestock farming', poultry: 'Poultry farming', mixed: 'Mixed farming' })[user.value.farmType] || 'Not provided')
const tailored = computed(() => {
  if (user.value.farmType === 'crops') return { heading: 'Your crops, season by season.', hero: 'Strong roots start with small steps.', copy: 'From planting to harvest, keep your field work, input costs, and crop sales together. One useful note today can make the next season easier.', record: 'e.g. Sold 5 bags of maize', reminder: 'e.g. Check seedlings and water the nursery', hint: 'Start with your latest planting date, seed purchase, or harvest sale.', tasks: 'Plan watering, weeding, fertiliser application, or harvest tasks.', photos: 'Plant photo disease guidance and crop identification' }
  if (['livestock', 'poultry'].includes(user.value.farmType)) return { heading: user.value.farmType === 'poultry' ? 'Your flock, cared for every day.' : 'Your animals, cared for every day.', hero: 'Every day of care makes a difference.', copy: 'Keep feeding routines, animal care notes, feed costs, and sales in one calm workspace. Start small and build a clearer picture of your herd or flock.', record: user.value.farmType === 'poultry' ? 'e.g. Sold 20 trays of eggs' : 'e.g. Purchased feed for the herd', reminder: user.value.farmType === 'poultry' ? 'e.g. Review the flock vaccination schedule' : 'e.g. Check water troughs and feed supplies', hint: 'Start with a feed purchase, animal sale, or daily care note.', tasks: 'Plan feeding, housing checks, or a vaccination appointment with your vet.', photos: 'Animal photo disease guidance' }
  return { heading: 'Your whole farm, growing together.', hero: 'A little care today. A stronger farm tomorrow.', copy: 'Bring crop work and animal care together with your costs, sales, and next tasks. You do not have to remember everything on your own.', record: 'e.g. Bought maize seed and poultry feed', reminder: 'e.g. Water seedlings and check animal feed', hint: 'Start with a crop or animal activity, input purchase, or farm sale.', tasks: 'Plan feeding, vaccination appointments, planting, or harvest tasks.', photos: 'Plant and animal photo disease guidance, plus crop identification' }
})
const { data: farm, refresh: refreshFarm, error: loadError } = await useFetch('/api/farm', { default: () => ({ records: [], reminders: [] }) })
const records = computed(() => farm.value?.records || [])
const reminders = computed(() => farm.value?.reminders || [])
const section = ref('overview')
const watchStarted = ref(false)
const unreadWatch = ref(0)
const mobileMenu = ref(false)
const menuTrigger = ref(null)
let desktopMedia
let savedBodyOverflow
function closeMenu(restoreFocus = false) {
  mobileMenu.value = false
  if (restoreFocus) nextTick(() => menuTrigger.value?.focus())
}
function onBreakpointChange() {
  if (desktopMedia?.matches) closeMenu()
}
const dialog = ref(null)
const saving = ref(false)
const loggingOut = ref(false)
const pendingReminder = ref('')
const deleting = ref('')
const error = ref('')
const feedback = ref('')
let dialogTrigger = null
watch(dialog, value => {
  if (!import.meta.client) return
  if (!value) nextTick(() => dialogTrigger?.focus())
})
watch([dialog, mobileMenu], ([activeDialog, activeMenu]) => {
  if (!import.meta.client) return
  if (activeDialog || activeMenu) {
    if (savedBodyOverflow === undefined) savedBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  } else if (savedBodyOverflow !== undefined) {
    document.body.style.overflow = savedBodyOverflow
    savedBodyOverflow = undefined
  }
}, { flush: 'sync' })
const recordForm = reactive({ title: '', category: 'activity', amount: '', note: '' })
const reminderForm = reactive({ title: '', date: '' })
const today = new Date().toLocaleDateString('en-CA')
const nav = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'planning', label: 'Production planning', icon: Sprout },
  { id: 'operations', label: 'Daily operations', icon: CalendarDays },
  { id: 'business', label: 'Sales & profit', icon: TrendingUp },
  { id: 'records', label: 'Farm records', icon: ClipboardList },
  { id: 'bookkeeping', label: 'Bookkeeping', icon: Wallet },
  { id: 'reminders', label: 'Reminders', icon: Bell },
  { id: 'enterprises', label: 'Crop & herd register', icon: Sprout },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'marketplace', label: 'Marketplace', icon: Store },
  { id: 'team', label: 'My team', icon: Users },
  { id: 'notes', label: 'Offline notes', icon: NotebookPen },
  { id: 'assistant', label: 'FarmBuddyAI', icon: Bot },
  { id: 'weather', label: 'Farm Watch', icon: CloudSun },
  { id: 'community', label: 'Nearby farmers', icon: Users },
  { id: 'profile', label: 'My farm', icon: UserRound },
  { id: 'settings', label: 'Settings', icon: Settings },
]
const navGroups = [
  { label: 'Your farm', ids: ['overview', 'planning', 'operations', 'records', 'reminders', 'enterprises', 'inventory'] },
  { label: 'Your business', ids: ['business', 'bookkeeping', 'marketplace', 'team'] },
  { label: 'Help & connections', ids: ['assistant', 'weather', 'community', 'notes'] },
  { label: 'Your account', ids: ['profile', 'settings'] },
].map(group => ({ ...group, items: group.ids.map(id => nav.find(item => item.id === id)) }))
const income = computed(() => records.value.filter(r => r.category === 'income').reduce((sum, r) => sum + Number(r.amount || 0), 0))
const expenses = computed(() => records.value.filter(r => r.category === 'expense').reduce((sum, r) => sum + Number(r.amount || 0), 0))
const pending = computed(() => reminders.value.filter(r => !r.completed).sort((a, b) => a.date.localeCompare(b.date)))
const recent = computed(() => [...records.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
const money = value => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(value)
const displayDate = value => new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
function chooseSection(id) { if (id === 'weather') watchStarted.value = true; section.value = id; mobileMenu.value = false; feedback.value = ''; error.value = ''; nextTick(() => { window.scrollTo?.({ top: 0, behavior: 'instant' }); document.getElementById('farm-main')?.focus({ preventScroll: true }) }) }
function openDialog(type) { if (busy.value) return; if (editing.value) { if (type === 'record') Object.assign(recordForm, { title: '', category: 'activity', amount: '', note: '' }); else Object.assign(reminderForm, { title: '', date: '' }) } editing.value = null; dialogTrigger = document.activeElement; dialog.value = type; error.value = ''; feedback.value = ''; nextTick(() => document.getElementById(type === 'record' ? 'record-title' : 'reminder-title')?.focus()) }
function addBookkeepingEntry(category) { if (busy.value) return; openDialog('record'); Object.assign(recordForm, { title: '', category: category === 'expense' ? 'expense' : 'income', amount: '', note: '' }) }
function closeDialog() { if (!saving.value) { dialog.value = null; error.value = '' } }
function apiMessage(e) { return e?.data?.statusMessage || e?.data?.message || 'Something went wrong. Please try again.' }
const editing = ref(null)
const deletion = ref(null)
const busy = computed(() => saving.value || !!deleting.value || !!pendingReminder.value)
let generation = 0
let disposed = false
const controllers = new Set()
function invalidateAccount() {
  generation++
  controllers.forEach(controller => controller.abort())
  controllers.clear()
  if (!disposed) farm.value = { records: [], reminders: [] }
  saving.value = false; deleting.value = ''; pendingReminder.value = ''
  dialog.value = null; editing.value = null; deletion.value = null
  error.value = ''; feedback.value = ''
  Object.assign(recordForm, { title: '', category: 'activity', amount: '', note: '' })
  Object.assign(reminderForm, { title: '', date: '' })
}
watch(() => user.value.id, invalidateAccount, { flush: 'sync' })
function editRecord(record) {
  if (busy.value || record.sourceId) return
  openDialog('record'); editing.value = { ...record }
  Object.assign(recordForm, { title: record.title, category: record.category, amount: record.amount ?? '', note: record.note || '' })
}
function editReminder(reminder) {
  if (busy.value) return
  openDialog('reminder'); editing.value = { ...reminder }
  Object.assign(reminderForm, { title: reminder.title, date: reminder.date })
}
function deleteRecord(record) { if (!busy.value && !record.sourceId) deletion.value = { collection: 'records', item: { ...record } } }
function deleteReminder(reminder) { if (!busy.value) deletion.value = { collection: 'reminders', item: { ...reminder } } }
async function mutate(collection, method, item, payload, flag, success) {
  if (busy.value || disposed) return
  const epoch = generation, account = user.value.id
  const controller = new AbortController()
  controllers.add(controller)
  const current = () => !disposed && epoch === generation && account === user.value.id
  flag.value = flag === saving ? true : item.id
  error.value = ''
  try {
    const response = await $fetch(`/api/farm/${collection}${item ? `/${item.id}` : ''}`, { method, ...(payload ? { body: { ...payload } } : {}), signal: controller.signal, timeout: 15000, retry: 0 })
    if (!current()) return
    if (method === 'DELETE') {
      farm.value = { ...farm.value, [collection]: (farm.value?.[collection] || []).filter(row => row.id !== item.id) }
      deletion.value = null
    } else {
      const saved = response[collection === 'records' ? 'record' : 'reminder']
      const rows = farm.value?.[collection] || []
      farm.value = { ...farm.value, [collection]: rows.some(row => row.id === saved.id) ? rows.map(row => row.id === saved.id ? saved : row) : [...rows, saved] }
      if (flag === saving) {
        dialog.value = null; editing.value = null
        if (collection === 'records') Object.assign(recordForm, { title: '', category: 'activity', amount: '', note: '' })
        else Object.assign(reminderForm, { title: '', date: '' })
      }
    }
    feedback.value = success
    // Fetch independently so shared async-data cannot publish a stale account response.
    try {
      const refreshed = await $fetch('/api/farm', { signal: controller.signal, timeout: 15000, retry: 0 })
      if (current()) farm.value = refreshed
    } catch {
      if (current()) feedback.value = `${success} The latest farm data could not be refreshed. Your change is saved. Reload to sync.`
    }
  } catch (e) { if (current()) error.value = apiMessage(e) }
  finally { controllers.delete(controller); if (current()) flag.value = flag === saving ? false : '' }
}
async function saveRecord() {
  if (busy.value) return
  if (!recordForm.title.trim()) { error.value = 'Please enter a record title.'; return }
  const amount = recordForm.category === 'activity' ? 0 : Number(recordForm.amount)
  if (!['activity', 'income', 'expense'].includes(recordForm.category) || !Number.isFinite(amount) || (recordForm.category !== 'activity' && amount <= 0) || amount > 1000000000) { error.value = 'Please enter a valid amount and record type.'; return }
  const item = editing.value ? { ...editing.value } : null
  if (item?.sourceId) return
  await mutate('records', item ? 'PATCH' : 'POST', item, { title: recordForm.title.trim(), category: recordForm.category, amount, note: recordForm.note, ...(item?.updatedAt ? { expectedUpdatedAt: item.updatedAt } : {}) }, saving, 'Farm record saved.')
}
async function saveReminder() {
  if (busy.value) return
  if (!reminderForm.title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(reminderForm.date) || !Number.isFinite(Date.parse(reminderForm.date)) || new Date(reminderForm.date).toISOString().slice(0, 10) !== reminderForm.date) { error.value = 'Please enter a reminder title and valid due date.'; return }
  const item = editing.value ? { ...editing.value } : null
  await mutate('reminders', item ? 'PATCH' : 'POST', item, { title: reminderForm.title.trim(), date: reminderForm.date, ...(item?.updatedAt ? { expectedUpdatedAt: item.updatedAt } : {}) }, saving, 'Reminder saved.')
}
async function toggleReminder(reminder) {
  const item = { ...reminder }
  await mutate('reminders', 'PATCH', item, { completed: !item.completed, ...(item.updatedAt ? { expectedUpdatedAt: item.updatedAt } : {}) }, pendingReminder, 'Reminder updated.')
}
async function confirmDeletion() {
  if (!deletion.value || busy.value) return
  const { collection, item } = deletion.value
  await mutate(collection, 'DELETE', { ...item }, collection === 'reminders' && item.updatedAt ? { expectedUpdatedAt: item.updatedAt } : null, deleting, collection === 'records' ? 'Record deleted.' : 'Reminder deleted.')
}
async function profileSaved(savedUser) {
  session.value = { ...session.value, user: savedUser }
  await refreshSession()
  if (sessionError.value) throw new Error('Your farm was saved, but your session could not be refreshed. Reload before continuing.')
  if (route.path.replace(/\/$/, '') !== canonicalPath.value) await navigateTo(canonicalPath.value, { replace: true })
}
async function logout() {
  loggingOut.value = true; error.value = ''
  try { await $fetch('/api/auth/logout', { method: 'POST' }); clearNuxtData(); await navigateTo('/login') } catch (e) { error.value = apiMessage(e); loggingOut.value = false }
}
function onEscape(event) { if (event.key === 'Escape') { closeDialog(); if (mobileMenu.value) closeMenu(true) } }
function trapFocus(event) {
  if (event.key !== 'Tab') return
  const elements = [...event.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')]
  const first = elements[0], last = elements[elements.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
onMounted(() => {
  desktopMedia = window.matchMedia('(min-width: 1024px)')
  desktopMedia.addEventListener('change', onBreakpointChange)
  window.addEventListener('keydown', onEscape)
})
onUnmounted(() => {
  disposed = true
  invalidateAccount()
  window.removeEventListener('keydown', onEscape)
  desktopMedia?.removeEventListener('change', onBreakpointChange)
  if (savedBodyOverflow !== undefined) document.body.style.overflow = savedBodyOverflow
})
</script>

<template>
  <div class="dashboard min-h-screen bg-[#F5F6F0] text-[#193D2B]">
    <aside id="dashboard-navigation" class="fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-y-auto border-r border-[#DCE5D8] bg-[#FAFBF7] px-5 py-7 transition-transform lg:visible lg:translate-x-0 lg:pointer-events-auto" :class="mobileMenu ? 'visible translate-x-0 pointer-events-auto' : 'invisible -translate-x-full pointer-events-none'">
      <button type="button" aria-label="Close dashboard navigation" class="mb-4 ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#066136] hover:bg-[#EDF1E6] lg:hidden" @click="closeMenu(true)"><X :size="22" aria-hidden="true" /></button>
      <NuxtLink to="/" class="mb-10 flex items-center gap-2.5 px-2 text-2xl font-extrabold tracking-tight text-[#066136]"><span class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#066136] text-[#F9C23C]"><Sprout :size="24" aria-hidden="true" /></span>FarmBuddy<span class="-ml-2 text-[#C49C23]">.</span></NuxtLink>
      <nav class="dashboard-nav" aria-label="Dashboard navigation"><div v-for="group in navGroups" :key="group.label" class="navigation-group"><p class="navigation-label">{{ group.label }}</p><button v-for="item in group.items" :key="item.id" type="button" class="flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition" :class="section === item.id ? 'bg-[#066136] text-white shadow-md shadow-[#066136]/10' : 'text-[#536B50] hover:bg-[#EDF1E6]'" :aria-current="section === item.id ? 'page' : undefined" @click="chooseSection(item.id)"><component :is="item.icon" :size="20" aria-hidden="true" />{{ item.label }}<span v-if="item.id === 'reminders' && pending.length" class="ml-auto rounded-md bg-[#F9C23C] px-1.5 py-0.5 text-[10px] text-[#064B32]">{{ pending.length }}</span></button></div></nav>
      <div class="mt-auto pt-8"><button type="button" class="flex w-full items-center gap-3 rounded-2xl border border-[#DCE5D8] bg-white p-3 text-left hover:bg-[#EDF1E6]" aria-label="Open My farm profile" @click="chooseSection('profile')"><span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F9C23C] text-sm font-bold text-[#193D2B]" aria-hidden="true">{{ farmerInitials }}</span><span class="min-w-0"><span class="block truncate text-sm font-bold">{{ user.name || 'Farmer' }}</span><span class="mt-1 block text-xs text-[#526C46]">Farm owner</span></span></button></div>
    </aside>
    <button v-if="mobileMenu" id="dashboard-menu-backdrop" type="button" aria-label="Close sidebar" class="fixed inset-0 z-30 bg-[#092D20]/35 lg:hidden" @click="closeMenu(true)" />
    <div class="lg:pl-64">
      <header class="flex min-h-20 items-center justify-between gap-4 border-b border-[#DFE6D9] bg-white/70 px-5 py-4 sm:px-8">
        <div class="flex items-center gap-3"><button ref="menuTrigger" id="dashboard-menu-toggle" type="button" :aria-label="mobileMenu ? 'Close dashboard navigation' : 'Open dashboard navigation'" aria-controls="dashboard-navigation" :aria-expanded="mobileMenu" class="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[#EDF1E6] lg:hidden" @click="mobileMenu = !mobileMenu"><component :is="mobileMenu ? X : Menu" :size="22" aria-hidden="true" /></button><button type="button" class="inline-flex items-center gap-2 rounded-xl border border-[#DCE5D8] px-3 py-2 text-xs font-semibold text-[#066136]" aria-label="Open Farm Watch weather and health notifications" @click="chooseSection('weather')"><Bell :size="17" />Farm Watch<span v-if="unreadWatch" class="rounded-full bg-[#F9C23C] px-2 py-0.5 text-[10px]" :aria-label="`${unreadWatch} unread notifications`">{{ unreadWatch }}</span></button></div>
      </header>
      <main class="mx-auto w-full" id="farm-main" tabindex="-1" :class="[['marketplace', 'planning', 'operations', 'business', 'team', 'inventory', 'enterprises', 'records', 'reminders', 'bookkeeping', 'assistant'].includes(section) ? 'max-w-none' : 'max-w-[1440px]', section === 'assistant' ? 'p-0' : 'px-5 py-7 sm:px-8 sm:py-9']">
        <p v-if="feedback" role="status" class="mb-5 rounded-xl border border-[#CFE1C4] bg-[#E8F2E0] px-4 py-3 text-sm text-[#32673B]">{{ feedback }}</p>
        <div v-if="(error && !dialog) || loadError" role="alert" class="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{{ error || 'Could not load your farm data.' }}<button v-if="loadError" type="button" class="ml-2 font-bold underline" @click="refreshFarm()">Retry</button></div>

        <FarmHome v-if="section === 'overview'" :user="user" :records="records" :reminders="reminders" :busy="busy" @navigate="chooseSection" @add-record="openDialog('record')" @add-reminder="openDialog('reminder')" @toggle-reminder="toggleReminder" />

        <FarmSettings v-if="section === 'settings'" :user="user" :logging-out="loggingOut" :on-profile-saved="profileSaved" @logout="logout" />
        <FarmMarketplace v-if="section === 'marketplace'" :user="user" />
        <FarmWorkspace v-if="['planning', 'operations', 'business', 'team'].includes(section)" :user="user" :section="section" @changed="refreshFarm" @navigate="chooseSection" />
        <FarmJournal v-if="['records', 'reminders'].includes(section)" :mode="section" :records="records" :reminders="reminders" :busy="busy" :deleting="deleting" :pending-reminder="pendingReminder" :user-id="user.id" @add-record="openDialog('record')" @add-reminder="openDialog('reminder')" @edit-record="editRecord" @delete-record="deleteRecord" @edit-reminder="editReminder" @delete-reminder="deleteReminder" @toggle-reminder="toggleReminder" />
        <FarmBookkeeping v-if="section === 'bookkeeping'" :records="records" :deleting="deleting" :user-id="user.id" :busy="busy" @add-entry="addBookkeepingEntry" @edit-entry="editRecord" @delete-entry="deleteRecord" />
        <FarmManagement v-if="['enterprises', 'inventory'].includes(section)" :key="section" :section="section" :user="user" />
        <FarmNotes v-if="section === 'notes'" :user="user" mode="notes" />
        <FarmAssistant v-if="section === 'assistant'" :user="user" @records-changed="refreshFarm" />
        <FarmWatch v-if="watchStarted" v-show="section === 'weather'" :user="user" @unread-change="unreadWatch = $event" />
        <FarmLocationTools v-if="section === 'community'" :user="user" mode="community" />
        <FarmProfile v-if="section === 'profile'" :user="user" @edit="chooseSection('settings')" />
        <p v-if="section !== 'assistant'" class="mt-8 text-center text-[10px] text-[#9AA68E]">FarmBuddy · A little support for every day on the farm.</p>
      </main>
    </div>

    <FbDialog :open="!!deletion" title="Delete entry?" :description="deletion ? `Delete “${deletion.item.title}”? This cannot be undone.` : ''" :busy="busy" @update:open="value => { if (!value && !busy) deletion = null }"><p v-if="error" role="alert" class="text-sm text-red-700">{{ error }}</p><template #footer><button type="button" class="dash-button-secondary" :disabled="busy" @click="deletion = null">Cancel</button><FbButton variant="danger" :busy="!!deleting" :disabled="busy" @click="confirmDeletion">{{ deleting ? 'Deleting…' : 'Delete entry' }}</FbButton></template></FbDialog>
    <div v-if="dialog" class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#0A2E20]/45 p-4 backdrop-blur-sm" @click.self="closeDialog">
      <section role="dialog" aria-modal="true" aria-labelledby="dialog-title" class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-[#FAFBF7] p-6 shadow-2xl sm:p-8" @keydown="trapFocus">
        <div class="mb-6 flex items-center justify-between gap-4"><h2 id="dialog-title" class="text-xl font-bold">{{ editing ? (dialog === 'record' ? 'Edit farm record' : 'Edit reminder') : (dialog === 'record' ? 'Add a farm record' : 'Plan your next task') }}</h2><button type="button" aria-label="Close dialog" :disabled="saving" class="rounded-full p-2 text-[#819176] hover:bg-[#EAF0E1]" @click="closeDialog"><X :size="20" /></button></div>
        <p v-if="error" role="alert" class="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{{ error }}</p>
        <form v-if="dialog === 'record'" class="space-y-4" @submit.prevent="saveRecord"><fieldset :disabled="saving" class="min-w-0 space-y-4"><div><label for="record-title" class="dash-label">What happened?</label><input id="record-title" v-model="recordForm.title" required maxlength="160" :placeholder="tailored.record" class="dash-input"></div><fieldset class="record-type-picker"><legend class="dash-label">What kind of record?</legend><label v-for="kind in [{value:'activity',label:'Farm activity',icon:Leaf},{value:'income',label:'Money in',icon:TrendingUp},{value:'expense',label:'Money out',icon:TrendingDown}]" :key="kind.value" :class="{ selected: recordForm.category === kind.value }"><input v-model="recordForm.category" type="radio" name="record-category" :value="kind.value"><component :is="kind.icon" :size="23" aria-hidden="true" /><span>{{ kind.label }}</span></label></fieldset><div v-if="recordForm.category !== 'activity'"><label for="record-amount" class="dash-label">Amount (NGN)</label><input id="record-amount" v-model="recordForm.amount" type="number" min="0.01" max="1000000000" step="0.01" required inputmode="decimal" placeholder="0.00" class="dash-input"></div><div><label for="record-note" class="dash-label">A few extra details <span class="font-normal text-[#94A08A]">(optional)</span></label><textarea id="record-note" v-model="recordForm.note" rows="3" maxlength="2000" class="dash-input resize-y" placeholder="Anything worth remembering…" /></div><button type="submit" :disabled="saving" class="dash-button w-full justify-center"><LoaderCircle v-if="saving" :size="17" class="animate-spin" />{{ saving ? 'Saving…' : 'Save record' }}</button></fieldset></form>
        <form v-else class="space-y-4" @submit.prevent="saveReminder"><fieldset :disabled="saving" class="min-w-0 space-y-4"><div><label for="reminder-title" class="dash-label">What do you need to do?</label><input id="reminder-title" v-model="reminderForm.title" required maxlength="160" :placeholder="tailored.reminder" class="dash-input"></div><div><label for="reminder-date" class="dash-label">When is it due?</label><input id="reminder-date" v-model="reminderForm.date" type="date" required class="dash-input"></div><p class="text-xs leading-6 text-[#8B9981]">Your reminder will appear on your dashboard. No email or phone notifications are sent.</p><button type="submit" :disabled="saving" class="dash-button w-full justify-center"><LoaderCircle v-if="saving" :size="17" class="animate-spin" />{{ saving ? 'Saving…' : 'Save reminder' }}</button></fieldset></form>
      </section>
    </div>
  </div>
</template>

<style scoped>
.record-type-picker{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.record-type-picker legend{margin-bottom:10px}.record-type-picker label{position:relative;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;min-height:85px;border:1px solid #d6e1cb;border-radius:15px;background:white;color:#526c46;font-size:12px;font-weight:700;cursor:pointer;text-align:center;padding:12px 5px}.record-type-picker label.selected{background:#e8f2e0;border:2px solid #066136;color:#066136}.record-type-picker input{position:absolute;opacity:0;width:1px;height:1px}.record-type-picker label:has(input:focus-visible){outline:3px solid #a88811;outline-offset:3px}
.dashboard-nav{display:grid;gap:24px}.navigation-group{display:grid;gap:4px}.navigation-label{font-size:11px;font-weight:700;color:#61745c;padding:0 16px 6px}.dashboard-nav button>svg{flex-shrink:0}
.dash-panel { border: 1px solid #E0E7D8; border-radius: 20px; background: #fff; box-shadow: 0 3px 12px #183C2403; }
.dash-button, .dash-button-secondary { display: inline-flex; align-items: center; gap: 8px; border-radius: 12px; padding: 12px 17px; font-size: 12px; font-weight: 700; transition: background .2s; }
.dash-button { background: #066136; color: white; border: 1px solid #066136; }
.dash-button:hover { background: #084D2E; }
.dash-button-secondary { border: 1px solid #D9E2CF; background: #FAFBF7; color: #607755; }
.dash-button-secondary:hover { background: #EAF0E0; }
.dash-button:disabled { opacity: .6; cursor: wait; }
.dash-label { display: block; margin-bottom: 8px; font-size: 12px; font-weight: 700; color: #526C46; }
.dash-input { width: 100%; border: 1px solid #D6E1CB; border-radius: 11px; background: #fff; padding: 12px 14px; font-size: 14px; color: #193D2B; }
.dash-input:focus { outline: 2px solid #06613633; outline-offset: 2px; border-color: #066136; }
.dashboard button:focus-visible, .dashboard a:focus-visible { outline: 2px solid #6FA160; outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { .dashboard *, .dashboard *::before { transition: none !important; animation: none !important; } }
</style>
