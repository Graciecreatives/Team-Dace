<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { newCommandId } from '../utils/offline-workspace.js'
import FbButton from './ui/FbButton.vue'
import FbPageHeader from './ui/FbPageHeader.vue'
import { Sprout, Package, Receipt, Banknote, Plus, Truck, Printer } from 'lucide-vue-next'
const props = defineProps({ state: { type: Object, required: true }, busy: Boolean, commandError: { type: String, default: '' } })
const emit = defineEmits(['command'])
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
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
const editorRegion = ref(null)
const editorTrigger = ref(null)
const detailsOpen = reactive({ harvest: false, sale: false, expense: false })
const activeDraft = computed(() => ({ harvest, sale, expense })[activeTab.value])
const choicesReady = computed(() => (activeTab.value === 'sale' || seasons.value.some(row => row.id === activeDraft.value.seasonId)) && (activeTab.value === 'expense' || stock.value.some(row => row.id === activeDraft.value.inventoryId)))
const selectedStock = computed(() => stock.value.find(row => row.id === sale.inventoryId))
const saleTotal = computed(() => {
  const q = String(Number(sale.quantity)), price = String(Number(sale.unitPrice))
  if (!/^\d+(?:\.\d{1,6})?$/.test(q) || !/^\d+(?:\.\d{1,2})?$/.test(price) || Number(q) <= 0 || Number(q) > 1e9 || Number(price) <= 0 || Number(price) > 1e9) return null
  const [whole, fraction = ''] = q.split('.')
  const [priceWhole, priceFraction = ''] = price.split('.')
  const minor = BigInt(priceWhole) * 100n + BigInt(priceFraction.padEnd(2, '0'))
  const scale = 10n ** BigInt(fraction.length)
  const total = (BigInt(whole + fraction) * minor + scale / 2n) / scale
  return total > 0n && total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null
})
const saleReady = computed(() => saleTotal.value !== null && seasons.value.some(row => row.id === sale.seasonId) && selectedStock.value && Number(sale.quantity) <= selectedStock.value.quantity)
function stepQuantity(change) { sale.quantity = String(Math.max(0, Math.round(((Number(sale.quantity) || 0) + change) * 1e6) / 1e6)) }
function autoSeason() { if (seasons.value.length === 1) for (const draft of [harvest, sale, expense]) draft.seasonId = seasons.value[0].id }
watch(seasons, autoSeason, { immediate: true })
async function continueEditor() {
  if (props.busy || !choicesReady.value) return
  detailsOpen[activeTab.value] = true
  await nextTick()
  editorRegion.value?.querySelector('input')?.focus()
}
async function backToChoices() {
  if (props.busy) return
  detailsOpen[activeTab.value] = false
  await nextTick()
  const target = editorRegion.value?.querySelector('.choice-grid button[aria-pressed="true"]') || editorRegion.value
  target?.focus()
}
async function closeEditor() {
  if (props.busy) return
  editorOpen.value = false
  await nextTick()
  editorTrigger.value?.focus()
}
const deliveryEditor = ref('')
async function openEditor(tab, trigger) {
  if (props.busy) return
  if (trigger) editorTrigger.value = trigger.currentTarget || null
  activeTab.value = tab
  autoSeason()
  if (tab === 'expense' && seasons.value.length === 1) detailsOpen.expense = true
  editorOpen.value = true
  await nextTick()
  editorRegion.value?.focus()
}
const tabs = [{ value: 'harvest', label: 'Harvest' }, { value: 'sale', label: 'Sales' }, { value: 'expense', label: 'Expenses' }]
const pending = new Map()
const snapshot = draft => JSON.stringify(draft)
watch(() => props.state.farm?.id, () => {
  pending.clear()
  Object.assign(harvest, emptyHarvest())
  Object.assign(sale, emptySale())
  Object.assign(expense, emptyExpense())
  for (const key of Object.keys(delivery)) delete delivery[key]
  Object.assign(detailsOpen, { harvest: false, sale: false, expense: false })
  error.value = ''
  invoice.value = null
  editorOpen.value = false
  editorTrigger.value = null
  deliveryEditor.value = ''
})
watch(() => props.state.lastCommandId, (id, previous) => {
  if (!id || id === previous) return
  const result = props.state.result
  const submitted = pending.get(result?.action)
  if (!submitted || id === submitted.receipt || (submitted.commandId && id !== submitted.commandId) || (submitted.id && result.id !== submitted.id)) return
  pending.delete(result.action)
  if (snapshot(submitted.draft) === submitted.snapshot) {
    if (result.action === 'orders.deliver') {
      delete delivery[submitted.id]
      if (deliveryEditor.value === submitted.id) deliveryEditor.value = ''
    } else {
      Object.assign(submitted.draft, submitted.empty())
      const completedTab = { 'harvest.create': 'harvest', 'orders.create': 'sale', 'orders.record': 'sale', 'expense.create': 'expense' }[result.action]
      detailsOpen[completedTab] = false
      if (activeTab.value === completedTab) {
        editorOpen.value = false
        nextTick(() => editorTrigger.value?.focus())
      }
    }
  }
  error.value = ''
})
const format = minor => `NGN ${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
function send(action, fields) {
  error.value = ''
  if (props.busy) return
  const payload = { action, ...fields }
  if (action === 'orders.record') {
    if (!saleReady.value) { error.value = 'Check quantity, price, available stock and season.'; return }
    payload.customer = payload.customer.trim() || 'Walk-in customer'
    payload.commandId = newCommandId(globalThis.crypto)
  }
  if (action === 'orders.create') payload.customer = payload.customer.trim() || 'Walk-in customer'
  if (payload.productId === '') delete payload.productId
  for (const key of ['quantity', 'unitPrice', 'amount']) if (key in payload) {
    if (payload[key] === '' || !Number.isFinite(Number(payload[key])) || Number(payload[key]) <= 0) { error.value = 'Enter positive numeric quantities and amounts.'; return }
    payload[key] = Number(payload[key])
  }
  const forms = { 'harvest.create': [harvest, emptyHarvest], 'orders.create': [sale, emptySale], 'orders.record': [sale, emptySale], 'expense.create': [expense, emptyExpense] }
  const form = forms[action]
  if (form) pending.set(action, { draft: form[0], empty: form[1], snapshot: snapshot(form[0]), receipt: props.state.lastCommandId, commandId: payload.commandId })
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
    <FbPageHeader id="business-title" title="Your farm business" description="Record what comes in and what goes out." />
    <p v-if="!business" role="status">Financial tools are available to farm owners and managers.</p>
    <template v-else>
      <p v-if="error || commandError" role="alert" class="error">{{ error || commandError }}</p>
      <p v-if="!seasons.length || !stock.length">Create a season in Production and a stock item in Inventory before recording harvests or sales.</p>
      <div class="business-stats"><span><strong>{{ format(business.reports.overall.incomeMinor) }}</strong> recorded income</span><span><strong>{{ stock.length }}</strong> stock items</span><span><strong>{{ business.orders.filter(order => order.status === 'draft').length }}</strong> unpaid orders</span></div>
      <div class="action-tiles" aria-label="Business actions"><button type="button" :disabled="busy" @click="openEditor('sale', $event)"><Receipt aria-hidden="true" /><strong>Record sale</strong><span>Payment already received</span></button><button type="button" :disabled="busy" @click="openEditor('harvest', $event)"><Sprout aria-hidden="true" /><strong>Record harvest</strong><span>Add to stock</span></button><button type="button" :disabled="busy" @click="openEditor('expense', $event)"><Banknote aria-hidden="true" /><strong>Record expense</strong><span>Track money spent</span></button></div>
      <Transition name="editor"><section v-if="editorOpen" ref="editorRegion" class="inline-editor" tabindex="-1" aria-label="Business record editor"><header class="section-heading"><h3>{{ activeTab === 'harvest' ? 'Record a harvest' : activeTab === 'sale' ? 'Record a sale' : 'Record a season expense' }}</h3><FbButton variant="secondary" :disabled="busy" @click="closeEditor">Close, keep draft</FbButton></header><p v-if="activeTab === 'sale'" class="step-label">{{ detailsOpen.sale ? '2 · Sale details' : '1 · Choose product' }}</p>
      <fieldset :disabled="busy" class="editor-fields"><legend class="sr-only">Business record</legend><div class="record-choices" role="group" aria-label="Business record type"><button v-for="item in tabs" :key="item.value" type="button" :aria-pressed="activeTab === item.value" @click="openEditor(item.value)">{{ item.label }}</button></div>
      <div v-if="!detailsOpen[activeTab]" class="record-picker"><h4 v-if="activeTab !== 'sale' && seasons.length !== 1">Which season?</h4><div v-if="activeTab !== 'sale' && seasons.length !== 1 && seasons.length <= 6" class="choice-grid" role="group" aria-label="Choose season"><button v-for="s in seasons" :key="s.id" type="button" :aria-pressed="activeDraft.seasonId === s.id" @click="activeDraft.seasonId = s.id"><Sprout aria-hidden="true" :size="20" /><strong>{{ s.name }}</strong><span>{{ s.kind === 'livestock' ? 'Animal group' : 'Crop cycle' }}</span></button></div><label v-else-if="activeTab !== 'sale' && seasons.length > 6">Season<select v-model="activeDraft.seasonId"><option disabled value="">Choose season</option><option v-for="s in seasons" :key="s.id" :value="s.id">{{ s.name }}</option></select></label>
      <template v-if="activeTab !== 'expense' && (activeTab === 'sale' || activeDraft.seasonId)"><h4>{{ activeTab === 'harvest' ? 'Where will the harvest go?' : 'What are you selling?' }}</h4><div v-if="activeTab === 'sale' || stock.length <= 6" class="choice-grid" role="group" aria-label="Choose stock"><button v-for="s in stock" :key="s.id" type="button" :aria-pressed="activeDraft.inventoryId === s.id" @click="activeDraft.inventoryId = s.id"><Package aria-hidden="true" :size="20" /><strong>{{ s.name }}</strong><span>{{ s.quantity }} {{ s.unit }} on hand</span></button></div><label v-else>Stock item<select v-model="activeDraft.inventoryId"><option disabled value="">Choose stock</option><option v-for="s in stock" :key="s.id" :value="s.id">{{ s.name }} ({{ s.quantity }} {{ s.unit }})</option></select></label></template>
      <FbButton :disabled="busy || !choicesReady" @click="continueEditor">Continue to {{ activeTab === 'sale' ? 'sale details' : activeTab === 'expense' ? 'expense details' : 'quantity and date' }}</FbButton></div><div v-else><FbButton variant="secondary" :disabled="busy" @click="backToChoices">{{ activeTab === 'sale' ? 'Back to products' : 'Back to choices' }}</FbButton><p class="chosen-context">{{ seasons.find(s => s.id === activeDraft.seasonId)?.name }}<template v-if="activeTab !== 'expense'"> / {{ stock.find(s => s.id === activeDraft.inventoryId)?.name }}</template></p>
      <div class="forms">
      <p v-if="error || commandError" role="alert" class="error">{{ error || commandError }} Your entered details have been kept.</p>
      <template v-if="activeTab === 'harvest'">
        <form @submit.prevent="send('harvest.create', harvest)">
          <h3>Add harvest to stock</h3>
          <label>Harvest quantity<input v-model="harvest.quantity" required type="number" min="0.000001" step="0.000001"></label>
          <details><summary>Date and note (optional)</summary><label>Harvest date<input v-model="harvest.date" required type="date"></label><label>Harvest note<textarea v-model="harvest.note" maxlength="2000" /></label></details>
          <FbButton type="submit" :disabled="busy || !seasons.length || !stock.length">Record harvest</FbButton>
        </form>
        </template>
        <template v-if="activeTab === 'sale'">
        <form @submit.prevent="send('orders.record', sale)">
          <h3>How much did you sell?</h3>
          <div v-if="seasons.length !== 1" class="sale-season"><span>Season</span><div class="record-choices" role="group" aria-label="Sale season"><button v-for="s in seasons" :key="s.id" type="button" :aria-pressed="sale.seasonId === s.id" @click="sale.seasonId = s.id">{{ s.name }}</button></div></div>
          <label>Sale quantity<div class="quantity-stepper"><button type="button" aria-label="Decrease sale quantity" @click="stepQuantity(-1)">−</button><input v-model="sale.quantity" required type="number" min="0.000001" step="0.000001" inputmode="decimal"><button type="button" aria-label="Increase sale quantity" @click="stepQuantity(1)">+</button></div></label>
          <label>Unit price (NGN)<input v-model="sale.unitPrice" required type="number" min="0.01" step="0.01" inputmode="decimal"></label>
          <details><summary>Buyer and date (optional)</summary><label>Customer<input v-model="sale.customer" placeholder="Walk-in customer" maxlength="200"></label><label>Sale date<input v-model="sale.date" required type="date"></label></details>
          <details v-if="(state.products || []).some(product => product.currency === 'NGN')"><summary>Link storefront product (optional)</summary><label>Storefront product<select v-model="sale.productId"><option value="">No storefront mapping</option><option v-for="p in (state.products || []).filter(product => product.currency === 'NGN')" :key="p.id" :value="p.id">{{ p.name }}</option></select></label></details>
          <div class="sale-review" aria-live="polite"><span>Total paid</span><strong>{{ saleTotal === null ? 'Enter quantity and price' : format(saleTotal) }}</strong><p v-if="selectedStock && Number(sale.quantity) > 0">Stock: {{ selectedStock.quantity }} → {{ Math.round((selectedStock.quantity - Number(sale.quantity)) * 1e6) / 1e6 }} {{ selectedStock.unit }}</p><p v-if="selectedStock && Number(sale.quantity) > selectedStock.quantity" class="error">Not enough stock for this sale.</p></div>
          <p>Record payment you already received. No online charge.</p>
          <FbButton type="submit" :disabled="busy || !saleReady">{{ busy ? 'Recording…' : 'Record paid sale' }}</FbButton>
          <FbButton type="button" variant="secondary" :disabled="busy || saleTotal === null || !sale.seasonId" @click="send('orders.create', sale)">Save unpaid order</FbButton>
        </form>
        </template>
        <template v-if="activeTab === 'expense'">
        <form @submit.prevent="send('expense.create', expense)">
          <h3>Season expense</h3>
          <label>Expense title<input v-model="expense.title" required maxlength="200"></label>
          <label>Amount (NGN)<input v-model="expense.amount" required type="number" min="0.01" step="0.01"></label>
          <details><summary>Date and note (optional)</summary><label>Expense date<input v-model="expense.date" required type="date"></label><label>Expense note<textarea v-model="expense.note" maxlength="2000" /></label></details>
          <FbButton type="submit" :disabled="busy || !seasons.length">Record expense</FbButton>
        </form>
        </template>
      </div>
      </div></fieldset></section></Transition>
      <section class="orders" aria-label="Sales orders">
        <div class="section-heading"><div><h3>Orders &amp; deliveries</h3><p>Cash confirmation and delivery are separate steps.</p></div><FbButton variant="secondary" :disabled="busy" @click="openEditor('sale', $event)"><Plus :size="18" aria-hidden="true" />Record sale</FbButton></div><p v-if="!business.orders.length" class="order-empty">No sales yet. Record a sale when payment is received.</p>
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
              <fieldset :disabled="busy"><legend>Delivery details</legend><span>Delivery status</span><div class="record-choices" role="group" aria-label="Delivery status"><button v-for="status in ['pending', 'dispatched', 'delivered']" :key="status" type="button" :aria-pressed="(delivery[row.id]?.status || row.delivery.status) === status" @click="delivery[row.id] = { ...delivery[row.id], status }">{{ status }}</button></div>
              <label>Delivery reference<input :value="delivery[row.id]?.reference ?? row.delivery.reference" maxlength="200" @input="delivery[row.id] = { ...delivery[row.id], reference: $event.target.value }"></label>
              <FbButton type="submit" :disabled="busy">Update delivery</FbButton></fieldset>
            </form>
          </template>
        </article>
        </div>
      </section>
      <section aria-label="Profit reports"><h3>Season profit report</h3><p>Recorded income minus expenses, in Nigerian naira (NGN).</p><div class="table-wrap"><table><thead><tr><th scope="col">Season</th><th scope="col">Income</th><th scope="col">Expenses</th><th scope="col">Profit</th></tr></thead><tbody><tr v-for="r in [...business.reports.seasons, business.reports.unallocated, { ...business.reports.overall, name: 'Overall', id: 'overall' }]" :key="r.id || 'unallocated'"><th scope="row">{{ r.name }}</th><td>{{ format(r.incomeMinor) }}</td><td>{{ format(r.expenseMinor) }}</td><td>{{ format(r.profitMinor) }}</td></tr></tbody></table></div></section>
    </template>
    <Teleport to="body"><section v-if="invoice" class="farm-invoice"><h1>Cash sale invoice (NGN)</h1><p>Seller: {{ invoice.sellerName || state.farm?.name }}</p><p>{{ invoice.invoiceId }}</p><p>Date: {{ invoice.date }}</p><p>Customer: {{ invoice.customer }}</p><p>{{ invoice.itemName }} · {{ invoice.quantity }} {{ invoice.unit }} · Unit price {{ format(invoice.unitPriceMinor) }}</p><h2>Total paid: {{ format(invoice.amountMinor) }}</h2><p>Cash payment recorded. Not a tax invoice. Amounts in Nigerian naira (NGN).</p></section></Teleport>
  </section>
</template>

<style scoped>
.sale-season{grid-column:1/-1}.sale-season>.record-choices{margin:4px 0 0}.forms details>label{margin:10px 0}.farm-business button:disabled{cursor:not-allowed;opacity:.6}@media(prefers-reduced-motion:reduce){.farm-business .action-tiles button:hover:not(:disabled),.farm-business button:active:not(:disabled){transform:none!important}}
.business-stats{display:flex;flex-wrap:wrap;gap:12px 28px;margin:20px 0;color:#52674f;font-size:.85rem}.business-stats strong{color:#193d2b}.action-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0 28px}.farm-business .action-tiles button{display:grid;justify-content:start;text-align:left;gap:10px;border:1px solid #c9d9b8;border-radius:22px;background:#eef4df;color:#193d2b;padding:22px;font:inherit;cursor:pointer}.farm-business .action-tiles button:first-child{background:#066136;color:white;border-color:#066136}.action-tiles strong{font-size:1.1rem}.action-tiles span{font-size:.8rem}.farm-business .action-tiles button:hover:not(:disabled){transform:translateY(-2px)}.quantity-stepper{display:grid;grid-template-columns:48px minmax(0,1fr) 48px;gap:8px}.farm-business .quantity-stepper button{margin:0;border:1px solid #a6b99d;border-radius:12px;background:#eef4df;color:#193d2b;font-size:1.4rem;cursor:pointer}.sale-review{grid-column:1/-1;padding:20px;border-radius:18px;background:#fff4bd;display:grid;gap:8px}.sale-review>strong{font-size:1.65rem}.sale-review p{margin:0}.step-label{font-size:.8rem;font-weight:700;color:#52674f}.inline-editor{max-width:840px}.choice-grid{max-height:380px;overflow:auto;padding:4px}.farm-business .record-picker .choice-grid button{min-height:108px}.forms form>label:has(select){grid-column:1/-1}@media(max-width:600px){.action-tiles{grid-template-columns:1fr}.farm-business .action-tiles button{grid-template-columns:28px 1fr;padding:16px;gap:4px 12px}.action-tiles svg{grid-row:1/3}.action-tiles span{grid-column:2}.business-stats{gap:10px 16px}}
.inline-editor{margin:24px 0;padding:clamp(14px,3vw,28px);border:2px solid #b6cb97;border-left:5px solid #066136;border-radius:18px;background:#fff;min-width:0;scroll-margin-top:24px}.editor-fields{border:0;padding:0;margin:0;min-width:0}.record-picker{display:grid;gap:16px}.record-choices{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px}.farm-business .record-choices button,.farm-business .choice-grid button{min-height:44px;padding:12px 16px;border:2px solid #dce6d5;border-radius:12px;background:#f5f6f0;color:#193d2b;font:inherit;text-align:left;cursor:pointer;overflow-wrap:anywhere}.choice-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:10px}.farm-business .choice-grid button{display:grid;gap:6px;align-content:start}.choice-grid span{font-size:.85rem}.farm-business button[aria-pressed=true]{border-color:#066136;background:#e5edcf;box-shadow:inset 4px 0 #066136}.chosen-context{padding:12px;background:#e5edcf;border-radius:10px}.inline-editor:focus-visible,.farm-business button:focus-visible,.farm-business summary:focus-visible{outline:3px solid #b48000;outline-offset:3px}.farm-business summary{cursor:pointer;padding:12px 0;min-height:44px}.farm-business button{transition:background-color 160ms ease-out,transform 160ms ease-out}.farm-business button:active:not(:disabled){transform:scale(.98)}.editor-enter-active,.editor-leave-active{transition:opacity 200ms ease-out,transform 200ms ease-out}.editor-enter-from,.editor-leave-to{opacity:0;transform:translateY(-6px)}.editor-leave-active{pointer-events:none}.inline-editor *{box-sizing:border-box}.farm-business :deep(button){white-space:normal}.farm-business input,.farm-business select,.farm-business textarea{max-width:100%}@media(prefers-reduced-motion:reduce){.farm-business *{transition:none!important;animation:none!important}}
.farm-business{width:100%;min-width:0;color:#193d2b;font-family:'Plus Jakarta Sans',sans-serif}.farm-business h3{font-size:1.2rem;font-weight:750;margin-bottom:8px}.farm-business p{margin:10px 0;line-height:1.65}.farm-flow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));list-style:none;padding:28px 0;margin:12px 0 28px;gap:0}.farm-flow>li{position:relative;min-width:0;padding:0 24px 20px;border-bottom:3px solid #b6cb97;display:flex;flex-direction:column;align-items:flex-start;gap:8px}.farm-flow>li:first-child{padding-left:0}.farm-flow>li:last-child{border-color:#e9c84d;padding-right:0}.farm-flow>li:not(:last-child)::after{content:'→';position:absolute;right:-10px;top:20px;color:#456433;background:#f7faef;z-index:1;font-size:22px}.flow-icon{display:grid;place-items:center;width:64px;height:64px;border-radius:20px;background:#e5edcf;margin-bottom:12px}.farm-flow>li:last-child .flow-icon{background:#fff0b7}.farm-flow>li>p{font-weight:750;margin:0}.farm-flow>li>span:not(.flow-icon){font-size:.875rem;color:#52674f;line-height:1.6}.farm-flow :deep(button){margin-top:auto}.flow-stock{list-style:none;padding:0;width:100%;max-height:200px;overflow:auto;font-size:.875rem}.flow-stock li{padding:10px 0;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;border-bottom:1px solid #dce6d5}.section-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:24px;flex-wrap:wrap}.order-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:24px;margin-bottom:32px}.order-card{padding:24px;border:1px solid #dce6d5;border-radius:24px;background:white;min-width:0;overflow-wrap:anywhere;border-top:5px solid #e9c84d}.order-card.confirmed{border-top-color:#6f9950}.order-card.cancelled{border-top-color:#c8d1c2}.order-heading{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.order-heading h4{font-size:1.1rem;font-weight:750;flex:1}.order-status{padding:6px 12px;border-radius:100px;background:#f0f4e9;font-size:.8rem;font-weight:700}.order-product{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.order-card .order-total{font-size:1.8rem;font-weight:750;letter-spacing:-.04em;margin-bottom:0}.order-reference{font-size:.8rem;color:#52674f;border-bottom:1px solid #dce6d5;padding-bottom:16px}.order-empty{padding:32px;background:#f5f8ee;border-radius:24px}.forms{margin-top:20px;color:#193d2b;font-family:'Plus Jakarta Sans',sans-serif}.forms h3{font-size:1.2rem;font-weight:750;margin:16px 0}.forms form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.forms form>h3,.forms form>p,.forms form>button,.forms form>details{grid-column:1/-1}.forms form>p{line-height:1.6;font-size:.875rem;color:#52674f}.forms label,.delivery-editor label{display:grid;gap:8px;min-width:0;font-size:.875rem;font-weight:600}input,select,textarea{width:100%;min-width:0;min-height:48px;padding:12px;border:1px solid #a6b99d;border-radius:12px;background:white;color:#193d2b}textarea{min-height:100px}.delivery-editor{padding:20px;margin-top:16px;background:#f5f8ee;border-radius:16px;display:grid;gap:16px}.farm-business :deep(button),.forms :deep(button){min-height:44px;display:inline-flex;justify-content:center;align-items:center;gap:8px;white-space:normal;max-width:100%;margin-top:8px}.farm-business :deep(:focus-visible),.forms :deep(:focus-visible){outline:3px solid #9b7900;outline-offset:3px}.error{color:#a22525}.table-wrap{overflow:auto;border:1px solid #dce6d5;border-radius:20px;margin-top:20px}table{width:100%;text-align:left;border-collapse:collapse;background:white;font-size:.875rem}td,th{padding:16px;border-bottom:1px solid #dce6d5;white-space:nowrap}thead{background:#f0f4e9}@media(max-width:1100px){.farm-flow{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:28px}.farm-flow>li:nth-child(3){padding-left:0}.farm-flow>li:nth-child(2)::after{display:none}}@media(max-width:600px){.farm-flow{grid-template-columns:1fr;gap:0;padding:16px 0}.farm-flow>li,.farm-flow>li:first-child,.farm-flow>li:last-child,.farm-flow>li:nth-child(3){padding:20px 0 24px 24px;border-bottom:0;border-left:3px solid #b6cb97}.farm-flow>li:not(:last-child)::after{content:'↓';left:-11px;right:auto;top:auto;bottom:-10px}.farm-flow>li:nth-child(2)::after{display:block}.forms form{grid-template-columns:1fr}.order-card{padding:20px}}@media(prefers-reduced-motion:reduce){.farm-business :deep(*),.forms :deep(*){animation:none!important;transition:none!important}}
</style>
<style>
.farm-invoice{display:none}@media print{body:has(>.farm-invoice)>*{display:none!important}body>.farm-invoice{display:block!important;color:#000;background:#fff;padding:2rem;font:16px sans-serif}.farm-invoice h1{font-size:26px}.farm-invoice p{margin:1rem 0}}
</style>
