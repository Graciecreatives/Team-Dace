<script setup>
import { computed, ref } from 'vue'
import { Plus, Download, Trash2, Wallet } from 'lucide-vue-next'
import { amountToCents, filterEntries, summarizeEntries, monthlySummary, exportEntriesCsv } from '../utils/bookkeeping.js'

const props = defineProps({ records: { type: Array, default: () => [] }, deleting: { type: String, default: '' } })
const emit = defineEmits(['add-entry', 'delete-entry'])
const month = ref('')
const search = ref('')
const category = ref('')
const exportMessage = ref('')
const periodEntries = computed(() => filterEntries(props.records, { month: month.value }))
const totals = computed(() => summarizeEntries(periodEntries.value))
const entries = computed(() => filterEntries(props.records, { month: month.value, search: search.value, category: category.value }))
const months = computed(() => monthlySummary(props.records))
const monthly = computed(() => monthlySummary(entries.value))
const money = cents => cents === null ? 'Invalid amount' : new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(cents / 100)
const monthLabel = value => new Date(`${value}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
function dateLabel(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
function exportCsv() {
  const url = URL.createObjectURL(new Blob(['\uFEFF', exportEntriesCsv(entries.value)], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `farm-bookkeeping-${month.value || 'all-time'}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  exportMessage.value = `CSV exported with ${entries.value.length} entries.`
}
</script>

<template>
  <section class="bookkeeping" aria-labelledby="bookkeeping-heading">
    <header class="book-header">
      <div><p class="eyebrow">YOUR FARM'S CASH RECORD</p><h2 id="bookkeeping-heading">A clearer view of your money.</h2><p>Track money received and spent, one farm record at a time.</p></div>
      <div class="actions"><button class="primary" @click="emit('add-entry', 'income')"><Plus :size="17" aria-hidden="true" /> Add income</button><button class="gold" @click="emit('add-entry', 'expense')"><Plus :size="17" aria-hidden="true" /> Add expense</button></div>
    </header>

    <div class="period"><label for="bookkeeping-period">Summary period</label><select id="bookkeeping-period" v-model="month"><option value="">All time</option><option v-for="item in months" :key="item.month" :value="item.month">{{ monthLabel(item.month) }}</option></select><span>Dates grouped in UTC</span></div>
    <div class="summary">
      <article><p>Income received</p><strong>{{ money(totals.incomeCents) }}</strong><span>{{ month ? monthLabel(month) : 'All recorded time' }}</span></article>
      <article><p>Expenses paid</p><strong>{{ money(totals.expenseCents) }}</strong><span>Recorded cash out</span></article>
      <article class="balance"><p><Wallet :size="16" aria-hidden="true" /> Net recorded cash</p><strong>{{ money(totals.netCents) }}</strong><span>Income minus expenses</span></article>
    </div>
    <p class="disclaimer">This is a cash summary of your recorded entries, not accounting profit or your bank balance. It excludes activity notes, unpaid amounts, and unrecorded transactions. All amounts are in NGN.</p>
    <p v-if="totals.invalidCount" role="status" class="warning">{{ totals.invalidCount }} entries have invalid amounts and are excluded from totals. Review these records before relying on the summary.</p>

    <section class="ledger" aria-labelledby="ledger-heading">
      <div class="ledger-title"><div><h3 id="ledger-heading">Cash ledger</h3><p>Search and export your income and expenses.</p></div><button :disabled="!entries.length" @click="exportCsv"><Download :size="16" aria-hidden="true" /> Export filtered CSV</button></div>
      <div class="filters"><label>Search title or note<input v-model="search" type="search" placeholder="e.g. feed or market" /></label><label>Entry category<select v-model="category"><option value="">Income & expenses</option><option value="income">Income</option><option value="expense">Expenses</option></select></label></div>
      <p class="count" role="status">{{ entries.length }} {{ entries.length === 1 ? 'entry' : 'entries' }} shown. Summary cards use the selected period, not the search or category filter.</p>
      <p v-if="exportMessage" role="status" class="count">{{ exportMessage }}</p>
      <div v-if="!entries.length" class="empty"><Wallet :size="30" aria-hidden="true" /><h4>{{ periodEntries.length ? 'No matching entries' : 'No cash entries yet for this period' }}</h4><p>{{ periodEntries.length ? 'Try a different search or category.' : 'Add income or an expense to start your cash record. Activity notes stay in farm records.' }}</p><button v-if="search || category || month" @click="search = ''; category = ''; month = ''">Clear filters</button></div>
      <ul v-else class="entries">
        <li v-for="entry in entries" :key="entry.id"><div class="entry-main"><span class="badge" :class="entry.category">{{ entry.category === 'income' ? 'Income' : 'Expense' }}</span><h4>{{ entry.title }}</h4><p v-if="entry.note" class="note">{{ entry.note }}</p><time :datetime="entry.createdAt">{{ dateLabel(entry.createdAt) }} (UTC)</time></div><div class="entry-value"><strong>{{ money(amountToCents(entry.amount)) }}</strong><span v-if="entry.sourceId" class="text-xs">Linked workflow entry</span><button v-else :disabled="Boolean(deleting)" :aria-label="`Delete ${entry.title}`" @click="emit('delete-entry', entry)"><Trash2 :size="16" aria-hidden="true" /><span>Delete</span></button></div></li>
      </ul>
    </section>
    <section v-if="monthly.length" class="monthly" aria-labelledby="monthly-heading"><h3 id="monthly-heading">Monthly breakdown</h3><p>Based on the filtered ledger above.</p><div class="table-scroll"><table><caption class="sr-only">Filtered monthly cash summary in NGN</caption><thead><tr><th scope="col">Month (UTC)</th><th scope="col">Income</th><th scope="col">Expenses</th><th scope="col">Net cash</th></tr></thead><tbody><tr v-for="item in monthly" :key="item.month"><th scope="row">{{ monthLabel(item.month) }}</th><td>{{ money(item.incomeCents) }}</td><td>{{ money(item.expenseCents) }}</td><td>{{ money(item.netCents) }}</td></tr></tbody></table></div></section>
  </section>
</template>

<style scoped>
.bookkeeping{min-width:0;max-width:100%;color:#263e32;display:grid;gap:1.25rem}.book-header,.ledger-title{display:flex;align-items:center;justify-content:space-between;gap:1.25rem}.eyebrow{font-size:.7rem;font-weight:800;letter-spacing:.15em;color:#62785e}h2{font-size:1.8rem;font-weight:750;line-height:1.2;margin:.5rem 0}h3{font-size:1.2rem;font-weight:750}h4{font-weight:700}.book-header p:not(.eyebrow),.ledger-title p,.monthly>p{color:#6b7769;font-size:.9rem;margin-top:.35rem}.actions{display:flex;gap:.6rem;flex-wrap:wrap}button{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;border:1px solid #d7dfd0;border-radius:.75rem;padding:.7rem 1rem;background:white;font-size:.85rem;font-weight:700;cursor:pointer}button:hover{background:#f0f4e9}button:disabled{opacity:.5;cursor:not-allowed}button.primary{background:#385b41;color:white;border-color:#385b41}button.gold{background:#e9cf83;border-color:#e9cf83;color:#4a3d1e}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #aa812f;outline-offset:3px}.period{display:flex;align-items:center;gap:.8rem;flex-wrap:wrap}.period label{font-weight:700;font-size:.85rem}.period span{font-size:.75rem;color:#6b7769}select,input{border:1px solid #d6dfce;background:white;border-radius:.65rem;padding:.7rem;color:#263e32;min-width:0}.summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.summary article{border:1px solid #dce3d4;border-radius:1.2rem;padding:1.3rem;background:#fff}.summary p{font-size:.85rem;display:flex;align-items:center;gap:.4rem}.summary strong{display:block;font-size:1.7rem;margin:.7rem 0;overflow-wrap:anywhere}.summary span{font-size:.75rem;color:#677661}.summary .balance{background:#eaf0df;border-color:#ccd8bd}.disclaimer,.warning{font-size:.8rem;line-height:1.6}.disclaimer{color:#6b7769}.warning{background:#fff1c9;padding:1rem;border-radius:.7rem}.ledger,.monthly{min-width:0;max-width:100%;background:#fff;border:1px solid #dce3d4;border-radius:1.2rem;padding:1.3rem}.filters{display:grid;grid-template-columns:2fr 1fr;gap:1rem;margin-top:1.3rem}.filters label{display:grid;gap:.4rem;font-size:.8rem;font-weight:700}.count{font-size:.75rem;color:#6b7769;margin:1rem 0}.entries{list-style:none;padding:0;margin:0}.entries li{display:flex;gap:1rem;justify-content:space-between;border-top:1px solid #edf0e7;padding:1.1rem 0}.entry-main{min-width:0}.entry-main h4{margin:.4rem 0;overflow-wrap:anywhere}.note{font-size:.85rem;color:#64715f;white-space:pre-wrap;overflow-wrap:anywhere}.entry-main time{font-size:.75rem;color:#6b7769}.badge{font-size:.65rem;font-weight:800;border-radius:1rem;padding:.2rem .55rem;background:#edf3e7;color:#365b3c;text-transform:uppercase}.badge.expense{background:#faf0d6;color:#76602b}.entry-value{display:flex;flex-direction:column;align-items:flex-end;gap:.7rem;flex-shrink:0}.entry-value button{font-size:.75rem;padding:.4rem .6rem;color:#835049}.empty{padding:2rem 1rem;text-align:center;color:#6b7769;display:grid;justify-items:center;gap:.7rem}.empty p{font-size:.85rem;max-width:28rem}.table-scroll{overflow-x:auto;max-width:100%;min-width:0}table{width:100%;border-collapse:collapse;margin-top:1rem;font-size:.85rem;white-space:nowrap}th,td{text-align:right;padding:.85rem;border-bottom:1px solid #edf0e7}th:first-child{text-align:left}thead{color:#66775e;font-size:.75rem}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}@media(max-width:760px){.book-header,.ledger-title{align-items:flex-start;flex-direction:column}.summary{grid-template-columns:1fr}.summary strong{font-size:1.6rem}.filters{grid-template-columns:1fr}.ledger,.monthly{padding:1rem}h2{font-size:1.5rem}.entry-value{max-width:45%;overflow-wrap:anywhere}.entry-value strong{text-align:right}.actions{width:100%}.actions button{flex:1}}
</style>
