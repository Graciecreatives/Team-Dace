<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import FbTabs from './ui/FbTabs.vue'
import FbButton from './ui/FbButton.vue'
import FbPageHeader from './ui/FbPageHeader.vue'
import FbDialog from './ui/FbDialog.vue'
import { Sprout, Package, Receipt, Banknote, Plus, Truck, Printer } from 'lucide-vue-next'
const props = defineProps({ state: { type: Object, required: true }, busy: Boolean, commandError: { type: String, default: '' } })
const emit = defineEmits(['command'])
const today = () => new Date().toLocaleDateString('en-CA')
const seasons = computed(() => props.state.planning?.seasons || [])
const stock = computed(() => props.state.inventory || [])
const business = computed(() => props.state.business)
const emptyHarvest = () => ({ seasonId: '', inventoryId: '', quantity: '', date: today(), note: '' })
const emptySale = () => ({ seasonId: '', inventoryId: '', quantity: '', unitPrice: '', customer: '', date: today(), productId: '' })
const emptyExpense = () => ({ seasonId: '', amount: '', title: '', date: today(), note: '' })
const harvest = reactive(emptyHarvest())
const sale = reactive(emptySale())
const expense = reactive(emptyExpense())
const delivery = reactive({})
const error = ref('')
const invoice = ref(null)
const activeTab = ref('harvest')
const editorOpen = ref(false)
const deliveryEditor = ref('')
function openEditor(tab) {
  if (props.busy) return
  activeTab.value = tab
  editorOpen.value = true
}
const harvests = computed(() => (props.state.planning?.events || []).filter(event => event.type === 'harvest'))
const tabs = [{ value: 'harvest', label: 'Harvest' }, { value: 'sale', label: 'Sales' }, { value: 'expense', label: 'Expenses' }]
const pending = new Map()
const snapshot = draft => JSON.stringify(draft)
watch(() => props.state.farm?.id, () => {
  pending.clear()
  Object.assign(harvest, emptyHarvest())
  Object.assign(sale, emptySale())
  Object.assign(expense, emptyExpense())
  for (const key of Object.keys(delivery)) delete delivery[key]
  error.value = ''
  invoice.value = null
  editorOpen.value = false
  deliveryEditor.value = ''
})
watch(() => props.state.lastCommandId, (id, previous) => {
  if (!id || id === previous) return
  const result = props.state.result
  const submitted = pending.get(result?.action)
  if (!submitted || id === submitted.receipt || (submitted.id && result.id !== submitted.id)) return
  pending.delete(result.action)
  if (snapshot(submitted.draft) === submitted.snapshot) {
    if (result.action === 'orders.deliver') {
      delete delivery[submitted.id]
      if (deliveryEditor.value === submitted.id) deliveryEditor.value = ''
    } else {
      Object.assign(submitted.draft, submitted.empty())
      const completedTab = { 'harvest.create': 'harvest', 'orders.create': 'sale', 'expense.create': 'expense' }[result.action]
      if (activeTab.value === completedTab) editorOpen.value = false
    }
  }
  error.value = ''
})
const format = minor => `NGN ${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
function send(action, fields) {
  error.value = ''
  if (props.busy) return
  const payload = { action, ...fields }
  if (payload.productId === '') delete payload.productId
  for (const key of ['quantity', 'unitPrice', 'amount']) if (key in payload) {
    if (payload[key] === '' || !Number.isFinite(Number(payload[key])) || Number(payload[key]) <= 0) { error.value = 'Enter positive numeric quantities and amounts.'; return }
    payload[key] = Number(payload[key])
  }
  const forms = { 'harvest.create': [harvest, emptyHarvest], 'orders.create': [sale, emptySale], 'expense.create': [expense, emptyExpense] }
  const form = forms[action]
  if (form) pending.set(action, { draft: form[0], empty: form[1], snapshot: snapshot(form[0]), receipt: props.state.lastCommandId })
  if (action === 'orders.deliver') {
    const id = fields.id
    pending.set(action, { id, get draft() { return delivery[id] }, snapshot: snapshot(delivery[id]), receipt: props.state.lastCommandId })
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
    <FbPageHeader id="business-title" title="From your farm to a cash sale" description="Follow the harvest, the stock and the money. No online payments are processed." />
    <p v-if="!business" role="status">Financial tools are available to farm owners and managers.</p>
    <template v-else>
      <p v-if="error || commandError" role="alert" class="error">{{ error || commandError }}</p>
      <p v-if="!seasons.length || !stock.length">Create a season in Production and a stock item in Inventory before recording harvests or sales.</p>
      <ol class="farm-flow" aria-label="Harvest to cash workflow">
        <li><span class="flow-icon"><Sprout aria-hidden="true" /></span><h3>Harvest</h3><p>{{ harvests.length }} recorded harvests</p><span>Record a harvest to add physical stock.</span><FbButton :disabled="busy" @click="openEditor('harvest')"><Plus :size="18" aria-hidden="true" />Record harvest</FbButton></li>
        <li><span class="flow-icon"><Package aria-hidden="true" /></span><h3>Stock on hand</h3><p>{{ stock.length }} stock items</p><span>Different units stay separate.</span><ul class="flow-stock"><li v-for="item in stock" :key="item.id"><span>{{ item.name }}</span><b>{{ item.quantity }} {{ item.unit }}</b></li></ul><p v-if="!stock.length">Add stock in Inventory to get started.</p></li>
        <li><span class="flow-icon"><Receipt aria-hidden="true" /></span><h3>Manual sale</h3><p>{{ business.orders.filter(order => order.status === 'draft').length }} drafts awaiting cash</p><span>A draft does not reserve or reduce stock.</span><FbButton :disabled="busy" @click="openEditor('sale')"><Plus :size="18" aria-hidden="true" />Draft sale</FbButton></li>
        <li><span class="flow-icon"><Banknote aria-hidden="true" /></span><h3>Cash recorded</h3><p>{{ format(business.reports.overall.incomeMinor) }}</p><span>Recorded income. Confirming a sale reduces stock once.</span><FbButton variant="secondary" :disabled="busy" @click="openEditor('expense')"><Plus :size="18" aria-hidden="true" />Record expense</FbButton></li>
      </ol>
      <FbDialog v-model:open="editorOpen" :busy="busy" :title="activeTab === 'harvest' ? 'Record a harvest' : activeTab === 'sale' ? 'Draft a cash sale' : 'Record a season expense'" description="Your draft stays here until its matching command succeeds. Closing this editor keeps your entered details.">
      <div class="forms">
      <p v-if="error || commandError" role="alert" class="error">{{ error || commandError }} Your entered details have been kept.</p>
      <FbTabs v-model="activeTab" :items="tabs" label="Business records">
        <template #harvest>
        <form @submit.prevent="send('harvest.create', harvest)">
          <h3>Add harvest to stock</h3>
          <label>Season<select v-model="harvest.seasonId" required><option disabled value="">Choose season</option><option v-for="s in seasons" :key="s.id" :value="s.id">{{ s.name }}</option></select></label>
          <label>Stock item<select v-model="harvest.inventoryId" required><option disabled value="">Choose stock</option><option v-for="s in stock" :key="s.id" :value="s.id">{{ s.name }} ({{ s.quantity }} {{ s.unit }})</option></select></label>
          <label>Harvest quantity<input v-model="harvest.quantity" required type="number" min="0.000001" step="0.000001"></label>
          <label>Harvest date<input v-model="harvest.date" required type="date"></label>
          <label>Harvest note<textarea v-model="harvest.note" maxlength="2000" /></label>
          <FbButton type="submit" :disabled="busy || !seasons.length || !stock.length">Record harvest</FbButton>
        </form>
        </template>
        <template #sale>
        <form @submit.prevent="send('orders.create', sale)">
          <h3>Draft a manual sale</h3>
          <label>Season<select v-model="sale.seasonId" required><option disabled value="">Choose season</option><option v-for="s in seasons" :key="s.id" :value="s.id">{{ s.name }}</option></select></label>
          <label>Stock item<select v-model="sale.inventoryId" required><option disabled value="">Choose stock</option><option v-for="s in stock" :key="s.id" :value="s.id">{{ s.name }} ({{ s.quantity }} {{ s.unit }})</option></select></label>
          <label>Optional storefront product (NGN only)<select v-model="sale.productId"><option value="">No storefront mapping</option><option v-for="p in (state.products || []).filter(product => product.currency === 'NGN')" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
          <p>This explicitly maps the selected product to this stock item for this order only. Legacy storefront quantities are not changed.</p>
          <label>Sale quantity<input v-model="sale.quantity" required type="number" min="0.000001" step="0.000001"></label>
          <label>Unit price (NGN)<input v-model="sale.unitPrice" required type="number" min="0.01" step="0.01"></label>
          <label>Customer<input v-model="sale.customer" required maxlength="200"></label>
          <label>Sale date<input v-model="sale.date" required type="date"></label>
          <p>Drafts reserve no stock. Confirm only after receiving cash payment. Totals round half up to the nearest minor unit.</p>
          <FbButton type="submit" :disabled="busy || !seasons.length || !stock.length">Create draft</FbButton>
        </form>
        </template>
        <template #expense>
        <form @submit.prevent="send('expense.create', expense)">
          <h3>Season expense</h3>
          <label>Season<select v-model="expense.seasonId" required><option disabled value="">Choose season</option><option v-for="s in seasons" :key="s.id" :value="s.id">{{ s.name }}</option></select></label>
          <label>Expense title<input v-model="expense.title" required maxlength="200"></label>
          <label>Amount (NGN)<input v-model="expense.amount" required type="number" min="0.01" step="0.01"></label>
          <label>Expense date<input v-model="expense.date" required type="date"></label>
          <label>Expense note<textarea v-model="expense.note" maxlength="2000" /></label>
          <FbButton type="submit" :disabled="busy || !seasons.length">Record expense</FbButton>
        </form>
        </template>
      </FbTabs>
      </div>
      </FbDialog>
      <section class="orders" aria-label="Sales orders">
        <div class="section-heading"><div><h3>Orders &amp; deliveries</h3><p>Cash confirmation and delivery are separate steps.</p></div><FbButton variant="secondary" :disabled="busy" @click="openEditor('sale')"><Plus :size="18" aria-hidden="true" />Draft sale</FbButton></div><p v-if="!business.orders.length" class="order-empty">No sales recorded yet. Draft a sale when you have a buyer, then confirm only after cash is received.</p>
        <div class="order-grid">
        <article v-for="row in business.orders" :key="row.id" class="order-card" :class="row.status">
          <header class="order-heading"><Receipt :size="24" aria-hidden="true" /><h4>{{ row.customer }}</h4><span class="order-status">{{ row.status }}</span></header>
          <p class="order-product">{{ row.itemName }} <strong>{{ row.quantity }} {{ row.unit }}</strong></p>
          <p class="order-total">{{ format(row.amountMinor) }}</p><p>{{ format(row.unitPriceMinor) }} per {{ row.unit }}</p>
          <p class="order-reference">{{ row.invoiceId }} · {{ row.date }}</p>
          <template v-if="row.status === 'draft'"><FbButton :disabled="busy" @click="send('orders.confirm', { id: row.id })">Confirm cash received &amp; decrease stock</FbButton><FbButton class="secondary" variant="secondary" :disabled="busy" @click="send('orders.cancel', { id: row.id })">Cancel draft</FbButton></template>
          <template v-if="row.status === 'confirmed'">
            <FbButton variant="secondary" :disabled="busy" @click="print(row)"><Printer :size="18" aria-hidden="true" />Print invoice</FbButton>
            <p>Confirmed amounts cannot be edited or reversed here. Delivery: {{ row.delivery.status }}.</p>
            <p v-if="row.delivery.reference" class="delivery-reference">{{ row.delivery.reference }}</p>
            <FbButton variant="secondary" :disabled="busy" :aria-expanded="deliveryEditor === row.id" @click="deliveryEditor = deliveryEditor === row.id ? '' : row.id"><Truck :size="18" aria-hidden="true" />{{ deliveryEditor === row.id ? 'Close delivery editor' : 'Edit delivery' }}</FbButton>
            <form v-if="deliveryEditor === row.id" class="delivery-editor" @submit.prevent="send('orders.deliver', { id: row.id, status: delivery[row.id]?.status || row.delivery.status, reference: delivery[row.id]?.reference ?? row.delivery.reference })">
              <label>Delivery status<select :value="delivery[row.id]?.status || row.delivery.status" @change="delivery[row.id] = { ...delivery[row.id], status: $event.target.value }"><option>pending</option><option>dispatched</option><option>delivered</option></select></label>
              <label>Delivery reference<input :value="delivery[row.id]?.reference ?? row.delivery.reference" maxlength="200" @input="delivery[row.id] = { ...delivery[row.id], reference: $event.target.value }"></label>
              <FbButton type="submit" :disabled="busy">Update delivery</FbButton>
            </form>
          </template>
        </article>
        </div>
      </section>
      <section aria-label="Profit reports"><h3>Season profit report</h3><p>Recorded income minus recorded expenses, in Nigerian naira (NGN). No currency conversion is performed. This is not a tax return.</p><div class="table-wrap"><table><thead><tr><th scope="col">Season</th><th scope="col">Income</th><th scope="col">Expenses</th><th scope="col">Profit</th></tr></thead><tbody><tr v-for="r in [...business.reports.seasons, business.reports.unallocated, { ...business.reports.overall, name: 'Overall', id: 'overall' }]" :key="r.id || 'unallocated'"><th scope="row">{{ r.name }}</th><td>{{ format(r.incomeMinor) }}</td><td>{{ format(r.expenseMinor) }}</td><td>{{ format(r.profitMinor) }}</td></tr></tbody></table></div></section>
    </template>
    <Teleport to="body"><section v-if="invoice" class="farm-invoice"><h1>Cash sale invoice (NGN)</h1><p>Seller: {{ invoice.sellerName || state.farm?.name }}</p><p>{{ invoice.invoiceId }}</p><p>Date: {{ invoice.date }}</p><p>Customer: {{ invoice.customer }}</p><p>{{ invoice.itemName }} · {{ invoice.quantity }} {{ invoice.unit }} · Unit price {{ format(invoice.unitPriceMinor) }}</p><h2>Total paid: {{ format(invoice.amountMinor) }}</h2><p>Cash payment recorded. Not a tax invoice. Amounts in Nigerian naira (NGN).</p></section></Teleport>
  </section>
</template>

<style scoped>
.farm-business{width:100%;min-width:0;color:#193d2b;font-family:'Plus Jakarta Sans',sans-serif}.farm-business h3{font-size:1.2rem;font-weight:750;margin-bottom:8px}.farm-business p{margin:10px 0;line-height:1.65}.farm-flow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));list-style:none;padding:28px 0;margin:12px 0 28px;gap:0}.farm-flow>li{position:relative;min-width:0;padding:0 24px 20px;border-bottom:3px solid #b6cb97;display:flex;flex-direction:column;align-items:flex-start;gap:8px}.farm-flow>li:first-child{padding-left:0}.farm-flow>li:last-child{border-color:#e9c84d;padding-right:0}.farm-flow>li:not(:last-child)::after{content:'→';position:absolute;right:-10px;top:20px;color:#456433;background:#f7faef;z-index:1;font-size:22px}.flow-icon{display:grid;place-items:center;width:64px;height:64px;border-radius:20px;background:#e5edcf;margin-bottom:12px}.farm-flow>li:last-child .flow-icon{background:#fff0b7}.farm-flow>li>p{font-weight:750;margin:0}.farm-flow>li>span:not(.flow-icon){font-size:.875rem;color:#52674f;line-height:1.6}.farm-flow :deep(button){margin-top:auto}.flow-stock{list-style:none;padding:0;width:100%;max-height:200px;overflow:auto;font-size:.875rem}.flow-stock li{padding:10px 0;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;border-bottom:1px solid #dce6d5}.section-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:24px;flex-wrap:wrap}.order-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:24px;margin-bottom:32px}.order-card{padding:24px;border:1px solid #dce6d5;border-radius:24px;background:white;min-width:0;overflow-wrap:anywhere;border-top:5px solid #e9c84d}.order-card.confirmed{border-top-color:#6f9950}.order-card.cancelled{border-top-color:#c8d1c2}.order-heading{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.order-heading h4{font-size:1.1rem;font-weight:750;flex:1}.order-status{padding:6px 12px;border-radius:100px;background:#f0f4e9;font-size:.8rem;font-weight:700}.order-product{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.order-card .order-total{font-size:1.8rem;font-weight:750;letter-spacing:-.04em;margin-bottom:0}.order-reference{font-size:.8rem;color:#52674f;border-bottom:1px solid #dce6d5;padding-bottom:16px}.order-empty{padding:32px;background:#f5f8ee;border-radius:24px}.forms{margin-top:20px;color:#193d2b;font-family:'Plus Jakarta Sans',sans-serif}.forms h3{font-size:1.2rem;font-weight:750;margin:16px 0}.forms form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.forms form>h3,.forms form>p,.forms form>button{grid-column:1/-1}.forms form>p{line-height:1.6;font-size:.875rem;color:#52674f}.forms label,.delivery-editor label{display:grid;gap:8px;min-width:0;font-size:.875rem;font-weight:600}input,select,textarea{width:100%;min-width:0;min-height:48px;padding:12px;border:1px solid #a6b99d;border-radius:12px;background:white;color:#193d2b}textarea{min-height:100px}.delivery-editor{padding:20px;margin-top:16px;background:#f5f8ee;border-radius:16px;display:grid;gap:16px}.farm-business :deep(button),.forms :deep(button){min-height:44px;display:inline-flex;justify-content:center;align-items:center;gap:8px;white-space:normal;max-width:100%;margin-top:8px}.farm-business :deep(:focus-visible),.forms :deep(:focus-visible){outline:3px solid #9b7900;outline-offset:3px}.error{color:#a22525}.table-wrap{overflow:auto;border:1px solid #dce6d5;border-radius:20px;margin-top:20px}table{width:100%;text-align:left;border-collapse:collapse;background:white;font-size:.875rem}td,th{padding:16px;border-bottom:1px solid #dce6d5;white-space:nowrap}thead{background:#f0f4e9}@media(max-width:1100px){.farm-flow{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:28px}.farm-flow>li:nth-child(3){padding-left:0}.farm-flow>li:nth-child(2)::after{display:none}}@media(max-width:600px){.farm-flow{grid-template-columns:1fr;gap:0;padding:16px 0}.farm-flow>li,.farm-flow>li:first-child,.farm-flow>li:last-child,.farm-flow>li:nth-child(3){padding:20px 0 24px 24px;border-bottom:0;border-left:3px solid #b6cb97}.farm-flow>li:not(:last-child)::after{content:'↓';left:-11px;right:auto;top:auto;bottom:-10px}.farm-flow>li:nth-child(2)::after{display:block}.forms form{grid-template-columns:1fr}.order-card{padding:20px}}@media(prefers-reduced-motion:reduce){.farm-business :deep(*),.forms :deep(*){animation:none!important;transition:none!important}}
</style>
<style>
.farm-invoice{display:none}@media print{body:has(>.farm-invoice)>*{display:none!important}body>.farm-invoice{display:block!important;color:#000;background:#fff;padding:2rem;font:16px sans-serif}.farm-invoice h1{font-size:26px}.farm-invoice p{margin:1rem 0}}
</style>
