<script setup>
const route = useRoute()
const slug = computed(() => String(route.params.farmSlug || ''))
const { data, error, status, refresh } = await useFetch(() => `/api/storefront/${encodeURIComponent(slug.value)}`, { watch: [slug] })
useHead(() => ({ title: data.value?.farm?.name ? `${data.value.farm.name} | Farm products` : 'Farm storefront', meta: [{ name: 'referrer', content: 'no-referrer' }] }))
const imagesEnabled = ref(false)
watch(slug, () => { imagesEnabled.value = false })
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
      <div class="products"><article v-for="product in data.products" :key="product.id"><img v-if="imagesEnabled && product.imageUrl" :src="product.imageUrl" :alt="product.name" loading="lazy" referrerpolicy="no-referrer" @error="$event.target.style.display = 'none'"><div class="product-body"><p class="availability">{{ product.quantity > 0 ? `${product.quantity} ${product.unit} available` : 'Currently out of stock' }}</p><h2>{{ product.name }}</h2><p class="price">{{ product.currency }} {{ product.price.toFixed(2) }} <span>/ {{ product.unit }}</span></p><p class="description">{{ product.description }}</p><p>To enquire, contact the farm above and quote “{{ product.name }}”.</p></div></article></div>
    </template>
  </main>
</template>

<style scoped>
.storefront{min-height:100vh;background:#f7f8f1;color:#203c2b;padding:clamp(20px,5vw,64px);font-family:inherit}.brand{font-size:1.3rem;font-weight:800;text-decoration:none}header{max-width:780px;margin:54px 0 28px}.eyebrow{letter-spacing:.17em;font-size:.75rem;font-weight:750;color:#597454}h1{font-size:clamp(2.3rem,6vw,4.5rem);font-weight:850;line-height:1.1;margin:14px 0 22px;overflow-wrap:anywhere}h2{font-size:1.3rem;font-weight:750}p{line-height:1.7;margin:10px 0}.contact{background:#eaf0df;border:1px solid #d5dfca;border-radius:16px;padding:22px;max-width:900px}.contact-text{font-size:1.25rem;font-weight:700;white-space:pre-wrap;overflow-wrap:anywhere}.products{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:24px;margin:28px 0;max-width:1400px}article{background:white;border:1px solid #dce5d8;border-radius:18px;overflow:hidden;max-width:550px}.product-body{padding:24px;overflow-wrap:anywhere}img{width:100%;height:230px;object-fit:cover}.availability{font-size:.85rem;color:#58704f}.price{font-size:1.5rem;font-weight:750}.price span{font-size:1rem;font-weight:400}.description{white-space:pre-wrap}.empty{padding:40px 0}.image-choice{display:flex;gap:10px;align-items:center;margin:26px 0}button{min-height:44px;padding:10px 18px;background:#285c34;border-radius:9px;color:white}:focus-visible{outline:3px solid #b4892d;outline-offset:4px}
</style>
