<script setup>
import { computed, reactive, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Sprout, ArrowDownLeft, ArrowUpRight, Plus, CheckCircle2, Circle, CalendarDays } from 'lucide-vue-next'
import FbPageHeader from './ui/FbPageHeader.vue'
import FbButton from './ui/FbButton.vue'
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
const recordGroups = computed(() => {
  const groups = []
  for (const record of records.value) {
    const date = recordDay(record)
    let group = groups[groups.length - 1]
    if (!group || group.date !== date) { group = { date, records: [] }; groups.push(group) }
    group.records.push(record)
  }
  return groups
})
const dayProgress = computed(() => calendarReminders.value.reduce((result, row) => {
  if (!result[row.date]) result[row.date] = { total: 0, completed: 0 }
  result[row.date].total++
  if (row.completed) result[row.date].completed++
  return result
}, {}))
const activityIcon = category => category === 'income' ? ArrowDownLeft : category === 'expense' ? ArrowUpRight : Sprout
const focusDate = computed(() => filters.date || today.value)
const focusReminders = computed(() => calendarReminders.value.filter(row => row.date === focusDate.value))
const shownReminders = computed(() => view.value === 'calendar' && !filters.date ? focusReminders.value : reminders.value)
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
      <FbButton :disabled="busy || !userId" @click="act(mode === 'records' ? 'add-record' : 'add-reminder')"><Plus :size="18" aria-hidden="true" /> {{ mode === 'records' ? 'Add record' : 'Add reminder' }}</FbButton>
    </FbPageHeader>
    <FbEmptyState v-if="!userId" title="Your private farm journal" description="Sign in to view your records and reminders." />
    <template v-else>
      <div v-if="mode === 'records'" class="story-intro"><Sprout :size="30" aria-hidden="true" /><div><h2>Your farm, day by day</h2><p>Fieldwork, milestones and money. A story built from your records.</p></div></div>
      <div v-if="mode === 'reminders'" class="day-focus"><CalendarDays :size="28" aria-hidden="true" /><div><span>{{ filters.date ? 'Selected day' : 'Today on the farm' }}</span><h2>{{ displayDay(focusDate) }}</h2><p>{{ focusReminders.filter(row => !row.completed).length }} open · {{ focusReminders.filter(row => row.completed).length }} completed</p></div><FbButton variant="secondary" :disabled="busy" @click="goToday">Focus today</FbButton></div>
      <div v-if="mode === 'reminders'" class="journal-counts" aria-label="Reminder totals">
        <div v-for="(count, status) in counts" :key="status"><strong>{{ count }}</strong><span>{{ status }}</span></div>
      </div>
      <section class="journal-surface">
        <details class="filter-drawer"><summary>Find {{ mode === 'records' ? 'a farm record' : 'a reminder' }} · Search & filters</summary>
        <fieldset class="journal-filters" :disabled="busy"><legend class="sr-only">{{ mode === 'records' ? 'Record filters' : 'Reminder filters' }}</legend>
          <label class="journal-search">Search<input v-model="filters.search" class="fb-input" type="search" :placeholder="mode === 'records' ? 'Search title or notes' : 'Find a reminder'"></label>
          <template v-if="mode === 'records'">
            <label>Category<select v-model="filters.category" class="fb-input"><option value="">All categories</option><option value="activity">Activity</option><option value="income">Income</option><option value="expense">Expense</option></select></label>
            <label>From<input v-model="filters.from" class="fb-input" type="date"></label><label>To<input v-model="filters.to" class="fb-input" type="date"></label>
          </template>
          <label v-else>Status<select v-model="filters.status" class="fb-input"><option value="all">All reminders</option><option value="open">Open</option><option value="completed">Completed</option><option value="overdue">Overdue</option><option value="today">Due today</option></select></label>
          <FbButton variant="ghost" :disabled="busy" @click="clearFilters">Clear filters</FbButton>
        </fieldset></details>
        <p v-if="filters.from && filters.to && filters.from > filters.to" class="journal-warning" role="status">The start date is after the end date.</p>
        <template v-if="mode === 'reminders'">
          <FbTabs v-model="view" :items="tabs" label="Reminder view" />
          <div v-if="view === 'calendar'" class="journal-calendar">
            <div class="calendar-heading"><h3 aria-live="polite">{{ monthLabel }}</h3><div class="fb-actions"><FbButton variant="ghost" :disabled="busy" aria-label="Previous month" @click="moveMonth(-1)"><span aria-hidden="true">‹</span> Previous</FbButton><FbButton variant="ghost" :disabled="busy" @click="goToday">Today</FbButton><FbButton variant="ghost" :disabled="busy" aria-label="Next month" @click="moveMonth(1)">Next <span aria-hidden="true">›</span></FbButton></div></div>
            <p class="calendar-help">Choose a day to see its work. Use arrow keys or scroll across on small screens.</p><div class="calendar-scroll"><div class="calendar-week" aria-hidden="true"><span v-for="day in ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']" :key="day">{{ day }}</span></div>
            <div ref="calendar" class="calendar-grid" role="group" :aria-label="monthLabel">
              <button v-for="cell in cells" :key="cell.date" type="button" :data-day="cell.date" :disabled="busy" :class="{ outside: !cell.inMonth, selected: filters.date === cell.date, today: today === cell.date }" :aria-pressed="filters.date === cell.date" :aria-current="today === cell.date ? 'date' : undefined" :aria-label="`${displayDay(cell.date)}, ${dayCounts[cell.date] || 0} ${dayCounts[cell.date] === 1 ? 'reminder' : 'reminders'}, ${dayProgress[cell.date]?.completed || 0} completed`" @click="selectDay(cell.date)" @keydown="dayKey($event, cell.date)"><span>{{ cell.day }}</span><span v-if="today === cell.date" class="today-label">Today</span><small v-if="dayCounts[cell.date]"><span aria-hidden="true">{{ dayProgress[cell.date]?.completed === dayCounts[cell.date] ? '✓' : '○' }}</span> {{ dayProgress[cell.date]?.completed ? `${dayProgress[cell.date].completed}/${dayCounts[cell.date]}` : dayCounts[cell.date] }}<span class="day-word"> {{ dayProgress[cell.date]?.completed ? 'done' : 'due' }}</span></small></button>
            </div></div>
          </div>
          <div v-if="filters.date" class="selected-date"><span>Due {{ displayDay(filters.date) }}</span><FbButton variant="ghost" :disabled="busy" @click="filters.date = ''; view = 'list'">Show all dates</FbButton></div>
        </template>
        <div v-if="mode === 'reminders'" class="agenda-heading"><h2>{{ view === 'calendar' ? `Work for ${displayDay(focusDate)}` : 'All matching work' }}</h2><FbButton v-if="view === 'calendar'" variant="ghost" :disabled="busy" @click="filters.date = ''; view = 'list'">See all reminders</FbButton></div>
        <div class="journal-results" role="status">{{ mode === 'records' ? records.length : shownReminders.length }} {{ mode === 'records' ? 'records' : 'reminders' }} shown</div>
        <div v-if="mode === 'records' && records.length" class="journal-story">
          <section v-for="group in recordGroups" :key="group.date" class="story-day"><h2 class="story-date"><time :datetime="group.date">{{ displayDay(group.date) }}</time><span>{{ group.records.length }} {{ group.records.length === 1 ? 'record' : 'records' }}</span></h2><div class="story-entries">
          <article v-for="record in group.records" :key="record.id" class="journal-card"><span class="activity-icon" :class="record.category"><component :is="activityIcon(record.category)" :size="22" aria-hidden="true" /></span><div class="card-body"><div class="card-meta"><FbBadge>{{ record.category || 'Activity' }}</FbBadge><FbBadge :tone="record.sourceId ? 'neutral' : 'success'">{{ record.sourceId ? 'Linked · read-only' : 'Manual · editable' }}</FbBadge></div><h3>{{ record.title }}</h3><p v-if="record.note">{{ record.note }}</p><p v-if="['income', 'expense'].includes(record.category)" class="journal-amount">{{ record.category === 'income' ? 'Received' : 'Spent' }} {{ money(record.amount) }}</p></div><div v-if="!record.sourceId" class="fb-actions"><FbButton variant="ghost" :disabled="busy || deleting === record.id" :aria-label="`Edit ${record.title}`" @click="act('edit-record', record)">Edit</FbButton><FbButton variant="danger" :disabled="busy || deleting === record.id" :aria-label="`Delete ${record.title}`" @click="act('delete-record', record)">{{ deleting === record.id ? 'Deleting…' : 'Delete' }}</FbButton></div><p v-else class="linked-hint">Manage in its source workflow.</p></article>
          </div></section>
        </div>
        <div v-else-if="mode === 'reminders' && shownReminders.length" class="journal-list">
          <article v-for="reminder in shownReminders" :key="reminder.id" class="journal-card reminder-row" :class="{ completed: reminder.completed }"><span class="completion-icon"><CheckCircle2 v-if="reminder.completed" :size="24" aria-hidden="true" /><Circle v-else :size="24" aria-hidden="true" /></span><div class="card-body"><div class="card-meta"><FbBadge :tone="reminder.completed ? 'success' : reminder.date < today ? 'danger' : 'warning'">{{ reminder.completed ? 'Completed' : reminder.date < today ? 'Overdue' : reminder.date === today ? 'Due today' : 'Open' }}</FbBadge><time :datetime="reminder.date">{{ displayDay(reminder.date) }}</time></div><h3>{{ reminder.title }}</h3><p v-if="reminder.note">{{ reminder.note }}</p></div><div class="fb-actions"><FbButton variant="secondary" :disabled="busy || pendingReminder === reminder.id || deleting === reminder.id" @click="act('toggle-reminder', reminder)">{{ pendingReminder === reminder.id ? 'Saving…' : reminder.completed ? 'Reopen' : 'Mark complete' }}</FbButton><FbButton variant="ghost" :disabled="busy || pendingReminder === reminder.id || deleting === reminder.id" :aria-label="`Edit ${reminder.title}`" @click="act('edit-reminder', reminder)">Edit</FbButton><FbButton variant="danger" :disabled="busy || pendingReminder === reminder.id || deleting === reminder.id" :aria-label="`Delete ${reminder.title}`" @click="act('delete-reminder', reminder)">{{ deleting === reminder.id ? 'Deleting…' : 'Delete' }}</FbButton></div></article>
        </div>
        <FbEmptyState v-else :title="mode === 'records' ? 'No matching records' : view === 'calendar' ? 'No work scheduled for this day' : 'No matching reminders'" :description="mode === 'reminders' && view === 'calendar' ? 'Choose another day, see all reminders, or add a reminder to plan your next job.' : 'Try clearing your filters, or add an item to get started.'" />
      </section>
    </template>
  </div>
</template>

<style scoped>
.farm-journal{width:100%;min-width:0;font-family:'Plus Jakarta Sans',sans-serif;color:#193d2b}.journal-surface{min-width:0}.journal-filters{display:flex;align-items:end;flex-wrap:wrap;gap:12px;border:0;padding:0;margin:0 0 20px;min-width:0}.journal-filters label{display:grid;gap:7px;flex:1 1 130px;font-size:12px;font-weight:700;min-width:0}.journal-filters .journal-search{flex:2 1 210px}.journal-results{font-size:12px;color:#49634f;margin:16px 0}.journal-list{display:grid;gap:12px}.journal-card{display:flex;justify-content:space-between;min-width:0}.card-body{min-width:0;flex:1}.card-meta{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.card-meta time,.linked-hint{font-size:12px;color:#49634f}.journal-card h3{font-weight:700;overflow-wrap:anywhere}.journal-card p{font-size:13px;margin-top:6px;white-space:pre-wrap;overflow-wrap:anywhere}.calendar-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}.calendar-heading h3{font-weight:700}.calendar-week,.calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(44px,1fr));min-width:314px}.calendar-week span{text-align:center;font-size:11px;padding:8px 0}.calendar-grid button{min-width:44px;display:flex;flex-direction:column;gap:5px;font:inherit;font-size:13px;color:#193d2b;background:white;cursor:pointer}.calendar-grid button:disabled{opacity:.55;cursor:not-allowed}.calendar-help{font-size:12px;color:#49634f;line-height:1.7;margin-bottom:12px}.calendar-scroll{overflow-x:auto;padding:3px}.selected-date{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:16px;font-size:13px}.journal-warning{color:#9a3926;font-size:13px}.journal-counts span{text-transform:capitalize;font-size:12px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}

/* A dated field journal, with a separate work-calendar rhythm. */
.story-intro,.day-focus{display:flex;align-items:center;gap:20px;padding:28px 0 32px;border-top:3px solid #066136}
.story-intro>svg,.day-focus>svg{flex-shrink:0;color:#066136}.story-intro h2,.day-focus h2{font-size:clamp(22px,3vw,32px);font-weight:800;letter-spacing:-.04em;line-height:1.25}.story-intro p,.day-focus p{font-size:14px;line-height:1.7;margin-top:8px;color:#49634f;max-width:60ch}.day-focus{background:#F5F6F0;padding:26px;border-radius:0 0 24px 24px}.day-focus>div{flex:1}.day-focus span{font-size:13px;font-weight:700}.journal-counts{display:flex;gap:0;border-bottom:1px solid #d7e2d8;margin:0 0 24px}.journal-counts>div{flex:1;display:flex;align-items:baseline;gap:8px;background:none;border:0;border-radius:0;padding:16px 12px}.journal-counts strong{font-size:22px}.journal-counts span{color:#49634f}
.filter-drawer{margin-bottom:24px;border-bottom:1px solid #d7e2d8}.filter-drawer summary{min-height:48px;cursor:pointer;font-size:13px;font-weight:700;padding:14px 0}.filter-drawer[open] summary{margin-bottom:14px}.journal-filters{padding-bottom:16px}.journal-calendar{background:#F5F6F0;padding:24px;border-radius:20px;margin-top:20px}.calendar-heading h3{font-size:24px;letter-spacing:-.03em}.calendar-week span{font-weight:700;color:#49634f}.calendar-grid{gap:1px;background:#d7e2d8;border:1px solid #d7e2d8;border-radius:12px;overflow:hidden}.calendar-grid button{border:0;border-radius:0;min-height:96px;align-items:flex-start;padding:10px;font-weight:700;position:relative}.calendar-grid button.outside{color:#556252;background:#f0f2ec}.calendar-grid button.today{box-shadow:inset 0 0 0 2px #066136;border:0}.calendar-grid button.selected{background:#F9C23C;color:#193d2b;box-shadow:inset 0 0 0 2px #193d2b}.calendar-grid small{font-size:11px;color:#066136;white-space:nowrap}.calendar-grid .today-label{font-size:9px;font-weight:800}.calendar-grid button:focus-visible{outline:3px solid #066136;outline-offset:-4px;z-index:1}
.agenda-heading{display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap;margin-top:28px}.agenda-heading h2{font-size:20px;font-weight:800}.story-day{display:grid;grid-template-columns:150px minmax(0,1fr);gap:24px;margin-top:28px}.story-date{font-size:15px;font-weight:800;padding-top:24px}.story-date span{display:block;margin-top:8px;font-size:12px;font-weight:500;color:#49634f}.story-entries{border-left:2px solid #d7e2d8;padding-left:24px}.journal-card{position:relative;align-items:flex-start;border:0;border-bottom:1px solid #d7e2d8;border-radius:0;padding:24px 0;gap:16px}.activity-icon{display:grid;place-items:center;width:44px;height:44px;flex-shrink:0;background:#e8f2e9;color:#066136;border-radius:50%}.activity-icon.expense{background:#fff0bb;color:#614b09}.journal-card h3{font-size:18px;line-height:1.5}.journal-card p{line-height:1.75;max-width:65ch}.journal-amount{font-weight:800}.card-meta{margin-bottom:8px}.completion-icon{color:#066136;padding-top:4px}.reminder-row.completed{background:#F5F6F0;padding-inline:16px;border-left:4px solid #066136}.reminder-row.completed h3{text-decoration:line-through;text-decoration-thickness:1px}.farm-journal :deep(button),.farm-journal :deep(input),.farm-journal :deep(select){min-height:44px;min-width:44px}.farm-journal :deep(button:focus-visible),.farm-journal :deep(input:focus-visible),.farm-journal :deep(select:focus-visible),summary:focus-visible{outline:3px solid #066136;outline-offset:3px}.farm-journal :deep(.fb-actions){flex-wrap:wrap}
@media(max-width:760px){.story-day{grid-template-columns:1fr;gap:8px}.story-date{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.story-date span{margin:0}.story-entries{padding-left:16px}.journal-card{flex-wrap:wrap}.journal-card .card-body{flex-basis:calc(100% - 64px)}.journal-card>.fb-actions,.linked-hint{margin-left:60px}.journal-calendar{padding:12px;margin-inline:0}.calendar-grid button{padding:8px 3px;min-height:76px}.day-focus{flex-wrap:wrap;padding:20px}.journal-counts{flex-wrap:wrap}.journal-counts>div{flex-basis:50%}}
@media(max-width:380px){.journal-calendar{padding:0;background:none}.calendar-grid button{min-height:68px}.calendar-grid small{font-size:9px}.day-word{display:none}.story-intro{gap:12px}.journal-card>.fb-actions,.linked-hint{margin-left:0}.calendar-heading h3{font-size:20px}}
@media(prefers-reduced-motion:reduce){.farm-journal :deep(*){animation:none!important;transition:none!important;scroll-behavior:auto!important}}
</style>
