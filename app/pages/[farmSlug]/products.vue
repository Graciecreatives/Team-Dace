<script setup>
import { enquiryBasket, enquiryText } from '../../utils/marketplace-cart.js'
import { setResponseStatus } from 'h3'
const route = useRoute()
const slug = computed(() => String(route.params.farmSlug || ''))
const { data, error, status, refresh } = await useFetch(() => `/api/storefront/${encodeURIComponent(slug.value)}`, { watch: [slug] })
useHead(() => ({ title: data.value?.farm?.name ? `${data.value.farm.name} | Farm products` : 'Farm storefront', meta: [{ name: 'referrer', content: 'no-referrer' }] }))
const imagesEnabled = ref(false)
const quantities = reactive({})
const basket = computed(() => enquiryBasket(data.value?.products || [], quantities))
const orderText = computed(() => enquiryText(data.value?.farm || {}, basket.value))
const basketFeedback = ref('')
const hasItems = computed(() => Object.keys(quantities).length > 0)
function add(product) {
  if (product.quantity <= 0) return
  quantities[product.id] = Math.min(product.quantity, Number(quantities[product.id] || 0) + 1)
  basketFeedback.value = 'Added to your enquiry basket. No order has been placed.'
}
async function copyOrder() {
  if (!orderText.value) return
  try { await navigator.clipboard.writeText(orderText.value); basketFeedback.value = 'Enquiry copied. Share it with the farm contact above. Nothing has been sent by FarmBuddy.' }
  catch { basketFeedback.value = 'Select and copy the enquiry text below, then share it with the farm contact above.' }
}
watch(slug, () => { imagesEnabled.value = false; for (const key of Object.keys(quantities)) delete quantities[key]; basketFeedback.value = '' })
if (import.meta.server && error.value) setResponseStatus(useRequestEvent(), error.value.statusCode === 404 || error.value.statusCode === 400 ? 404 : 503)
</script>

<template>
  <main class="storefront">
    <NuxtLink to="/" class="brand">FarmBuddy</NuxtLink>
    <div v-if="status === 'pending'" role="status">Loading farm products…</div>
    <section v-else-if="error || !data" class="empty"><h1>Storefront unavailable</h1><p>This farm may be unpublished or the link may have changed.</p><button @click="refresh">Try again</button></section>
    <template v-else>
      <header><p class="eyebrow">DIRECT FROM THE FARM</p><h1>{{ data.farm.name }}</h1><p>Explore the harvest. Contact the farm to confirm availability, delivery and payment arrangements.</p></header>
      <aside class="contact"><h2>Order directly from this farm</h2><p v-if="data.farm.contact" class="contact-text">{{ data.farm.contact }}</p><p v-else>This farm has not shared public ordering contact details yet.</p><p>This is a catalog only. FarmBuddy does not process payments, confirm orders or reserve stock. Verify seller details before paying.</p></aside>
      <label v-if="data.products.some(product => product.imageUrl)" class="image-choice"><input v-model="imagesEnabled" type="checkbox"> Load product images from external hosts (shares your IP with those hosts)</label>
      <p v-if="!data.products.length" class="empty">No public products are available right now. Please check back.</p>
      <div class="products"><article v-for="product in data.products" :key="product.id"><img v-if="imagesEnabled && product.imageUrl" :src="product.imageUrl" :alt="product.name" loading="lazy" referrerpolicy="no-referrer" @error="$event.target.style.display = 'none'"><div class="product-body"><p class="availability">{{ product.quantity > 0 ? `${product.quantity} ${product.unit} available` : 'Currently out of stock' }}</p><h2>{{ product.name }}</h2><p class="price">{{ product.currency }} {{ product.price.toFixed(2) }} <span>/ {{ product.unit }}</span></p><p class="description">{{ product.description }}</p><button type="button" :disabled="product.quantity <= 0" @click="add(product)">{{ product.quantity > 0 ? 'Add to enquiry' : 'Out of stock' }}</button></div></article></div>
      <section v-if="hasItems" class="basket" aria-labelledby="basket-title">
        <h2 id="basket-title">Your enquiry basket</h2>
        <p>Choose quantities, then copy the summary and send it to the farm contact above. Stock is not reserved and prices need confirmation.</p>
        <div v-for="product in data.products.filter(item => Object.hasOwn(quantities, item.id))" :key="product.id" class="basket-row">
          <label :for="`quantity-${product.id}`">{{ product.name }} <span>({{ product.unit }}, up to {{ product.quantity }})</span></label>
          <input :id="`quantity-${product.id}`" v-model.number="quantities[product.id]" type="number" min="0.001" :max="product.quantity" step="any" inputmode="decimal">
          <button type="button" :aria-label="`Remove ${product.name} from enquiry`" @click="delete quantities[product.id]">Remove</button>
        </div>
        <p v-if="basket.invalid.length" role="alert">Enter a valid positive quantity within the available stock for each product. Very large totals cannot be quoted.</p>
        <template v-else>
          <p v-for="(cents, currency) in basket.totals" :key="currency"><strong>Estimated total: {{ currency }} {{ (cents / 100).toFixed(2) }}</strong></p>
          <button type="button" :disabled="!orderText" @click="copyOrder">Copy order enquiry</button>
          <label class="summary-label" for="enquiry-summary">Your enquiry summary (nothing has been sent)</label><textarea id="enquiry-summary" :value="orderText" readonly rows="7" />
        </template>
      </section>
      <p v-if="basketFeedback" role="status" aria-live="polite">{{ basketFeedback }}</p>
    </template>
  </main>
</template>

<style scoped>
.storefront{min-height:100vh;background:#f7f8f1;color:#203c2b;padding:clamp(20px,5vw,64px);font-family:inherit}.brand{font-size:1.3rem;font-weight:800;text-decoration:none}header{max-width:780px;margin:54px 0 28px}.eyebrow{letter-spacing:.17em;font-size:.75rem;font-weight:750;color:#597454}h1{font-size:clamp(2.3rem,6vw,4.5rem);font-weight:850;line-height:1.1;margin:14px 0 22px;overflow-wrap:anywhere}h2{font-size:1.3rem;font-weight:750}p{line-height:1.7;margin:10px 0}.contact{background:#eaf0df;border:1px solid #d5dfca;border-radius:16px;padding:22px;max-width:900px}.contact-text{font-size:1.25rem;font-weight:700;white-space:pre-wrap;overflow-wrap:anywhere}.products{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:24px;margin:28px 0;max-width:1400px}article{background:white;border:1px solid #dce5d8;border-radius:18px;overflow:hidden;max-width:550px}.product-body{padding:24px;overflow-wrap:anywhere}img{width:100%;height:230px;object-fit:cover}.availability{font-size:.85rem;color:#58704f}.price{font-size:1.5rem;font-weight:750}.price span{font-size:1rem;font-weight:400}.description{white-space:pre-wrap}.empty{padding:40px 0}.image-choice{display:flex;gap:10px;align-items:center;margin:26px 0}button{min-height:44px;padding:10px 18px;background:#285c34;border-radius:9px;color:white}:focus-visible{outline:3px solid #b4892d;outline-offset:4px}
button:disabled{opacity:.5;cursor:not-allowed}.basket{max-width:900px;border:1px solid #d5dfca;border-radius:18px;padding:clamp(16px,3vw,28px);background:white}.basket-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:16px 0;border-bottom:1px solid #e6ebdf}.basket-row label{flex:1;min-width:160px;overflow-wrap:anywhere}.basket-row input{width:100px;max-width:100%;border:1px solid #bcccb5;border-radius:8px;padding:10px}.summary-label{display:block;margin-top:20px;font-weight:700}.basket textarea{width:100%;max-width:100%;margin-top:10px;border:1px solid #bcccb5;border-radius:8px;padding:12px;resize:vertical;font-size:.9rem}.basket p{overflow-wrap:anywhere}
</style>
