<script setup>
import { prepareProductPhoto } from '../utils/product-photo.js'
const props = defineProps({ user: { type: Object, required: true } })
const farm = reactive({ slug: '', name: '', contact: '', contactConsent: false, published: false })
const emptyProduct = () => ({ name: '', description: '', price: '', quantity: '', unit: 'kg', currency: 'NGN', imageUrl: '', published: false })
const draft = reactive(emptyProduct())
const products = ref([]), busy = ref(false), error = ref(''), feedback = ref(''), origin = ref('')
const loaded = ref(false)
const uploadingPhoto = ref(false)
const photoPicker = ref(null)
const cameraPicker = ref(null)
const ownedPhoto = computed(() => /^\/api\/product-images\/[a-f0-9-]{36}$/.test(draft.imageUrl || ''))
let uploadController
async function uploadPhoto(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || busy.value || uploadingPhoto.value || !loaded.value) return
  error.value = ''; feedback.value = ''
  const token = generation
  uploadingPhoto.value = true
  const controller = new AbortController()
  uploadController = controller
  let preparing = true
  try {
    const photo = await prepareProductPhoto(file, { signal: controller.signal })
    if (token !== generation || controller.signal.aborted) return
    preparing = false
    const result = await $fetch('/api/product-images', { method: 'POST', body: photo, headers: { 'Content-Type': 'image/jpeg' }, timeout: 60000, signal: controller.signal })
    if (token !== generation) return
    draft.imageUrl = result.imageUrl
    feedback.value = 'Photo uploaded and GPS metadata removed. Save the product to attach it. It stays private until the product and storefront are published.'
  } catch (cause) { if (token === generation) error.value = preparing ? (cause?.message || 'Could not prepare this photo. Try another picture.') : (cause?.data?.statusMessage || 'Photo upload was not confirmed. Try again when connected.') }
  finally { if (token === generation) uploadingPhoto.value = false }
}
let generation = 0
const savedFarm = ref({ slug: '', published: false })
const shareLink = computed(() => origin.value && savedFarm.value.slug ? `${origin.value}/${savedFarm.value.slug}/products` : '')
function apply(data) { Object.assign(farm, data.farm); savedFarm.value = { ...data.farm }; products.value = data.products; loaded.value = true }
async function load() {
  const token = ++generation
  uploadController?.abort(); uploadingPhoto.value = false
  loaded.value = false
  products.value = []; savedFarm.value = { slug: '', published: false }; Object.assign(farm, { slug: '', name: '', contact: '', contactConsent: false, published: false }); resetDraft()
  busy.value = true; error.value = ''; feedback.value = ''
  try { const data = await $fetch('/api/marketplace', { timeout: 15000 }); if (token === generation) apply(data) }
  catch { if (token === generation) error.value = 'Could not load your catalog. Sign in and retry.' }
  finally { if (token === generation) busy.value = false }
}
async function save(input, message) {
  if (busy.value || uploadingPhoto.value || !loaded.value) return false
  const token = generation
  busy.value = true; error.value = ''; feedback.value = ''
  try {
    const data = await $fetch('/api/marketplace', { method: 'POST', body: input, timeout: 15000 })
    if (token !== generation) return false
    apply(data); feedback.value = message; return true
  } catch (cause) { if (token === generation) error.value = cause?.data?.statusMessage || 'Save was not confirmed. Refresh before retrying.'; return false }
  finally { if (token === generation) busy.value = false }
}
function resetDraft() { for (const key of Object.keys(draft)) delete draft[key]; Object.assign(draft, emptyProduct()) }
async function saveProduct() { if (await save({ ...draft, price: Number(draft.price), quantity: Number(draft.quantity), action: 'saveProduct' }, 'Product saved. Only published products appear on a published storefront.')) resetDraft() }
function edit(product) { resetDraft(); Object.assign(draft, product); feedback.value = 'Editing product below.' }
async function remove(product) { if (window.confirm(`Delete ${product.name}? This cannot be undone.`)) { if (await save({ action: 'deleteProduct', id: product.id }, 'Product deleted.') && draft.id === product.id) resetDraft() } }
async function copyLink() { try { await navigator.clipboard.writeText(shareLink.value); feedback.value = 'Storefront link copied.' } catch { feedback.value = 'Copy the storefront link from the field below.' } }
onMounted(() => { origin.value = window.location.origin; load() })
watch(() => props.user?.id, () => { if (origin.value) load() }, { flush: 'sync' })
onUnmounted(() => { generation++; uploadController?.abort() })
</script>

<template>
  <section class="marketplace" aria-label="Farm marketplace" :aria-busy="busy || uploadingPhoto">
    <header><p class="eyebrow">YOUR FARM, YOUR STOREFRONT</p><h2>Sell what you grow</h2><p>Publish a product catalog and let buyers contact you directly. No online checkout, payment processing or automatic stock reservation.</p></header>
    <p v-if="error" class="notice" role="alert">{{ error }}</p><p role="status" aria-live="polite">{{ feedback }}</p>
    <button type="button" :disabled="busy || uploadingPhoto" @click="load">Refresh catalog</button>
    <form @submit.prevent="save({ ...farm, action: 'configure' }, 'Storefront settings saved.')">
      <h3>Storefront settings</h3>
      <label>Public farm name<input v-model="farm.name" required maxlength="100" autocomplete="organization"></label>
      <label>Unique farm slug<input v-model="farm.slug" required minlength="3" maxlength="60" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="green-acre-farm" autocapitalize="none" spellcheck="false"></label>
      <p>Lowercase letters, digits and hyphens. Changing the slug changes your link. This uses your current website domain, not a new custom domain.</p>
      <label>Public ordering contact (optional)<input v-model="farm.contact" maxlength="250" placeholder="Business phone or ordering email"></label>
      <label class="check"><input v-model="farm.contactConsent" type="checkbox"> I consent to displaying this contact publicly. My account email is never filled in automatically.</label>
      <p>To remove contact consent, also clear the contact field.</p>
      <label class="check"><input v-model="farm.published" type="checkbox"> Publish this storefront, its farm name and explicitly published products</label>
      <button :disabled="busy || uploadingPhoto || !loaded">Save storefront settings</button>
    </form>
    <div v-if="shareLink" class="notice"><label>Storefront link<input :value="shareLink" readonly aria-label="Storefront share link"></label><button type="button" @click="copyLink">Copy link</button> <a v-if="savedFarm.published" :href="shareLink" target="_blank" rel="noopener">Open storefront</a><p v-else>Storefront is unpublished. Visitors will see an unavailable page.</p></div>
    <h3>Your products</h3><p v-if="!products.length">No products yet. Start with your first harvest or farm product.</p>
    <ul class="product-list"><li v-for="product in products" :key="product.id"><h4>{{ product.name }}</h4><p>{{ product.currency }} {{ product.price.toFixed(2) }} / {{ product.unit }} · {{ product.quantity }} available</p><p>{{ product.published ? 'Published product' : 'Private draft' }}</p><button type="button" :disabled="busy || uploadingPhoto || !loaded" @click="edit(product)">Edit</button> <button type="button" :disabled="busy || uploadingPhoto || !loaded" @click="save({ ...product, action: 'saveProduct', published: !product.published }, 'Publication updated.')">{{ product.published ? 'Unpublish' : 'Publish' }}</button> <button type="button" :disabled="busy || uploadingPhoto || !loaded" @click="remove(product)">Delete</button></li></ul>
    <form @submit.prevent="saveProduct">
      <h3>{{ draft.id ? 'Edit product' : 'Add a product' }}</h3>
      <label>Product name<input v-model="draft.name" required maxlength="120"></label>
      <label>Description<textarea v-model="draft.description" maxlength="2000" rows="3" /></label>
      <div class="fields"><label>Price per unit<input v-model="draft.price" type="number" required min="0.01" max="1000000000" step="0.01"></label><label>Currency<select v-model="draft.currency"><option v-for="code in ['NGN','USD','GBP','EUR','GHS','KES','ZAR']" :key="code">{{ code }}</option></select></label><label>Quantity available<input v-model="draft.quantity" type="number" required min="0" max="1000000000" step="any"></label><label>Unit<input v-model="draft.unit" required maxlength="40" placeholder="kg, crate, bag"></label></div>
      <div class="photo-upload">
        <h4>Product photo</h4>
        <p>Choose a picture from your phone or take a new one. JPEG, PNG or WebP, up to 20 MB and 40 megapixels. Your browser reduces it to 1600 pixels before upload. Photos are checked again and location metadata is removed on the server.</p>
        <input id="product-photo-upload" ref="photoPicker" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" :disabled="busy || uploadingPhoto || !loaded" @change="uploadPhoto">
        <input id="product-photo-camera" ref="cameraPicker" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" class="sr-only" :disabled="busy || uploadingPhoto || !loaded" @change="uploadPhoto">
        <div class="photo-actions"><button type="button" :disabled="busy || uploadingPhoto || !loaded" @click="photoPicker?.click()">{{ uploadingPhoto ? 'Uploading photo…' : 'Choose from phone or computer' }}</button><button type="button" :disabled="busy || uploadingPhoto || !loaded" @click="cameraPicker?.click()">Take a photo</button></div>
        <p v-if="uploadingPhoto" role="status">Uploading and preparing your product photo. Keep this page open.</p>
        <div v-if="ownedPhoto" class="photo-preview"><img :src="draft.imageUrl" alt="Your uploaded product photo"><button type="button" :disabled="busy || uploadingPhoto" @click="draft.imageUrl = ''">Remove from product</button><p>Removing the photo here detaches it when you save. It does not delete the stored upload.</p></div>
        <details><summary>Or use an external image URL</summary><label>Image URL (optional, public HTTPS only)<input v-model="draft.imageUrl" type="text" maxlength="1000" placeholder="https://images.example.com/tomatoes.jpg" :disabled="busy || uploadingPhoto"></label><p>External images may reveal a visitor's IP to the image host. Use a trusted image host, never a private or signed URL.</p></details>
      </div>
      <label class="check"><input v-model="draft.published" type="checkbox"> Publish this product on my published storefront</label>
      <button :disabled="busy || uploadingPhoto || !loaded">{{ draft.id ? 'Save changes' : 'Add product' }}</button><button v-if="draft.id" type="button" :disabled="busy || uploadingPhoto || !loaded" @click="resetDraft">Cancel edit</button>
    </form>
  </section>
</template>

<style scoped>
.marketplace{max-width:1000px;background:#fff;color:#203c2b;border:1px solid #dbe6db;border-radius:22px;padding:clamp(18px,4vw,36px)}h2{font-size:clamp(1.7rem,4vw,2.5rem);font-weight:800}h3{font-size:1.2rem;font-weight:750;margin-top:20px}h4{font-weight:700}.eyebrow{font-size:.75rem;letter-spacing:.14em;font-weight:750;color:#527153}p{line-height:1.65;margin:10px 0}form{display:grid;gap:14px;margin:24px 0}label{display:grid;gap:7px;font-weight:600}input:not([type=checkbox]),textarea,select{border:1px solid #9bad9b;border-radius:9px;background:white;padding:11px;color:#203c2b;width:100%;min-width:0}.check{display:flex;align-items:start;gap:10px}.check input{margin-top:5px}button{padding:11px 16px;background:#285c34;color:white;border-radius:9px;min-height:44px;font-weight:650}button:disabled{opacity:.5}.notice{background:#f3f5e9;padding:16px;border-radius:12px;overflow-wrap:anywhere}.notice button{margin-top:12px}a{text-decoration:underline}.product-list{display:grid;gap:14px;margin-top:16px}.product-list li{padding:18px;border:1px solid #dae5da;border-radius:12px;overflow-wrap:anywhere}.product-list button{margin-top:8px}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}:focus-visible{outline:3px solid #bb8b29;outline-offset:3px}@media(max-width:520px){.fields{grid-template-columns:1fr}.product-list button{display:block;width:100%}}

.photo-upload{padding:18px;border:1px dashed #a9bf98;border-radius:16px;background:#f5f8ed;min-width:0}.photo-upload p{font-size:.85rem}.photo-actions{display:flex;gap:10px;flex-wrap:wrap}.photo-preview{margin:18px 0}.photo-preview img{display:block;width:100%;max-width:280px;height:180px;object-fit:cover;border-radius:12px;margin-bottom:12px}.photo-upload summary{cursor:pointer;margin:16px 0;font-size:.9rem;font-weight:650}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
</style>
