<script setup>
import { Sprout, LayoutDashboard, ClipboardList, Bell, UserRound, LogOut, ArrowUpRight, Plus, Wallet, TrendingUp, TrendingDown, CalendarDays, Check, X, Menu, Leaf, ShieldCheck, Camera, Mic, LoaderCircle, Trash2 } from 'lucide-vue-next'

useHead({ title: 'Your farm dashboard | FarmBuddy' })
const { data: session, error: sessionError } = await useFetch('/api/auth/me')
if (sessionError.value || !session.value?.user) await navigateTo('/login')
const user = computed(() => session.value?.user || {})
const { data: farm, refresh: refreshFarm, error: loadError } = await useFetch('/api/farm', { default: () => ({ records: [], reminders: [] }) })
const records = computed(() => farm.value?.records || [])
const reminders = computed(() => farm.value?.reminders || [])
const section = ref('overview')
const mobileMenu = ref(false)
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
  document.body.style.overflow = value ? 'hidden' : ''
  if (!value) nextTick(() => dialogTrigger?.focus())
})
const recordForm = reactive({ title: '', category: 'activity', amount: '', note: '' })
const reminderForm = reactive({ title: '', date: '' })
const today = new Date().toLocaleDateString('en-CA')
const nav = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'records', label: 'Farm records', icon: ClipboardList },
  { id: 'reminders', label: 'Reminders', icon: Bell },
  { id: 'profile', label: 'My farm', icon: UserRound },
]
const titles = { overview: 'A good day to grow.', records: 'Every detail counts.', reminders: 'Stay one step ahead.', profile: 'Your farm, at a glance.' }
const income = computed(() => records.value.filter(r => r.category === 'income').reduce((sum, r) => sum + Number(r.amount || 0), 0))
const expenses = computed(() => records.value.filter(r => r.category === 'expense').reduce((sum, r) => sum + Number(r.amount || 0), 0))
const pending = computed(() => reminders.value.filter(r => !r.completed).sort((a, b) => a.date.localeCompare(b.date)))
const recent = computed(() => [...records.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
const money = value => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(value)
const displayDate = value => new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const initials = computed(() => (user.value.name || 'Farmer').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase())
function chooseSection(id) { section.value = id; mobileMenu.value = false; feedback.value = ''; error.value = '' }
function openDialog(type) { dialogTrigger = document.activeElement; dialog.value = type; error.value = ''; feedback.value = ''; nextTick(() => document.getElementById(type === 'record' ? 'record-title' : 'reminder-title')?.focus()) }
function closeDialog() { if (!saving.value) { dialog.value = null; error.value = '' } }
function apiMessage(e) { return e?.data?.statusMessage || e?.data?.message || 'Something went wrong. Please try again.' }
async function saveRecord() {
  if (!recordForm.title.trim()) { error.value = 'Please enter a record title.'; return }
  saving.value = true; error.value = ''
  try {
    await $fetch('/api/farm/records', { method: 'POST', body: { ...recordForm, amount: recordForm.category === 'activity' ? 0 : Number(recordForm.amount) } })
    await refreshFarm(); Object.assign(recordForm, { title: '', category: 'activity', amount: '', note: '' }); dialog.value = null; feedback.value = 'Farm record saved.'
  } catch (e) { error.value = apiMessage(e) } finally { saving.value = false }
}
async function saveReminder() {
  if (!reminderForm.title.trim()) { error.value = 'Please enter a reminder title.'; return }
  saving.value = true; error.value = ''
  try {
    await $fetch('/api/farm/reminders', { method: 'POST', body: { ...reminderForm } })
    await refreshFarm(); Object.assign(reminderForm, { title: '', date: '' }); dialog.value = null; feedback.value = 'Reminder saved. Your tasks are listed here in FarmBuddy.'
  } catch (e) { error.value = apiMessage(e) } finally { saving.value = false }
}
async function toggleReminder(reminder) {
  if (pendingReminder.value) return
  pendingReminder.value = reminder.id; error.value = ''
  try { await $fetch(`/api/farm/reminders/${reminder.id}`, { method: 'PATCH', body: { completed: !reminder.completed } }); await refreshFarm() } catch (e) { error.value = apiMessage(e) } finally { pendingReminder.value = '' }
}
async function deleteRecord(record) {
  if (!window.confirm(`Delete “${record.title}”? This cannot be undone.`)) return
  deleting.value = record.id; error.value = ''
  try { await $fetch(`/api/farm/records/${record.id}`, { method: 'DELETE' }); await refreshFarm(); feedback.value = 'Record deleted.' } catch (e) { error.value = apiMessage(e) } finally { deleting.value = '' }
}
async function logout() {
  loggingOut.value = true; error.value = ''
  try { await $fetch('/api/auth/logout', { method: 'POST' }); clearNuxtData(); await navigateTo('/login') } catch (e) { error.value = apiMessage(e); loggingOut.value = false }
}
function onEscape(event) { if (event.key === 'Escape') { closeDialog(); mobileMenu.value = false } }
function trapFocus(event) {
  if (event.key !== 'Tab') return
  const elements = [...event.currentTarget.querySelectorAll('button:not([disabled]),input:not([disabled]),select,textarea')]
  const first = elements[0], last = elements[elements.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
onMounted(() => window.addEventListener('keydown', onEscape))
onUnmounted(() => { window.removeEventListener('keydown', onEscape); document.body.style.overflow = '' })
</script>

<template>
  <div class="dashboard min-h-screen bg-[#F5F6F0] text-[#193D2B]">
    <aside class="fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-y-auto border-r border-[#DCE5D8] bg-[#FAFBF7] px-5 py-7 transition-transform lg:translate-x-0 lg:visible" :class="mobileMenu ? 'visible translate-x-0' : 'invisible -translate-x-full'">
      <NuxtLink to="/" class="mb-10 flex items-center gap-2.5 px-2 text-2xl font-extrabold tracking-tight text-[#066136]"><span class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#066136] text-[#F9C23C]"><Sprout :size="24" aria-hidden="true" /></span>FarmBuddy<span class="-ml-2 text-[#C49C23]">.</span></NuxtLink>
      <p class="px-4 text-[10px] font-bold uppercase tracking-[0.2em] text-[#7C8D7A]">Your workspace</p>
      <nav class="mt-4 space-y-2" aria-label="Dashboard navigation"><button v-for="item in nav" :key="item.id" type="button" class="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition" :class="section === item.id ? 'bg-[#066136] text-white shadow-md shadow-[#066136]/10' : 'text-[#62745F] hover:bg-[#EDF1E6]'" :aria-current="section === item.id ? 'page' : undefined" @click="chooseSection(item.id)"><component :is="item.icon" :size="19" aria-hidden="true" />{{ item.label }}<span v-if="item.id === 'reminders' && pending.length" class="ml-auto rounded-md bg-[#F9C23C] px-1.5 py-0.5 text-[10px] text-[#064B32]">{{ pending.length }}</span></button></nav>
      <div class="mt-auto pt-8"><div class="rounded-2xl border border-[#DBE5CE] bg-[#EDF3E4] p-4"><Sprout :size="24" class="text-[#47874B]" aria-hidden="true" /><p class="mt-3 text-sm font-bold">Small steps. Strong roots.</p><p class="mt-2 text-xs leading-6 text-[#6B7B61]">Keep your farm story growing, one record at a time.</p></div><NuxtLink to="/" class="mt-5 flex items-center justify-between px-3 text-xs font-semibold text-[#668060]">Visit homepage <ArrowUpRight :size="15" aria-hidden="true" /></NuxtLink><button type="button" :disabled="loggingOut" class="mt-5 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-[#6A7765] hover:bg-[#EDF1E6] disabled:opacity-50" @click="logout"><LogOut :size="18" aria-hidden="true" />{{ loggingOut ? 'Signing out…' : 'Log out' }}</button></div>
    </aside>
    <button v-if="mobileMenu" type="button" aria-label="Close sidebar" class="fixed inset-0 z-30 bg-[#092D20]/35 lg:hidden" @click="mobileMenu = false" />
    <div class="lg:pl-64">
      <header class="flex min-h-20 items-center justify-between gap-4 border-b border-[#DFE6D9] bg-white/70 px-5 py-4 sm:px-8">
        <div class="flex items-center gap-3"><button type="button" aria-label="Open dashboard navigation" :aria-expanded="mobileMenu" class="rounded-lg p-2 hover:bg-[#EDF1E6] lg:hidden" @click="mobileMenu = !mobileMenu"><Menu :size="22" /></button><p class="text-sm font-semibold text-[#71836B]">My workspace <span class="mx-2 text-[#C2CCBA]">/</span><span class="text-[#193D2B]">{{ nav.find(n => n.id === section)?.label }}</span></p></div>
        <button type="button" class="flex items-center gap-3 text-left" aria-label="View your farm profile" @click="chooseSection('profile')"><span class="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-[#F9C23C] text-xs font-extrabold shadow-sm">{{ initials }}</span><span class="hidden sm:block"><span class="block text-xs font-bold">{{ user.name }}</span><span class="mt-0.5 block text-[10px] text-[#7D8C76]">FarmBuddy farmer</span></span></button>
      </header>
      <main class="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 sm:py-9">
        <div class="mb-7 flex flex-col justify-between gap-5 xl:flex-row xl:items-end"><div><p class="text-xs font-semibold text-[#77906B]">Welcome back, {{ user.name?.split(' ')[0] || 'farmer' }} <span aria-hidden="true">☀</span></p><h1 class="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{{ titles[section] }}</h1><p class="mt-3 text-sm leading-6 text-[#7A8972]">{{ user.farmName || 'Your farm' }} · Your crops, animals, and everyday progress in one place.</p></div><div class="flex flex-wrap gap-3"><button type="button" class="dash-button-secondary" @click="openDialog('reminder')"><Bell :size="16" />Set reminder</button><button type="button" class="dash-button" @click="openDialog('record')"><Plus :size="18" />Add farm record</button></div></div>
        <p v-if="feedback" role="status" class="mb-5 rounded-xl border border-[#CFE1C4] bg-[#E8F2E0] px-4 py-3 text-sm text-[#32673B]">{{ feedback }}</p>
        <div v-if="(error && !dialog) || loadError" role="alert" class="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{{ error || 'Could not load your farm data.' }}<button v-if="loadError" type="button" class="ml-2 font-bold underline" @click="refreshFarm()">Retry</button></div>

        <template v-if="section === 'overview'">
          <section class="relative mb-6 overflow-hidden rounded-[1.5rem] bg-[#064B32] px-6 py-7 text-white sm:px-8 sm:py-8">
            <div class="relative z-10 max-w-lg"><span class="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-[#F9C23C]"><Sprout :size="12" />Your growing journey</span><h2 class="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">A little care today.<br>A stronger farm tomorrow.</h2><p class="mt-3 max-w-sm text-sm leading-6 text-[#BDDAC6]">Keep track of what matters. Start with a farm record or a reminder for your next important task.</p><button type="button" class="mt-5 inline-flex items-center gap-2 text-xs font-bold text-[#F9C23C]" @click="openDialog('record')">Make your next entry <ArrowUpRight :size="15" /></button></div><div class="pointer-events-none absolute -right-4 bottom-0 hidden h-64 w-72 items-center justify-center sm:flex" aria-hidden="true"><span class="absolute h-52 w-52 rounded-full border border-white/10 shadow-[0_0_0_30px_rgba(255,255,255,0.025)]" /><Sprout :size="140" :stroke-width="1" class="rotate-12 text-[#7FAF68]" /></div>
          </section>
          <section aria-label="Farm summary" class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div v-for="stat in [{label:'Total income',value:money(income),note:'All recorded income',icon:TrendingUp},{label:'Total expenses',value:money(expenses),note:'All recorded expenses',icon:TrendingDown},{label:'Net balance',value:money(income-expenses),note:'Income minus expenses',icon:Wallet},{label:'Upcoming tasks',value:pending.length,note:'Reminders still to complete',icon:CalendarDays}]" :key="stat.label" class="dash-panel p-5"><div class="flex items-center justify-between"><p class="text-xs font-semibold text-[#74846C]">{{ stat.label }}</p><span class="rounded-lg bg-[#EDF2E5] p-2 text-[#4D7847]"><component :is="stat.icon" :size="17" /></span></div><p class="mt-3 text-2xl font-bold tracking-tight">{{ stat.value }}</p><p class="mt-2 text-[10px] text-[#91A085]">{{ stat.note }}</p></div>
          </section>
        </template>

        <div v-if="section === 'overview' || section === 'records' || section === 'reminders'" class="grid items-start gap-6" :class="section === 'overview' ? 'xl:grid-cols-[1.4fr_1fr]' : ''">
          <section v-if="section !== 'reminders'" class="dash-panel overflow-hidden" aria-labelledby="records-title">
            <div class="flex items-center justify-between gap-4 border-b border-[#EDF0E8] p-5 sm:p-6"><div><h2 id="records-title" class="font-bold">{{ section === 'overview' ? 'Recent farm activity' : 'Your farm records' }}</h2><p class="mt-1 text-xs text-[#8B9981]">A clear picture of what’s happening.</p></div><button v-if="section === 'overview'" type="button" class="text-xs font-semibold text-[#066136]" @click="chooseSection('records')">View all</button><span v-else class="rounded-full bg-[#EDF2E5] px-3 py-1 text-xs text-[#617857]">{{ records.length }} records</span></div>
            <div v-if="!recent.length" class="px-6 py-12 text-center"><span class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EFF3E8] text-[#729460]"><ClipboardList :size="26" /></span><h3 class="mt-4 text-sm font-bold">Your farm story starts here.</h3><p class="mx-auto mt-2 max-w-xs text-xs leading-6 text-[#8A9880]">Record sales, expenses, or a simple note about what happened on your farm today.</p><button type="button" class="mt-5 inline-flex items-center gap-2 text-xs font-bold text-[#066136]" @click="openDialog('record')"><Plus :size="15" />Add your first record</button></div>
            <ul v-else class="divide-y divide-[#EDF0E8]"><li v-for="record in (section === 'overview' ? recent.slice(0, 5) : recent)" :key="record.id" class="flex items-start gap-3 px-5 py-4 sm:px-6"><span class="mt-1 rounded-xl p-2.5" :class="record.category === 'expense' ? 'bg-[#FBEEE4] text-[#B16A39]' : 'bg-[#EEF3E5] text-[#648A49]'"><component :is="record.category === 'income' ? TrendingUp : record.category === 'expense' ? TrendingDown : Leaf" :size="18" /></span><div class="min-w-0 flex-1"><p class="break-words text-sm font-bold">{{ record.title }}</p><p v-if="record.note" class="mt-1 break-words text-xs leading-5 text-[#8A9780]">{{ record.note }}</p><p class="mt-1.5 text-[10px] capitalize text-[#96A18D]">{{ record.category }} · {{ displayDate(record.createdAt) }}</p></div><div class="text-right"><p v-if="record.category !== 'activity'" class="whitespace-nowrap text-xs font-bold" :class="record.category === 'expense' ? 'text-[#A2704B]' : 'text-[#066136]'">{{ record.category === 'expense' ? '−' : '+' }}{{ money(record.amount) }}</p><button v-if="section === 'records'" type="button" :disabled="deleting === record.id" :aria-label="`Delete ${record.title}`" class="mt-2 rounded p-1.5 text-[#A5AD9D] hover:bg-red-50 hover:text-red-600 disabled:opacity-50" @click="deleteRecord(record)"><Trash2 :size="14" /></button></div></li></ul>
          </section>
          <section v-if="section !== 'records'" class="dash-panel" aria-labelledby="reminders-title"><div class="flex items-center justify-between gap-4 border-b border-[#EDF0E8] p-5 sm:p-6"><div><h2 id="reminders-title" class="font-bold">{{ section === 'overview' ? 'On your farm calendar' : 'Your reminders' }}</h2><p class="mt-1 text-xs text-[#8B9981]">{{ pending.length }} tasks to look forward to.</p></div><button type="button" aria-label="Add reminder" class="rounded-lg border border-[#DDE5D4] p-2 text-[#066136] hover:bg-[#EDF2E5]" @click="openDialog('reminder')"><Plus :size="16" /></button></div><div v-if="!(section === 'overview' ? pending : reminders).length" class="px-6 py-12 text-center"><Bell :size="28" class="mx-auto text-[#91AB7A]" /><h3 class="mt-4 text-sm font-bold">A little planning goes a long way.</h3><p class="mt-2 text-xs leading-6 text-[#8A9880]">Add feeding, vaccination, planting, or harvest tasks. They’ll stay here until you mark them done.</p><button type="button" class="mt-5 text-xs font-bold text-[#066136]" @click="openDialog('reminder')">Create a reminder</button></div><ul v-else class="divide-y divide-[#EDF0E8]"><li v-for="reminder in (section === 'overview' ? pending.slice(0, 5) : [...reminders].sort((a,b) => a.date.localeCompare(b.date)))" :key="reminder.id" class="flex items-start gap-3 p-5"><button type="button" :aria-label="`${reminder.completed ? 'Mark incomplete' : 'Complete'}: ${reminder.title}`" :aria-pressed="reminder.completed" :disabled="!!pendingReminder" class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border disabled:opacity-50" :class="reminder.completed ? 'border-[#066136] bg-[#066136] text-white' : 'border-[#C8D6BD] bg-white'" @click="toggleReminder(reminder)"><Check v-if="reminder.completed" :size="13" /></button><div><p class="break-words text-sm font-semibold" :class="reminder.completed ? 'text-[#A0AC95] line-through' : ''">{{ reminder.title }}</p><p class="mt-1.5 text-[10px]" :class="!reminder.completed && reminder.date < today ? 'font-semibold text-[#AE693A]' : 'text-[#96A18D]'">{{ displayDate(reminder.date) }}{{ !reminder.completed && reminder.date < today ? ' · Overdue' : '' }}</p></div></li></ul><p class="border-t border-[#EDF0E8] px-5 py-3 text-[10px] leading-5 text-[#96A18D]">Reminders appear in your dashboard. Email and push notifications are not enabled.</p></section>
        </div>

        <section v-if="section === 'profile'" class="dash-panel max-w-3xl p-6 sm:p-8"><div class="flex items-center gap-4"><span class="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E8EFD9] text-[#4C7C44]"><Sprout :size="34" /></span><div><h2 class="text-xl font-bold">{{ user.farmName || 'My farm' }}</h2><p class="mt-1 text-sm capitalize text-[#8B9981]">{{ user.farmType || 'Mixed' }} farming</p></div></div><dl class="mt-8 grid gap-6 border-t border-[#E9EEDF] pt-6 sm:grid-cols-2"><div v-for="field in [{label:'Farmer',value:user.name},{label:'Email',value:user.email},{label:'Farm name',value:user.farmName || 'Not provided'},{label:'Farm type',value:user.farmType || 'Mixed'}]" :key="field.label"><dt class="text-xs text-[#8B9981]">{{ field.label }}</dt><dd class="mt-2 break-words text-sm font-semibold">{{ field.value }}</dd></div></dl><div class="mt-8 flex items-start gap-3 rounded-2xl bg-[#F1F5E9] p-4 text-xs leading-6 text-[#728668]"><ShieldCheck :size="20" class="mt-0.5 shrink-0" /><p>Your records and reminders belong to your account. Your farm passport and profile verification are not yet available.</p></div></section>
        <section v-if="section === 'overview'" class="mt-6 rounded-2xl border border-dashed border-[#D7E1CC] bg-[#F0F3E8] p-5"><div class="flex flex-wrap items-center gap-3"><span class="rounded-xl bg-white p-2 text-[#739163]"><Camera :size="19" /></span><span class="rounded-xl bg-white p-2 text-[#739163]"><Mic :size="19" /></span><div class="min-w-0 flex-1"><h2 class="text-sm font-bold">More ways to care for your farm are growing.</h2><p class="mt-1 text-xs leading-6 text-[#89977B]">Photo diagnosis, voice assistance, and farmer networking are planned. For now, keep your records and reminders together here.</p></div><span class="rounded-full border border-[#D2DDC4] px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-[#81946F]">Coming soon</span></div></section>
        <p class="mt-8 text-center text-[10px] text-[#9AA68E]">FarmBuddy · A little support for every day on the farm.</p>
      </main>
    </div>

    <div v-if="dialog" class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#0A2E20]/45 p-4 backdrop-blur-sm" @click.self="closeDialog">
      <section role="dialog" aria-modal="true" aria-labelledby="dialog-title" class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-[#FAFBF7] p-6 shadow-2xl sm:p-8" @keydown="trapFocus">
        <div class="mb-6 flex items-center justify-between gap-4"><h2 id="dialog-title" class="text-xl font-bold">{{ dialog === 'record' ? 'Add a farm record' : 'Plan your next task' }}</h2><button type="button" aria-label="Close dialog" :disabled="saving" class="rounded-full p-2 text-[#819176] hover:bg-[#EAF0E1]" @click="closeDialog"><X :size="20" /></button></div>
        <p v-if="error" role="alert" class="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{{ error }}</p>
        <form v-if="dialog === 'record'" class="space-y-4" @submit.prevent="saveRecord"><div><label for="record-title" class="dash-label">What happened?</label><input id="record-title" v-model="recordForm.title" required maxlength="160" placeholder="e.g. Sold 20 trays of eggs" class="dash-input"></div><div><label for="record-category" class="dash-label">Record type</label><select id="record-category" v-model="recordForm.category" class="dash-input"><option value="activity">Farm activity</option><option value="income">Income</option><option value="expense">Expense</option></select></div><div v-if="recordForm.category !== 'activity'"><label for="record-amount" class="dash-label">Amount (NGN)</label><input id="record-amount" v-model="recordForm.amount" type="number" min="0.01" max="1000000000" step="0.01" required inputmode="decimal" placeholder="0.00" class="dash-input"></div><div><label for="record-note" class="dash-label">A few extra details <span class="font-normal text-[#94A08A]">(optional)</span></label><textarea id="record-note" v-model="recordForm.note" rows="3" maxlength="2000" class="dash-input resize-y" placeholder="Anything worth remembering…" /></div><button type="submit" :disabled="saving" class="dash-button w-full justify-center"><LoaderCircle v-if="saving" :size="17" class="animate-spin" />{{ saving ? 'Saving…' : 'Save record' }}</button></form>
        <form v-else class="space-y-4" @submit.prevent="saveReminder"><div><label for="reminder-title" class="dash-label">What do you need to do?</label><input id="reminder-title" v-model="reminderForm.title" required maxlength="160" placeholder="e.g. Vaccinate the poultry" class="dash-input"></div><div><label for="reminder-date" class="dash-label">When is it due?</label><input id="reminder-date" v-model="reminderForm.date" type="date" required class="dash-input"></div><p class="text-xs leading-6 text-[#8B9981]">Your reminder will appear on your dashboard. No email or phone notifications are sent.</p><button type="submit" :disabled="saving" class="dash-button w-full justify-center"><LoaderCircle v-if="saving" :size="17" class="animate-spin" />{{ saving ? 'Saving…' : 'Save reminder' }}</button></form>
      </section>
    </div>
  </div>
</template>

<style scoped>
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
