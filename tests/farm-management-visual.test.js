import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as Vue from 'vue'
import * as Icons from 'lucide-vue-next'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import { filterManagementRows, stockStatus, numericInput } from '../app/utils/management-board.js'

const source = await readFile(new URL('../app/components/FarmManagement.vue', import.meta.url), 'utf8')
const { descriptor, errors } = parse(source)

test('management shelf and directory compile with real icons, quantities and responsive accessibility rules', () => {
  assert.deepEqual(errors, [])
  const script = compileScript(descriptor, { id: 'management-visual' })
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'FarmManagement.vue', id: 'management-visual', compilerOptions: { bindingMetadata: script.bindings } }).errors, [])
  for (const style of descriptor.styles) assert.deepEqual(compileStyle({ source: style.content, filename: 'FarmManagement.vue', id: 'management-visual', scoped: style.scoped }).errors, [])
  for (const contract of ['supply-shelf', 'farm-directory', 'Restock / edit', '{{ item.quantity }}', '{{ item.threshold }} {{ item.unit }}', 'Quantity not recorded', 'prefers-reduced-motion', ':focus-visible', 'min-height:44px']) assert.ok(source.includes(contract), contract)
})

test('management mounted shelf keeps conflicts and generation guards while editing real stock', async () => {
  const requests = []
  let failSave = false
  const item = { id: 'seed', name: 'Maize seed', quantity: 0, unit: 'kg', threshold: 4, updatedAt: 'version-1', notes: '' }
  const fetch = async (url, options = {}) => {
    requests.push({ url, ...options })
    if (options.method && failSave) throw { data: { statusMessage: 'Stock changed. Reload before editing.' } }
    if (options.method) return { inventory: { ...item, ...options.body, updatedAt: 'version-2' } }
    return { inventory: [item], enterprises: [{ id: 'herd', name: 'Cattle', kind: 'livestock', quantity: 12, unit: 'head' }] }
  }
  const compiled = compileScript(descriptor, { id: 'management-lifecycle' }).content
    .replace(/^import \{([^}]+)\} from 'vue'\n/m, 'const {$1} = Vue\n')
    .replace(/^import \{([^}]+)\} from 'lucide-vue-next'\n/m, 'const {$1} = Icons\n')
    .replace(/^import .* from .*\n/gm, '')
    .replace('export default', 'return')
  const component = new Function('Vue', 'Icons', '$fetch', 'filterManagementRows', 'stockStatus', 'numericInput', 'FbButton', 'FbBadge', 'FbPageHeader', 'FbPanel', 'FbEmptyState', 'FbDialog', compiled)(Vue, Icons, fetch, filterManagementRows, stockStatus, numericInput, {}, {}, {}, {}, {}, {})
  let view
  const setup = component.setup
  component.setup = (props, ctx) => { view = setup(props, ctx); return view }
  component.render = () => null
  const renderer = Vue.createRenderer({ createComment: () => ({}), createText: () => ({}), createElement: () => ({}), insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {}, parentNode: () => null, nextSibling: () => null })
  const props = Vue.reactive({ section: 'inventory', user: { id: 'owner', farmType: 'mixed' } })
  const app = renderer.createApp({ setup: () => () => Vue.h(component, props) })
  app.mount({})
  try {
    await Vue.nextTick()
    assert.equal(view.rows.value[0].quantity, 0)
    assert.equal(view.itemIcon(item), Icons.Wheat)
    assert.equal(view.itemIcon({ name: 'Unclassified' }), Icons.Package)
    view.compose(item)
    assert.equal(view.dialogOpen.value, true)
    view.form.quantity = '8'
    failSave = true
    await view.save()
    assert.equal(view.form.quantity, '8', 'conflict preserves entered stock')
    assert.equal(view.dialogOpen.value, true)
    assert.equal(requests.at(-1).body.expectedUpdatedAt, 'version-1')
    failSave = false
    await view.save()
    assert.equal(view.rows.value[0].quantity, 8)
    assert.equal(view.dialogOpen.value, false)
    props.section = 'enterprises'
    await Vue.nextTick()
    await Vue.nextTick()
    assert.equal(view.itemIcon(view.rows.value[0]), Icons.Beef)
    assert.equal(view.search.value, '')
    assert.equal(view.editing.value, '')
  } finally { app.unmount() }
  assert.deepEqual(view.rows.value, [])
  assert.equal(requests[0].signal.aborted, true)
})
