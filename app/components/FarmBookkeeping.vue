<script setup>
import { computed, ref, watch } from 'vue'
import FbButton from './ui/FbButton.vue'
import FbTabs from './ui/FbTabs.vue'
import { Download, Trash2, Wallet, ArrowDownLeft, ArrowUpRight } from 'lucide-vue-next'
import { amountToCents, entryMonth, filterEntries, summarizeEntries, monthlySummary, exportEntriesCsv } from '../utils/bookkeeping.js'

const props = defineProps({ busy: Boolean, records: { type: Array, default: () => [] }, deleting: { type: String, default: '' }, userId: { type: [String, Number], default: null } })
const emit = defineEmits(['add-entry', 'delete-entry', 'edit-entry'])
const month = ref('')
const search = ref('')
const category = ref('')
const exportMessage = ref('')
const exportError = ref('')
const tab = ref('ledger')
watch(() => props.userId, () => {
  month.value = ''; search.value = ''; category.value = ''; tab.value = 'ledger'
  exportMessage.value = ''; exportError.value = ''
}, { flush: 'sync' })
const periodEntries = computed(() => filterEntries(props.records, { month: month.value }))
const totals = computed(() => summarizeEntries(periodEntries.value))
const entries = computed(() => filterEntries(props.records, { month: month.value, search: search.value, category: category.value }))
const months = computed(() => monthlySummary(props.records))
const monthly = computed(() => monthlySummary(entries.value))
const chartMonths = computed(() => [...monthly.value].reverse())
const chartMax = computed(() => Math.max(1, ...monthly.value.flatMap(item => [item.incomeCents, item.expenseCents])))
const cashScale = computed(() => Math.max(1, totals.value.incomeCents, totals.value.expenseCents))
const money = cents => cents === null ? 'Invalid amount' : new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(cents / 100)
const monthLabel = value => new Date(`${value}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
function dateLabel(value) {
  const date = new Date(value)
  return !entryMonth({ createdAt: value }) ? 'Unknown date' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
function exportCsv() {
  exportMessage.value = ''; exportError.value = ''
  if (!entries.value.length) { exportError.value = 'No matching entries to export.'; return }
  let url
  let link
  try {
    url = URL.createObjectURL(new Blob(['\uFEFF', exportEntriesCsv(entries.value)], { type: 'text/csv;charset=utf-8;' }))
    link = document.createElement('a')
    link.href = url
    link.download = `farm-bookkeeping-${month.value || 'all-time'}.csv`
    document.body.appendChild(link)
    link.click()
    exportMessage.value = `CSV download requested for ${entries.value.length} entries. Check your browser downloads.`
  } catch {
    exportError.value = 'Could not start the CSV download. Please try again in a browser that supports downloads.'
  } finally {
    link?.remove()
    if (url) setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
</script>

<template>
  <section class="bookkeeping" aria-labelledby="bookkeeping-heading">
    <header class="book-header">
      <div><h2 id="bookkeeping-heading">Your farm cashbook</h2><p>Follow the money coming in. Know where it goes.</p></div>
      <div class="actions"><FbButton :disabled="busy" @click="emit('add-entry', 'income')"><ArrowDownLeft :size="20" aria-hidden="true" /> Receive money</FbButton><FbButton :disabled="busy" variant="secondary" class="gold" @click="emit('add-entry', 'expense')"><ArrowUpRight :size="20" aria-hidden="true" /> Spend money</FbButton></div>
    </header>

    <div class="period"><label for="bookkeeping-period">Summary period</label><select id="bookkeeping-period" v-model="month"><option value="">All time</option><option v-for="item in months" :key="item.month" :value="item.month">{{ monthLabel(item.month) }}</option></select><span>Dates grouped in UTC</span></div>
    <section class="cashbook-spread" aria-label="Recorded cash movement">
      <div class="cashbook-page incoming"><h3><ArrowDownLeft :size="24" aria-hidden="true" /> Money in</h3><strong>{{ money(totals.incomeCents) }}</strong><p>Income received</p><div class="flow-track" aria-hidden="true"><span :style="{ width: `${totals.incomeCents / cashScale * 100}%` }"></span></div></div>
      <div class="cashbook-page outgoing"><h3><ArrowUpRight :size="24" aria-hidden="true" /> Money out</h3><strong>{{ money(totals.expenseCents) }}</strong><p>Expenses paid</p><div class="flow-track" aria-hidden="true"><span :style="{ width: `${totals.expenseCents / cashScale * 100}%` }"></span></div></div>
      <div class="cashbook-balance"><Wallet :size="26" aria-hidden="true" /><div><span>Net recorded cash</span><strong>{{ money(totals.netCents) }}</strong></div><p>Money in minus money out<br>{{ month ? monthLabel(month) : 'All recorded time' }}</p></div>
    </section>
    <details class="disclaimer"><summary>About these cash figures · NGN · UTC dates</summary><p>This is recorded cash, not accounting profit, bank balance, full accounting or tax reporting. It excludes activity notes, unpaid amounts and unrecorded transactions.</p></details>
    <p v-if="totals.invalidCount" role="status" class="warning">{{ totals.invalidCount }} entries have invalid amounts and are excluded from totals. Review these records before relying on the summary.</p>

    <section class="ledger" aria-labelledby="ledger-heading">
      <div class="ledger-title"><div><h3 id="ledger-heading">{{ tab === 'ledger' ? 'Cash ledger' : 'Report filters' }}</h3><p>Search and export your income and expenses.</p></div><button :disabled="!entries.length" @click="exportCsv"><Download :size="16" aria-hidden="true" /> Export filtered CSV</button></div>
      <div class="filters"><label>Search title or note<input v-model="search" type="search" placeholder="e.g. feed or market" /></label><label>Entry category<select v-model="category"><option value="">Income & expenses</option><option value="income">Income</option><option value="expense">Expenses</option></select></label></div>
      <p class="count" role="status">{{ entries.length }} {{ entries.length === 1 ? 'entry' : 'entries' }} shown. Summary figures use the selected period, not the search or category filter.</p>
      <p v-if="exportMessage" role="status" class="count">{{ exportMessage }}</p>
      <p v-if="exportError" role="alert" class="warning">{{ exportError }}</p>
    </section>
    <FbTabs v-model="tab" :items="[{ value: 'ledger', label: 'Cash ledger' }, { value: 'reports', label: 'Monthly reports' }]" label="Bookkeeping views">
      <template #ledger><div class="ledger">
      <div v-if="!entries.length" class="empty"><Wallet :size="30" aria-hidden="true" /><h4>{{ periodEntries.length ? 'No matching entries' : 'No cash entries yet for this period' }}</h4><p>{{ periodEntries.length ? 'Try a different search or category.' : 'Add income or an expense to start your cash record. Activity notes stay in farm records.' }}</p><button v-if="search || category || month" @click="search = ''; category = ''; month = ''">Clear filters</button></div>
      <ul v-else class="entries">
        <li v-for="entry in entries" :key="entry.id"><div class="entry-main"><span class="badge" :class="entry.category"><ArrowDownLeft v-if="entry.category === 'income'" :size="18" aria-hidden="true" /><ArrowUpRight v-else :size="18" aria-hidden="true" />{{ entry.category === 'income' ? 'Money in' : 'Money out' }}</span><h4>{{ entry.title }}</h4><p v-if="entry.note" class="note">{{ entry.note }}</p><time :datetime="entry.createdAt">{{ dateLabel(entry.createdAt) }} (UTC)</time></div><div class="entry-value"><strong><span class="cash-sign" aria-hidden="true">{{ entry.category === 'income' ? '+' : '−' }}</span>{{ money(amountToCents(entry.amount)) }}</strong><span v-if="entry.sourceId" class="text-xs">Linked workflow entry</span><template v-else><FbButton :disabled="busy || Boolean(deleting)" :aria-label="`Edit ${entry.title}`" @click="emit('edit-entry', entry)">Edit</FbButton><button :disabled="busy || Boolean(deleting)" :aria-label="`Delete ${entry.title}`" @click="emit('delete-entry', entry)"><Trash2 :size="16" aria-hidden="true" /><span>Delete</span></button></template></div></li>
      </ul>
      </div></template>
      <template #reports>
    <section class="monthly" aria-labelledby="monthly-heading"><h3 id="monthly-heading">Monthly breakdown</h3><p>Based on the filtered ledger above. Cash in and cash out, not profit.</p><p v-if="!monthly.length" class="empty">No monthly cash records match these filters.</p><div v-else class="cash-chart" role="img" aria-label="Monthly recorded cash in and out. Exact figures are in the table below."><div v-for="item in chartMonths" :key="item.month" class="chart-row"><span>{{ monthLabel(item.month) }}</span><div><span class="bar-label">In</span><div class="cash-bar cash-in" :style="{ width: `${item.incomeCents / chartMax * 100}%` }"></div><span class="bar-label">Out</span><div class="cash-bar cash-out" :style="{ width: `${item.expenseCents / chartMax * 100}%` }"></div></div></div><p>Green: cash in · Yellow: cash out</p></div><div class="table-scroll"><table><caption class="sr-only">Filtered monthly cash summary in NGN</caption><thead><tr><th scope="col">Month (UTC)</th><th scope="col">Income</th><th scope="col">Expenses</th><th scope="col">Net cash</th></tr></thead><tbody><tr v-for="item in monthly" :key="item.month"><th scope="row">{{ monthLabel(item.month) }}</th><td>{{ money(item.incomeCents) }}</td><td>{{ money(item.expenseCents) }}</td><td>{{ money(item.netCents) }}</td></tr></tbody></table></div></section>
      </template>
    </FbTabs>
  </section>
</template>

<style scoped>
.bookkeeping{width:100%;min-width:0;max-width:100%;display:grid}.bookkeeping :is(button,input,select){font-family:inherit}.book-header h2{margin:.25rem 0}.cash-chart{padding:1rem 0}.chart-row{display:grid;align-items:center;margin:.9rem 0;font-size:.8rem}.cash-bar{border-radius:.2rem;margin:.25rem 0}.cash-chart>p{font-size:.75rem}.disclaimer summary{cursor:pointer;font-weight:650}.disclaimer p{margin-top:.5rem}
.book-header,.ledger-title{display:flex;align-items:center;justify-content:space-between;gap:1.25rem}h2{font-weight:750;line-height:1.2;margin:.5rem 0}h3,h4{font-weight:750}.book-header p,.ledger-title p,.monthly>p{color:#49634f;font-size:.9rem;margin-top:.35rem}.actions{display:flex;flex-wrap:wrap}button{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;border:1px solid #d7dfd0;border-radius:.75rem;padding:.7rem 1rem;background:white;font-size:.85rem;font-weight:700;cursor:pointer}button:hover{background:#f0f4e9}button:disabled{opacity:.5;cursor:not-allowed}.period{display:flex;align-items:center;flex-wrap:wrap}.period label{font-weight:700;font-size:.85rem}.period span{font-size:.75rem;color:#49634f}select,input{border:1px solid #d6dfce;background:white;border-radius:.65rem;padding:.7rem;color:#193d2b;min-width:0;box-sizing:border-box}.disclaimer,.warning{font-size:.8rem;line-height:1.6}.warning{background:#fff1c9;padding:1rem;border-radius:.7rem}.ledger,.monthly{min-width:0;max-width:100%}.filters{display:grid;gap:1rem;margin-top:1.3rem}.filters label{display:grid;gap:.4rem;font-size:.8rem;font-weight:700}.count{font-size:.75rem;margin:1rem 0}.entries{list-style:none;padding:0;margin:0}.entry-main{min-width:0}.entry-main h4{overflow-wrap:anywhere}.note{font-size:.85rem;color:#49634f;white-space:pre-wrap;overflow-wrap:anywhere}.entry-main time{font-size:.75rem;color:#49634f}.badge{font-weight:800}.entry-value button{font-size:.75rem;padding:.4rem .6rem}.empty{padding:2rem 1rem;text-align:center;color:#49634f;display:grid;justify-items:center;gap:.7rem}.empty p{font-size:.85rem;max-width:28rem}.table-scroll{overflow-x:auto;max-width:100%;min-width:0}table{width:100%;border-collapse:collapse;margin-top:1rem;font-size:.85rem;white-space:nowrap}th,td{text-align:right;padding:.85rem;border-bottom:1px solid #d7e2d8}th:first-child{text-align:left}thead{color:#49634f;font-size:.75rem}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}@media(max-width:760px){.book-header,.ledger-title{flex-direction:column}}

/* An open cashbook: paired cash columns, a shared balance and ruled entries. */
.bookkeeping{font-family:'Plus Jakarta Sans',sans-serif;color:#193d2b;gap:24px}.book-header{padding:12px 0 28px;border-bottom:3px solid #066136;align-items:flex-end}.book-header h2{font-size:clamp(26px,3.5vw,38px);letter-spacing:-.045em;line-height:1.2}.book-header p:not(.eyebrow){color:#49634f;line-height:1.7;max-width:52ch}.actions{gap:10px}.actions :deep(button){min-height:48px;padding:12px 18px}.actions :deep(button:first-child){background:#066136;color:#fff}.actions :deep(button.gold){background:#F9C23C;border-color:#F9C23C;color:#193d2b}.period{padding:0;gap:12px}.period select{font-weight:700}.cashbook-spread{display:grid;grid-template-columns:1fr 1fr;border:1px solid #cbd9cc;border-radius:8px 24px 24px 8px;overflow:hidden;background:#F5F6F0;position:relative}.cashbook-page{padding:32px;min-width:0}.cashbook-page h3{display:flex;align-items:center;gap:10px;font-size:18px}.cashbook-page strong{display:block;font-size:clamp(26px,3.5vw,42px);letter-spacing:-.04em;line-height:1.3;font-weight:800;font-variant-numeric:tabular-nums;margin:24px 0 8px;overflow-wrap:anywhere}.cashbook-page p{font-size:13px;color:#49634f}.cashbook-page.incoming{border-right:1px solid #cbd9cc;background:#f0f6ef}.cashbook-page.outgoing{background:#fff9e6}.flow-track{height:12px;background:#dce8da;margin-top:28px;border-radius:2px;overflow:hidden}.flow-track span{display:block;height:100%;background:#066136}.outgoing .flow-track{background:#eee4bf}.outgoing .flow-track span{background:#F9C23C;border:1px solid #82600b}.cashbook-balance{grid-column:1/-1;display:flex;align-items:center;gap:16px;padding:24px 32px;background:#066136;color:#fff}.cashbook-balance strong{display:block;font-size:28px;font-weight:800;letter-spacing:-.03em;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.cashbook-balance span{font-size:13px}.cashbook-balance p{margin-left:auto;font-size:12px;line-height:1.8;color:#fff}.disclaimer{color:#49634f}.disclaimer summary{min-height:44px;padding:10px 0}.ledger,.monthly{border:0;border-radius:0;padding:0;background:none}.ledger-title{align-items:center}.ledger-title h3{font-size:24px;letter-spacing:-.03em}.filters{background:#F5F6F0;padding:18px;border-radius:12px;grid-template-columns:2fr 1fr}.count{line-height:1.8;color:#49634f}.entries{border-top:2px solid #066136}.entries li{display:grid;grid-template-columns:minmax(0,1fr) minmax(150px,auto);padding:24px 8px;border-bottom:1px solid #d7e2d8;border-top:0;gap:24px}.entry-main h4{font-size:18px;line-height:1.5;margin:10px 0 6px}.badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;text-transform:none;background:#e8f2e9;color:#066136;padding:4px 8px;border-radius:6px}.badge.expense{color:#614b09;background:#fff0bb}.entry-value{display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:flex-end;max-width:250px;gap:8px;min-width:0}.entry-value strong{flex-basis:100%;font-size:20px;font-variant-numeric:tabular-nums;text-align:right;overflow-wrap:anywhere}.cash-sign{padding-right:5px}.entry-value button{min-height:44px}.entry-value>span{flex-basis:100%;text-align:right}.cash-in{background:#066136}.cash-out{background:#F9C23C;border:1px solid #82600b}.bar-label{font-size:11px;font-weight:700}.cash-bar{height:12px}.chart-row{grid-template-columns:minmax(90px,1fr) 3fr;gap:20px;border-bottom:1px solid #d7e2d8;padding-bottom:16px}.bookkeeping :is(button,input,select,summary){min-height:44px}.bookkeeping :deep(button){min-height:44px}.bookkeeping :is(button,input,select,summary):focus-visible,.bookkeeping :deep(button:focus-visible){outline:3px solid #066136;outline-offset:3px}.bookkeeping :is(input,select){width:100%}.period select{width:auto;max-width:100%}.bookkeeping :deep([role=tablist]){flex-wrap:wrap}
@media(max-width:760px){.book-header{align-items:flex-start}.actions{width:100%}.actions :deep(button){flex:1}.cashbook-page{padding:22px 16px}.cashbook-page h3{font-size:15px;gap:6px}.cashbook-page strong{font-size:clamp(20px,5vw,30px)}.cashbook-balance{padding:20px;flex-wrap:wrap}.cashbook-balance>div{min-width:0;flex:1}.cashbook-balance p{margin:0;flex-basis:100%}.filters{grid-template-columns:1fr}.entries li{grid-template-columns:minmax(0,1fr);gap:16px;padding:24px 0}.entry-value{justify-content:flex-start;max-width:100%}.entry-value strong{flex-basis:auto;margin-right:auto;text-align:left}.entry-value>span{text-align:left}.ledger,.monthly{padding:0}.period{align-items:flex-start}.period span{flex-basis:100%}.ledger-title{align-items:flex-start}.ledger-title button{max-width:100%}}
@media(max-width:380px){.cashbook-spread{grid-template-columns:1fr}.cashbook-page.incoming{border-right:0;border-bottom:1px solid #cbd9cc}.cashbook-page{padding:20px}.cashbook-page strong{font-size:30px;margin-top:16px}.flow-track{margin-top:16px}.actions{flex-direction:column}.actions :deep(button){width:100%}.entry-value strong{flex-basis:100%}}
@media(prefers-reduced-motion:reduce){.bookkeeping :deep(*){animation:none!important;transition:none!important;scroll-behavior:auto!important}}
</style>
