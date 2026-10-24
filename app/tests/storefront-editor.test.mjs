import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const source = readFileSync(new URL('../components/FarmMarketplace.vue', import.meta.url), 'utf8')
function editor(fetcher, prepare = async () => new Blob(['photo'])) {
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/m, '')
  const context = vm.createContext({ defineProps: () => ({ user: { id: 'one' } }), reactive: value => value, ref: value => ({ value }), computed: get => ({ get value() { return get() } }), onMounted() {}, onUnmounted() {}, watch() {}, AbortController, prepareProductPhoto: prepare, $fetch: fetcher })
  vm.runInContext(script + '\nglobalThis.editor = { farm, savedFarm, shareLink, load, save, uploadPhoto, uploadingPhoto, ownedCover, apply, origin, draft, busy }', context)
  return context.editor
}
const catalog = { farm: { slug: 'my-farm', name: 'Farm', published: false }, products: [] }
const event = () => ({ target: { files: [{}], value: 'selected' } })

test('appearance component compiles with labelled choices and explicit save preview', () => {
  const { descriptor, errors } = parse(source)
  assert.deepEqual(errors, [])
  const script = compileScript(descriptor, { id: 'storefront-editor' })
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'FarmMarketplace.vue', id: 'storefront-editor', compilerOptions: { bindingMetadata: script.bindings } }).errors, [])
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
