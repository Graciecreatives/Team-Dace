import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'

const source = readFileSync(new URL('../components/FarmMarketplace.vue', import.meta.url), 'utf8')
function editor(fetcher, prepare = async () => new Blob(['photo'])) {
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/m, '')
  const context = vm.createContext({ defineProps: () => ({ user: { id: 'one' } }), reactive: value => value, ref: value => ({ value }), computed: get => ({ get value() { return get() } }), onMounted() {}, onUnmounted() {}, watch() {}, nextTick: callback => Promise.resolve().then(callback), AbortController, prepareProductPhoto: prepare, $fetch: fetcher })
  vm.runInContext(script + '\nglobalThis.editor = { farm, savedFarm, shareLink, load, save, uploadPhoto, uploadingPhoto, ownedCover, apply, origin, draft, busy, products, activeTab, composerOpen, search, productFilter, counts, visibleProducts, previewProducts, openComposer, closeComposer, selectTab, focusTab, composerHeading, boardHeading, edit, saveProduct, farmDirty }', context)
  return context.editor
}
const catalog = { farm: { slug: 'my-farm', name: 'Farm', published: false }, products: [] }
const event = () => ({ target: { files: [{}], value: 'selected' } })

test('appearance component compiles with labelled choices and explicit save preview', () => {
  const { descriptor, errors } = parse(source)
  assert.deepEqual(errors, [])
  const script = compileScript(descriptor, { id: 'storefront-editor' })
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'FarmMarketplace.vue', id: 'storefront-editor', compilerOptions: { bindingMetadata: script.bindings } }).errors, [])
  assert.deepEqual(compileStyle({ source: descriptor.styles[0].content, filename: 'FarmMarketplace.vue', id: 'storefront-editor', scoped: true }).errors, [])
  assert.match(source, /maxlength="80"/)
  assert.match(source, /maxlength="160"/)
  assert.match(source, /type="radio" name="store-theme"/)
  assert.match(source, /Preview only/)
  assert.match(source, /farm is published and the welcome banner is enabled/)
  assert.match(source, /No product attachment needed\./)
  assert.doesNotMatch(source, /regardless of published products/)
  assert.match(source, /<h4>\{\{ farm\.headline \|\| farm\.name \|\| 'Your farm' \}\}<\/h4><p v-if="farm.tagline">\{\{ farm\.tagline \}\}<\/p>/)
})
test('defaults reset for account loads and unsaved settings do not alter share link', async () => {
  const state = editor(async () => catalog)
  await state.load()
  state.origin.value = 'https://farm.example'
  assert.equal(state.farm.theme, 'green')
  assert.equal(state.farm.showHero, true)
  state.farm.slug = 'unsaved'
  state.farm.headline = 'Hello'
  state.farm.theme = 'teal'
  assert.equal(state.shareLink.value, 'https://farm.example/my-farm/products')
  await state.load()
  assert.equal(state.farm.headline, '')
  assert.equal(state.farm.theme, 'green')
})
test('cover uploads use photo pipeline, keep product isolated and only preview owned URLs', async () => {
  const url = '/api/product-images/12345678-1234-1234-1234-123456789abc'
  const calls = []
  const state = editor(async (path, options) => { calls.push([path, options]); return { imageUrl: url } })
  state.apply(catalog)
  await state.uploadPhoto(event(), 'cover')
  assert.equal(state.farm.coverImageUrl, url)
  assert.equal(state.draft.imageUrl, '')
  state.busy.value = true
  await state.uploadPhoto(event(), 'cover')
  assert.equal(calls.length, 1)
  state.busy.value = false
  assert.equal(calls[0][0], '/api/product-images')
  assert.equal(calls[0][1].method, 'POST')
  assert.equal(state.ownedCover.value, true)
  state.farm.coverImageUrl = 'https://external.example/image.jpg'
  assert.equal(state.ownedCover.value, false)
})
test('account changes abort cover upload and ignore stale responses', async () => {
  let finish, signal
  const state = editor(async (path, options) => {
    if (path === '/api/marketplace') return catalog
    signal = options.signal
    return new Promise(resolve => { finish = resolve })
  })
  state.apply(catalog)
  const uploading = state.uploadPhoto(event(), 'cover')
  await new Promise(resolve => setImmediate(resolve))
  await state.load()
  assert.equal(signal.aborted, true)
  finish({ imageUrl: '/api/product-images/12345678-1234-1234-1234-123456789abc' })
  await uploading
  assert.equal(state.farm.coverImageUrl, '')
  assert.equal(state.uploadingPhoto.value, false)
})
test('failed save keeps saved storefront state unchanged', async () => {
  const state = editor(async () => { throw new Error('offline') })
  state.apply(catalog)
  state.farm.slug = 'unsaved'
  assert.equal(await state.save({ ...state.farm, action: 'configure' }, 'Saved'), false)
  assert.equal(state.savedFarm.value.slug, 'my-farm')
})

test('seller board uses factual counts and combines publication filters with search', () => {
  const state = editor(async () => catalog)
  state.apply({ ...catalog, products: [
    { id: 'a', name: 'Tomatoes', description: 'Garden fresh', quantity: 3, published: true },
    { id: 'b', name: 'Beans', description: 'Dry harvest', quantity: 0, published: false },
    { id: 'c', name: 'Peppers', quantity: 2, published: false }
  ] })
  assert.equal(state.activeTab.value, 'products')
  assert.equal(JSON.stringify(state.counts.value), JSON.stringify({ total: 3, published: 1, outOfStock: 1 }))
  state.productFilter.value = 'draft'
  assert.equal(state.visibleProducts.value.length, 2)
  state.search.value = ' DRY '
  assert.equal(state.visibleProducts.value[0].id, 'b')
  state.productFilter.value = 'published'
  assert.equal(state.visibleProducts.value.length, 0)
  state.search.value = 'garden'
  assert.equal(state.visibleProducts.value[0].id, 'a')
  assert.equal(state.previewProducts.value.length, 3)
})

test('composer opens, cancels, edits and saves without losing unsaved farm design', async () => {
  let payload
  const state = editor(async (_path, options) => {
    payload = options.body
    return { ...catalog, products: [{ ...payload, id: 'saved' }] }
  })
  state.apply(catalog)
  state.openComposer()
  assert.equal(state.composerOpen.value, true)
  state.draft.name = 'Discard this'
  state.closeComposer()
  assert.equal(state.composerOpen.value, false)
  assert.equal(state.draft.name, '')
  state.selectTab('design')
  state.edit({ id: 'one', name: 'Beans', price: '42.50', quantity: '4', published: true })
  assert.equal(state.activeTab.value, 'products')
  assert.equal(state.composerOpen.value, true)
  assert.equal(state.draft.id, 'one')
  state.farm.headline = 'My unsaved welcome'
  await state.saveProduct()
  assert.equal(payload.action, 'saveProduct')
  assert.equal(payload.price, 42.5)
  assert.equal(payload.quantity, 4)
  assert.equal(state.composerOpen.value, false)
  assert.equal(state.draft.id, undefined)
  assert.equal(state.farm.headline, 'My unsaved welcome')
  assert.equal(state.farmDirty.value, true)
  assert.equal(state.savedFarm.value.published, false)
  state.openComposer()
  assert.equal(state.draft.published, false)
})

test('failed product saves keep composer contents, and account loads reset workspace state', async () => {
  let fail = true
  const state = editor(async () => { if (fail) throw new Error('offline'); return catalog })
  state.apply(catalog)
  state.openComposer()
  state.draft.name = 'Keep me'
  await state.saveProduct()
  assert.equal(state.composerOpen.value, true)
  assert.equal(state.draft.name, 'Keep me')
  state.uploadingPhoto.value = true
  state.closeComposer()
  state.selectTab('settings')
  assert.equal(state.composerOpen.value, true)
  assert.equal(state.activeTab.value, 'products')
  state.search.value = 'old account'
  state.productFilter.value = 'draft'
  fail = false
  await state.load()
  assert.equal(state.composerOpen.value, false)
  assert.equal(state.draft.name, '')
  assert.equal(state.search.value, '')
  assert.equal(state.productFilter.value, 'all')
})

test('tabs support arrow, home and end navigation with roving focus', () => {
  const state = editor(async () => catalog)
  let focused = -1, prevented = 0
  const nodes = [0, 1, 2].map(index => ({ focus() { focused = index } }))
  const key = (key, index) => state.focusTab({ key, preventDefault() { prevented++ }, currentTarget: { parentElement: { querySelectorAll: () => nodes } } }, index)
  key('ArrowLeft', 0)
  assert.equal(state.activeTab.value, 'settings')
  assert.equal(focused, 2)
  key('Home', 2)
  assert.equal(focused, 0)
  key('End', 0)
  assert.equal(focused, 2)
  key('ArrowRight', 2)
  assert.equal(focused, 0)
  key('Tab', 0)
  assert.equal(prevented, 4)
  assert.match(source, /:aria-selected="activeTab === tab.value"/)
  assert.match(source, /v-if="!composerOpen"/)
  assert.match(source, /v-if="isOwnedImage\(product.imageUrl\)"/)
  assert.match(source, /prefers-reduced-motion:reduce/)
})

test('composer transitions focus and scroll headings after the render tick', async () => {
  const state = editor(async () => catalog)
  state.apply(catalog)
  const calls = []
  const heading = name => ({ focus() { calls.push(`${name}:focus`) }, scrollIntoView(options) { calls.push(`${name}:${options.block}`) } })
  state.composerHeading.value = heading('composer')
  state.boardHeading.value = heading('board')
  state.openComposer()
  assert.equal(calls.length, 0)
  await Promise.resolve()
  state.closeComposer()
  await Promise.resolve()
  state.edit({ id: 'one', name: 'Beans' })
  await Promise.resolve()
  await state.saveProduct()
  assert.deepEqual(calls, ['composer:focus', 'composer:nearest', 'board:focus', 'board:nearest', 'composer:focus', 'composer:nearest', 'board:focus', 'board:nearest'])
  assert.match(source, /width:100%;max-width:none;padding:0;background:transparent/)
  assert.match(source, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/)
  assert.match(source, /grid-template-columns:320px minmax\(0,1fr\)/)
})
