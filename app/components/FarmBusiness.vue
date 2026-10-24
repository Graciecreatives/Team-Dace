<script setup>
import { computed, nextTick, reactive, ref } from 'vue'
const props = defineProps({ state: { type: Object, required: true }, busy: Boolean })
const emit = defineEmits(['command'])
const today = () => new Date().toLocaleDateString('en-CA')
const seasons = computed(() => props.state.planning?.seasons || [])
const stock = computed(() => props.state.inventory || [])
const business = computed(() => props.state.business)
const harvest = reactive({ seasonId: '', inventoryId: '', quantity: '', date: today(), note: '' })
const sale = reactive({ seasonId: '', inventoryId: '', quantity: '', unitPrice: '', customer: '', date: today(), productId: '' })
const expense = reactive({ seasonId: '', amount: '', title: '', date: today(), note: '' })
const delivery = reactive({})
const error = ref('')
const invoice = ref(null)
const format = minor => (minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function send(action, fields) {
  error.value = ''
  if (props.busy) return
  const payload = { action, ...fields }
  if (payload.productId === '') delete payload.productId
  for (const key of ['quantity', 'unitPrice', 'amount']) if (key in payload) {
    if (payload[key] === '' || !Number.isFinite(Number(payload[key])) || Number(payload[key]) <= 0) { error.value = 'Enter positive numeric quantities and amounts.'; return }
    payload[key] = Number(payload[key])
  }
  emit('command', payload)
}
async function print(row) {
  invoice.value = row
  await nextTick()
  window.print()
  invoice.value = null
}
</script>

<template>
  <section class="farm-business" aria-labelledby="business-title">
    <h2 id="business-title">Harvest, sales &amp; profit</h2>
    <p>Record physical harvests, confirm cash sales and track seasonal profit. No online payments are processed.</p>
    <p v-if="!business" role="status">Financial tools are available to farm owners and managers.</p>
    <template v-else>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <p v-if="!seasons.length || !stock.length">Create a season in Production and a stock item in Inventory before recording harvests or sales.</p>
      <div class="forms">
        <form @submit.prevent="send('harvest.create', harvest)">
          <h3>Add harvest to stock</h3>
          <label>Season<select v-model="harvest.seasonId" required><option disabled value="">Choose season</option><option v-for="s in seasons" :key="s.id" :value="s.id">{{ s.name }}</option></select></label>
          <label>Stock item<select v-model="harvest.inventoryId" required><option disabled value="">Choose stock</option><option v-for="s in stock" :key="s.id" :value="s.id">{{ s.name }} ({{ s.quantity }} {{ s.unit }})</option></select></label>
          <label>Harvest quantity<input v-model="harvest.quantity" required type="number" min="0.000001" step="0.000001"></label>
          <label>Harvest date<input v-model="harvest.date" required type="date"></label>
          <label>Harvest note<textarea v-model="harvest.note" maxlength="2000" /></label>
          <button :disabled="busy || !seasons.length || !stock.length">Record harvest</button>
        </form>
        <form @submit.prevent="send('orders.create', sale)">
          <h3>Draft a manual sale</h3>
          <label>Season<select v-model="sale.seasonId" required><option disabled value="">Choose season</option><option v-for="s in seasons" :key="s.id" :value="s.id">{{ s.name }}</option></select></label>
          <label>Stock item<select v-model="sale.inventoryId" required><option disabled value="">Choose stock</option><option v-for="s in stock" :key="s.id" :value="s.id">{{ s.name }} ({{ s.quantity }} {{ s.unit }})</option></select></label>
          <label>Optional storefront product<select v-model="sale.productId"><option value="">No storefront mapping</option><option v-for="p in state.products || []" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
          <p>This explicitly maps the selected product to this stock item for this order only. Legacy storefront quantities are not changed.</p>
          <label>Sale quantity<input v-model="sale.quantity" required type="number" min="0.000001" step="0.000001"></label>
          <label>Unit price (farm currency)<input v-model="sale.unitPrice" required type="number" min="0.01" step="0.01"></label>
          <label>Customer<input v-model="sale.customer" required maxlength="200"></label>
          <label>Sale date<input v-model="sale.date" required type="date"></label>
          <p>Drafts reserve no stock. Confirm only after receiving cash payment. Totals round half up to the nearest minor unit.</p>
          <button :disabled="busy || !seasons.length || !stock.length">Create draft</button>
        </form>
        <form @submit.prevent="send('expense.create', expense)">
          <h3>Season expense</h3>
          <label>Season<select v-model="expense.seasonId" required><option disabled value="">Choose season</option><option v-for="s in seasons" :key="s.id" :value="s.id">{{ s.name }}</option></select></label>
          <label>Expense title<input v-model="expense.title" required maxlength="200"></label>
          <label>Amount (farm currency)<input v-model="expense.amount" required type="number" min="0.01" step="0.01"></label>
          <label>Expense date<input v-model="expense.date" required type="date"></label>
          <label>Expense note<textarea v-model="expense.note" maxlength="2000" /></label>
          <button :disabled="busy || !seasons.length">Record expense</button>
        </form>
      </div>
      <section class="orders" aria-label="Sales orders">
        <h3>Sales orders</h3><p v-if="!business.orders.length">No orders yet.</p>
        <article v-for="row in business.orders" :key="row.id">
          <h4>{{ row.customer }} · {{ row.status }}</h4>
          <p>{{ row.itemName }}: {{ row.quantity }} {{ row.unit }} × {{ format(row.unitPriceMinor) }} = {{ format(row.amountMinor) }}</p>
          <p>{{ row.invoiceId }} · {{ row.date }}</p>
          <template v-if="row.status === 'draft'"><button :disabled="busy" @click="send('orders.confirm', { id: row.id })">Confirm cash received &amp; decrease stock</button><button class="secondary" :disabled="busy" @click="send('orders.cancel', { id: row.id })">Cancel draft</button></template>
          <template v-if="row.status === 'confirmed'">
            <button :disabled="busy" @click="print(row)">Print invoice</button>
            <p>Confirmed amounts cannot be edited or reversed here. Delivery: {{ row.delivery.status }}.</p>
            <form @submit.prevent="send('orders.deliver', { id: row.id, status: delivery[row.id]?.status || row.delivery.status, reference: delivery[row.id]?.reference ?? row.delivery.reference })">
              <label>Delivery status<select :value="delivery[row.id]?.status || row.delivery.status" @change="delivery[row.id] = { ...delivery[row.id], status: $event.target.value }"><option>pending</option><option>dispatched</option><option>delivered</option></select></label>
              <label>Delivery reference<input :value="delivery[row.id]?.reference ?? row.delivery.reference" maxlength="200" @input="delivery[row.id] = { ...delivery[row.id], reference: $event.target.value }"></label>
              <button :disabled="busy">Update delivery</button>
            </form>
          </template>
        </article>
      </section>
      <section aria-label="Profit reports"><h3>Season profit report</h3><p>Recorded income minus recorded expenses, in your bookkeeping currency. This is not a tax return.</p><div class="table-wrap"><table><thead><tr><th scope="col">Season</th><th scope="col">Income</th><th scope="col">Expenses</th><th scope="col">Profit</th></tr></thead><tbody><tr v-for="r in [...business.reports.seasons, business.reports.unallocated, { ...business.reports.overall, name: 'Overall', id: 'overall' }]" :key="r.id || 'unallocated'"><th scope="row">{{ r.name }}</th><td>{{ format(r.incomeMinor) }}</td><td>{{ format(r.expenseMinor) }}</td><td>{{ format(r.profitMinor) }}</td></tr></tbody></table></div></section>
    </template>
    <Teleport to="body"><section v-if="invoice" class="farm-invoice"><h1>Cash sale invoice</h1><p>{{ invoice.invoiceId }}</p><p>Date: {{ invoice.date }}</p><p>Customer: {{ invoice.customer }}</p><p>{{ invoice.itemName }} · {{ invoice.quantity }} {{ invoice.unit }} · Unit price {{ format(invoice.unitPriceMinor) }}</p><h2>Total paid: {{ format(invoice.amountMinor) }}</h2><p>Cash payment recorded. Not a tax invoice. Amounts in farm bookkeeping currency.</p></section></Teleport>
  </section>
</template>

<style scoped>
.farm-business{color:#183d29}.farm-business h2{font-size:1.5rem;font-weight:700}.farm-business h3{font-size:1.15rem;font-weight:700;margin-bottom:.75rem}.farm-business p{margin:.6rem 0}.forms{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem;margin:1.3rem 0}form,article{padding:1rem;border:1px solid #d4dfc9;border-radius:16px;background:#fbfcf6}label{display:grid;gap:.25rem;margin-bottom:.7rem;font-size:.9rem}input,select,textarea{width:100%;padding:.6rem;border:1px solid #a6b99d;border-radius:8px;background:white;color:#183d29}button{padding:.65rem 1rem;border-radius:9px;background:#285d35;color:white;font-weight:600;margin:.25rem .5rem .25rem 0}button:disabled{opacity:.5;cursor:not-allowed}.secondary{background:#f0d55e;color:#183d29}.orders article{margin:.8rem 0;overflow-wrap:anywhere}.error{color:#a22525}.table-wrap{overflow:auto}table{width:100%;text-align:left;border-collapse:collapse}td,th{padding:.7rem;border-bottom:1px solid #d4dfc9}.farm-business :focus-visible{outline:3px solid #b49100;outline-offset:2px}
</style>
<style>
.farm-invoice{display:none}@media print{body:has(>.farm-invoice)>*{display:none!important}body>.farm-invoice{display:block!important;color:#000;background:#fff;padding:2rem;font:16px sans-serif}.farm-invoice h1{font-size:26px}.farm-invoice p{margin:1rem 0}}
</style>
