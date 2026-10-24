import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { ref, reactive, computed, watch, nextTick, effectScope } from 'vue'
import * as icons from 'lucide-vue-next'
import * as cart from '../utils/marketplace-cart.js'
import * as storefront from '../utils/storefront.js'

const source = await readFile(new URL('../pages/[farmSlug]/products.vue', import.meta.url), 'utf8')
const descriptor = parse(source).descriptor
const products = [
  { id: 'tomatoes', name: 'Tomatoes', description: 'Ripe tomatoes', price: 4500, quantity: 2, currency: 'NGN', unit: 'basket', imageUrl: '' },
  { id: 'eggs', name: 'Eggs', description: 'Farm eggs', price: 10, quantity: 3, currency: 'USD', unit: 'crate', imageUrl: '' },
  { id: 'greens', name: 'Greens', description: '', price: 500, quantity: 0, currency: 'NGN', unit: 'bunch', imageUrl: '' },
]
async function setup({ clipboardFails = false } = {}) {
  const scope = effectScope()
  const route = reactive({ params: { farmSlug: 'green-acre' } })
  const data = ref({ farm: { name: 'Green Acre', slug: 'green-acre', contact: 'Farm contact' }, products: structuredClone(products) })
  let copied = ''
  const dependencies = {
    ...Object.fromEntries(Object.entries(icons).filter(([name]) => /^[A-Z]\w*$/.test(name))), ...cart, ...storefront, ref, reactive, computed, nextTick,
    watch: (...args) => scope.run(() => watch(...args)),
    useRoute: () => route, useFetch: async () => ({ data, error: ref(null), status: ref('success'), refresh: async () => {} }),
    useHead() {}, useRequestEvent: () => ({}), setResponseStatus() {}, onMounted() {}, onUnmounted() {},
    navigator: { clipboard: { async writeText(text) { if (clipboardFails) throw new Error('Clipboard denied'); copied = text } } },
  }
  const code = descriptor.scriptSetup.content.replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '').replaceAll('import.meta.server', 'false').replaceAll('import.meta.client', 'true')
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const injected = Object.fromEntries(Object.entries(dependencies).filter(([name]) => !new RegExp(`(?:const|let|function)\\s+${name}\\b`).test(code)))
  let promise
  scope.run(() => { promise = new AsyncFunction(...Object.keys(injected), `${code}\nreturn { add, quantities, basket, orderText, imagesEnabled, copyOrder, basketFeedback, slug, selectedProducts, search, sort, availableOnly, failedImages, heroProduct, canShowImage, imageFailed }`)(...Object.values(injected)) })
  return { state: await promise, data, route, copied: () => copied, stop: () => scope.stop() }
}

test('public storefront script and template compile with accessible catalogue and enquiry controls', () => {
  const script = compileScript(descriptor, { id: 'storefront-page' })
  const template = compileTemplate({ source: descriptor.template.content, filename: 'products.vue', id: 'storefront-page', compilerOptions: { bindingMetadata: script.bindings } })
  assert.deepEqual(template.errors, [])
  assert.match(descriptor.template.content, /aria-live="polite"/)
  assert.match(descriptor.template.content, /referrerpolicy="no-referrer"/)
  assert.match(descriptor.template.content, /enquiry-summary/)
})

test('actual storefront setup caps stock, rejects invalid edits and copies separate currency enquiry totals', async () => {
  const h = await setup()
  try {
    assert.equal(h.state.selectedProducts.value.length, 0, 'Read displayed basket before first add, as the template does')
    h.state.add(h.data.value.products[0]); h.state.add(h.data.value.products[0]); h.state.add(h.data.value.products[0])
    assert.equal(h.state.quantities.tomatoes, 2)
    assert.equal(h.state.selectedProducts.value.length, 1, 'First added key must invalidate displayed basket')
    h.state.add(h.data.value.products[2])
    assert.equal(h.state.quantities.greens, undefined)
    h.state.add(h.data.value.products[1])
    assert.equal(h.state.selectedProducts.value.length, 2)
    delete h.state.quantities.eggs
    assert.equal(h.state.selectedProducts.value.length, 1)
    h.state.add(h.data.value.products[1])
    assert.deepEqual(h.state.basket.value.totals, { NGN: 900000, USD: 1000 })
    await h.state.copyOrder()
    assert.match(h.copied(), /not a confirmed or paid order/)
    assert.match(h.copied(), /NGN 9000.00/)
    assert.match(h.copied(), /USD 10.00/)
    h.state.quantities.tomatoes = 3
    assert.equal(h.state.orderText.value, '')
    const previous = h.copied()
    await h.state.copyOrder()
    assert.equal(h.copied(), previous)
    assert.equal(h.data.value.products[0].quantity, 2, 'Enquiries never decrement or reserve stock')
  } finally { h.stop() }
})

test('actual storefront setup clears consent and enquiry on farm change and handles clipboard denial honestly', async () => {
  const h = await setup({ clipboardFails: true })
  try {
    h.state.add(h.data.value.products[0])
    await h.state.copyOrder()
    assert.match(h.state.basketFeedback.value, /copy|clipboard|select/i)
    assert.equal(h.copied(), '')
    h.state.imagesEnabled.value = true
    h.state.search.value = 'tomato'
    h.state.sort.value = 'price-desc'
    h.state.availableOnly.value = true
    h.state.imageFailed('https://images.example.com/produce.jpg')
    h.route.params.farmSlug = 'different-farm'
    await nextTick()
    assert.deepEqual({ ...h.state.quantities }, {})
    assert.equal(h.state.imagesEnabled.value, false)
    assert.equal(h.state.orderText.value, '')
    assert.equal(h.state.search.value, '')
    assert.equal(h.state.sort.value, 'name')
    assert.equal(h.state.availableOnly.value, false)
    assert.equal(h.state.failedImages.value.size, 0)
  } finally { h.stop() }
})

test('hero and card photos respect opt-in and reactively fall back after failure', async () => {
  const h = await setup()
  try {
    const uploaded = '/api/product-images/11111111-1111-4111-8111-111111111111'
    h.data.value.products[0].imageUrl = 'https://images.example.com/tomato.jpg'
    h.data.value.products[1].imageUrl = uploaded
    assert.equal(h.state.canShowImage(h.data.value.products[0]), false)
    assert.equal(h.state.heroProduct.value.id, 'eggs')
    h.state.imagesEnabled.value = true
    assert.equal(h.state.heroProduct.value.id, 'tomatoes')
    h.state.imageFailed(h.data.value.products[0].imageUrl)
    assert.equal(h.state.heroProduct.value.id, 'eggs')
    h.state.imageFailed(uploaded)
    assert.equal(h.state.heroProduct.value, undefined)
  } finally { h.stop() }
})
