<script setup>
import { computed, reactive, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import FbPageHeader from './ui/FbPageHeader.vue'
import FbButton from './ui/FbButton.vue'
import FbPanel from './ui/FbPanel.vue'
import FbBadge from './ui/FbBadge.vue'
import FbEmptyState from './ui/FbEmptyState.vue'
import FbTabs from './ui/FbTabs.vue'
import { localDay, parseDay, displayDay, shiftDay, shiftMonth, monthGrid, recordDay, filterRecords, filterReminders, reminderCounts } from '../utils/farm-journal.js'
const props = defineProps({ mode: { type: String, default: 'records' }, records: { type: Array, default: () => [] }, reminders: { type: Array, default: () => [] }, busy: Boolean, deleting: String, pendingReminder: String, userId: String })
const emit = defineEmits(['add-record', 'add-reminder', 'edit-record', 'delete-record', 'edit-reminder', 'delete-reminder', 'toggle-reminder'])
const money = value => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value) : 'Amount unavailable'
const today = ref(localDay())
const month = ref(today.value.slice(0, 7))
const view = ref('calendar')
const calendar = ref(null)
const filters = reactive({ search: '', category: '', from: '', to: '', status: 'all', date: '' })
const ownRecords = computed(() => props.userId ? props.records.filter(row => !row.userId || row.userId === props.userId) : [])
const ownReminders = computed(() => props.userId ? props.reminders.filter(row => !row.userId || row.userId === props.userId) : [])
const records = computed(() => filterRecords(ownRecords.value, filters))
const reminders = computed(() => filterReminders(ownReminders.value, filters, today.value))
const counts = computed(() => reminderCounts(ownReminders.value, today.value))
const cells = computed(() => monthGrid(month.value))
const monthLabel = computed(() => parseDay(`${month.value}-01`)?.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))
const calendarReminders = computed(() => filterReminders(ownReminders.value, { ...filters, date: '' }, today.value))
const dayCounts = computed(() => calendarReminders.value.reduce((result, row) => { result[row.date] = (result[row.date] || 0) + 1; return result }, {}))
const tabs = computed(() => [{ value: 'calendar', label: 'Calendar', disabled: props.busy }, { value: 'list', label: 'List', disabled: props.busy }])
function clearFilters() { Object.assign(filters, { search: '', category: '', from: '', to: '', status: 'all', date: '' }) }
function reset() { clearFilters(); today.value = localDay(); month.value = today.value.slice(0, 7); view.value = 'calendar' }
watch(() => props.userId, reset, { flush: 'sync' })
watch(() => props.mode, clearFilters)
function act(event, row) {
  if (props.busy || !props.userId || (row && (props.deleting === row.id || props.pendingReminder === row.id || (row.userId && row.userId !== props.userId)))) return
  if (event.endsWith('record') && row?.sourceId) return
  emit(event, ...(row ? [row] : []))
}
function moveMonth(amount) { if (!props.busy) { month.value = shiftMonth(month.value, amount); filters.date = '' } }
function selectDay(date) { if (!props.busy) { filters.date = filters.date === date ? '' : date; month.value = date.slice(0, 7) } }
function goToday() { if (!props.busy) { today.value = localDay(); month.value = today.value.slice(0, 7); filters.date = today.value } }
async function dayKey(event, date) {
  const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -parseDay(date).getDay(), End: 6 - parseDay(date).getDay() }
  if (props.busy || !(event.key in offsets)) return
  event.preventDefault()
  const target = shiftDay(date, offsets[event.key])
  month.value = target.slice(0, 7)
  await nextTick()
  calendar.value?.querySelector(`[data-day="${target}"]`)?.focus()
}
let clock
onMounted(() => { clock = setInterval(() => { today.value = localDay() }, 60000) })
onUnmounted(() => clearInterval(clock))
</script>

<template>
  <div class="farm-journal" :aria-busy="busy || undefined">
    <FbPageHeader :title="mode === 'records' ? 'Farm records' : 'Reminders'" :description="mode === 'records' ? 'A clear history of your farm activities and linked transactions.' : 'Plan the work ahead. Reminder details stay here in the app.'">
      <FbButton :disabled="busy || !userId" @click="act(mode === 'records' ? 'add-record' : 'add-reminder')">{{ mode === 'records' ? 'Add record' : 'Add reminder' }}</FbButton>
    </FbPageHeader>
    <FbEmptyState v-if="!userId" title="Your private farm journal" description="Sign in to view your records and reminders." />
    <template v-else>
      <div v-if="mode === 'reminders'" class="journal-counts" aria-label="Reminder totals">
        <div v-for="(count, status) in counts" :key="status"><strong>{{ count }}</strong><span>{{ status }}</span></div>
      </div>
      <FbPanel>
        <fieldset class="journal-filters" :disabled="busy"><legend class="sr-only">{{ mode === 'records' ? 'Record filters' : 'Reminder filters' }}</legend>
          <label class="journal-search">Search<input v-model="filters.search" class="fb-input" type="search" :placeholder="mode === 'records' ? 'Search title or notes' : 'Find a reminder'"></label>
          <template v-if="mode === 'records'">
            <label>Category<select v-model="filters.category" class="fb-input"><option value="">All categories</option><option value="activity">Activity</option><option value="income">Income</option><option value="expense">Expense</option></select></label>
            <label>From<input v-model="filters.from" class="fb-input" type="date"></label><label>To<input v-model="filters.to" class="fb-input" type="date"></label>
          </template>
          <label v-else>Status<select v-model="filters.status" class="fb-input"><option value="all">All reminders</option><option value="open">Open</option><option value="completed">Completed</option><option value="overdue">Overdue</option><option value="today">Due today</option></select></label>
          <FbButton variant="ghost" :disabled="busy" @click="clearFilters">Clear filters</FbButton>
        </fieldset>
        <p v-if="filters.from && filters.to && filters.from > filters.to" class="journal-warning" role="status">The start date is after the end date.</p>
        <template v-if="mode === 'reminders'">
          <FbTabs v-model="view" :items="tabs" label="Reminder view" />
          <div v-if="view === 'calendar'" class="journal-calendar">
            <div class="calendar-heading"><h3 aria-live="polite">{{ monthLabel }}</h3><div class="fb-actions"><FbButton variant="ghost" :disabled="busy" aria-label="Previous month" @click="moveMonth(-1)">‹</FbButton><FbButton variant="ghost" :disabled="busy" @click="goToday">Today</FbButton><FbButton variant="ghost" :disabled="busy" aria-label="Next month" @click="moveMonth(1)">›</FbButton></div></div>
            <div class="calendar-week" aria-hidden="true"><span v-for="day in ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']" :key="day">{{ day }}</span></div>
            <div ref="calendar" class="calendar-grid" role="group" :aria-label="monthLabel">
              <button v-for="cell in cells" :key="cell.date" type="button" :data-day="cell.date" :disabled="busy" :class="{ outside: !cell.inMonth, selected: filters.date === cell.date, today: today === cell.date }" :aria-pressed="filters.date === cell.date" :aria-current="today === cell.date ? 'date' : undefined" :aria-label="`${displayDay(cell.date)}, ${dayCounts[cell.date] || 0} ${dayCounts[cell.date] === 1 ? 'reminder' : 'reminders'}`" @click="selectDay(cell.date)" @keydown="dayKey($event, cell.date)"><span>{{ cell.day }}</span><small v-if="dayCounts[cell.date]">{{ dayCounts[cell.date] }}<span class="day-word"> due</span></small></button>
            </div>
          </div>
          <div v-if="filters.date" class="selected-date"><span>Due {{ displayDay(filters.date) }}</span><FbButton variant="ghost" :disabled="busy" @click="filters.date = ''">Show all dates</FbButton></div>
        </template>
        <div class="journal-results" role="status">{{ mode === 'records' ? records.length : reminders.length }} {{ mode === 'records' ? 'records' : 'reminders' }} shown</div>
        <div v-if="mode === 'records' && records.length" class="journal-list">
          <article v-for="record in records" :key="record.id" class="journal-card"><div class="card-body"><div class="card-meta"><FbBadge>{{ record.category || 'Activity' }}</FbBadge><FbBadge :tone="record.sourceId ? 'neutral' : 'success'">{{ record.sourceId ? 'Linked · read-only' : 'Manual · editable' }}</FbBadge><time :datetime="recordDay(record)">{{ displayDay(recordDay(record)) }}</time></div><h3>{{ record.title }}</h3><p v-if="record.note">{{ record.note }}</p><p v-if="['income', 'expense'].includes(record.category)" class="journal-amount">{{ money(record.amount) }}</p></div><div v-if="!record.sourceId" class="fb-actions"><FbButton variant="ghost" :disabled="busy || deleting === record.id" @click="act('edit-record', record)">Edit</FbButton><FbButton variant="danger" :disabled="busy || deleting === record.id" @click="act('delete-record', record)">{{ deleting === record.id ? 'Deleting…' : 'Delete' }}</FbButton></div><p v-else class="linked-hint">Manage in its source workflow.</p></article>
        </div>
        <div v-else-if="mode === 'reminders' && reminders.length" class="journal-list">
          <article v-for="reminder in reminders" :key="reminder.id" class="journal-card"><div class="card-body"><div class="card-meta"><FbBadge :tone="reminder.completed ? 'success' : reminder.date < today ? 'danger' : 'warning'">{{ reminder.completed ? 'Completed' : reminder.date < today ? 'Overdue' : reminder.date === today ? 'Due today' : 'Open' }}</FbBadge><time :datetime="reminder.date">{{ displayDay(reminder.date) }}</time></div><h3>{{ reminder.title }}</h3><p v-if="reminder.note">{{ reminder.note }}</p></div><div class="fb-actions"><FbButton variant="secondary" :disabled="busy || pendingReminder === reminder.id || deleting === reminder.id" @click="act('toggle-reminder', reminder)">{{ pendingReminder === reminder.id ? 'Saving…' : reminder.completed ? 'Reopen' : 'Mark complete' }}</FbButton><FbButton variant="ghost" :disabled="busy || pendingReminder === reminder.id || deleting === reminder.id" @click="act('edit-reminder', reminder)">Edit</FbButton><FbButton variant="danger" :disabled="busy || pendingReminder === reminder.id || deleting === reminder.id" @click="act('delete-reminder', reminder)">{{ deleting === reminder.id ? 'Deleting…' : 'Delete' }}</FbButton></div></article>
        </div>
        <FbEmptyState v-else :title="mode === 'records' ? 'No matching records' : 'No matching reminders'" description="Try clearing your filters, or add an item to get started." />
      </FbPanel>
    </template>
  </div>
</template>

<style scoped>
.farm-journal{width:100%;min-width:0;font-family:'Plus Jakarta Sans',sans-serif;color:#193d2b}.journal-counts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:20px}.journal-counts>div{display:grid;gap:5px;padding:18px;border-radius:16px;background:#edf3e5;border:1px solid #dfe7d8}.journal-counts strong{font-size:26px}.journal-counts span{text-transform:capitalize;font-size:12px}.journal-filters{display:flex;align-items:end;flex-wrap:wrap;gap:12px;border:0;padding:0;margin:0 0 20px;min-width:0}.journal-filters label{display:grid;gap:7px;flex:1 1 130px;font-size:12px;font-weight:700;min-width:0}.journal-filters .journal-search{flex:2 1 210px}.journal-results{font-size:12px;color:#617456;margin:16px 0}.journal-list{display:grid;gap:12px}.journal-card{display:flex;align-items:center;justify-content:space-between;gap:16px;border:1px solid #e0e8da;border-radius:16px;padding:18px;min-width:0}.card-body{min-width:0;flex:1}.card-meta{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.card-meta time,.linked-hint{font-size:12px;color:#617456}.journal-card h3{font-size:15px;font-weight:700;overflow-wrap:anywhere}.journal-card p{font-size:13px;margin-top:6px;white-space:pre-wrap;overflow-wrap:anywhere}.calendar-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}.calendar-heading h3{font-size:17px;font-weight:700}.calendar-week,.calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}.calendar-week span{text-align:center;font-size:11px;padding:8px 0;color:#617456}.calendar-grid button{min-width:0;min-height:68px;padding:8px 3px;border:1px solid #e1e8db;border-radius:10px;background:#fff;display:flex;flex-direction:column;align-items:center;gap:5px;font:inherit;font-size:13px;color:#193d2b;cursor:pointer}.calendar-grid button.outside{background:#f5f7f1;color:#7d8876}.calendar-grid button.today{border:2px solid #066136}.calendar-grid button.selected{background:#fff1b7;border-color:#c99f22}.calendar-grid small{font-size:10px;color:#066136;font-weight:700}.calendar-grid button:focus-visible{outline:3px solid #d6a71b;outline-offset:1px}.calendar-grid button:disabled{opacity:.55;cursor:not-allowed}.selected-date{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:16px;font-size:13px}.journal-warning{color:#9a3926;font-size:13px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}@media(max-width:640px){.journal-card{align-items:start;flex-direction:column;padding:14px}.journal-counts{grid-template-columns:repeat(2,minmax(0,1fr))}.journal-filters label{flex-basis:100%}.calendar-grid button{min-height:52px;font-size:12px}.day-word{display:none}.journal-calendar{margin-inline:-6px}.calendar-week,.calendar-grid{gap:2px}}
</style>
