import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as Vue from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import * as helpers from '../utils/management-board.js'

const source = readFileSync(new URL('../components/FarmManagement.vue', import.meta.url), 'utf8')
const script = parse(source).descriptor.scriptSetup.content.replace(/^import .*$/gm, '')
const createState = new Function('Vue', 'helpers', 'defineProps', '$fetch', `const { computed, onMounted, onBeforeUnmount, reactive, ref, watch } = Vue\nconst { filterManagementRows, stockStatus, numericInput } = helpers\n${script}\nreturn { rows, loading, busy, error, message, form, editing, deleting, dialogOpen, compose, save, remove, load, search, filter, sort, visibleRows }`)
const flush = async () => { await Promise.resolve(); await Vue.nextTick(); await Promise.resolve() }
function harness(section = 'inventory') {
  const requests = []
  const props = Vue.reactive({ section, user: { id: 'a', farmType: 'livestock' } })
  const fetch = (url, options = {}) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }))
  const renderer = Vue.createRenderer({ createComment: () => ({}), insert() {}, remove() {}, parentNode() {}, nextSibling() {} })
  let state
  const app = renderer.createApp({ setup() { state = createState(Vue, helpers, () => props, fetch); return () => null } })
  app.mount({})
  return { state, props, requests, unmount: () => app.unmount(), async loaded(rows = []) { requests.at(-1).resolve({ [props.section]: rows }); await flush() } }
}
const item = { id: 'one', name: 'Feed', quantity: 2, threshold: 3, unit: 'kg', updatedAt: 'v1' }
test('SFC script and template compile', () => {
  const { descriptor, errors } = parse(source)
  assert.deepEqual(errors, [])
  const compiled = compileScript(descriptor, { id: 'management' })
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'FarmManagement.vue', id: 'management', compilerOptions: { bindingMetadata: compiled.bindings } }).errors, [])
})
test('real Vue mount load, add/edit success and explicit delete confirmation', async () => {
  const h = harness()
  assert.equal(h.state.loading.value, true)
  await h.state.save()
  assert.equal(h.requests.length, 1)
  await h.loaded()
  h.state.compose()
  Object.assign(h.state.form, { name: 'Feed', quantity: '2', threshold: '3' })
  const adding = h.state.save()
  await h.state.save()
  assert.equal(h.requests.length, 2)
  assert.equal(h.requests[1].options.body.quantity, 2)
  h.requests[1].resolve({ inventory: item }); await adding
  assert.equal(h.state.rows.value.length, 1)
  assert.equal(h.state.dialogOpen.value, false)
  h.state.compose(item)
  h.state.form.name = 'New feed'
  const editing = h.state.save()
  assert.equal(h.requests[2].options.method, 'PATCH')
  assert.equal(h.requests[2].options.body.expectedUpdatedAt, 'v1')
  h.requests[2].resolve({ inventory: { ...item, name: 'New feed', updatedAt: 'v2' } }); await editing
  await h.state.remove(item)
  assert.equal(h.requests.length, 3)
  h.state.deleting.value = item.id
  const removing = h.state.remove(item)
  await h.state.remove(item)
  assert.equal(h.requests.length, 4)
  for (const request of h.requests) {
    assert.equal(request.options.timeout, 15000, `${request.options.method || 'GET'} has a bounded timeout`)
    assert.equal(request.options.retry, 0, `${request.options.method || 'GET'} does not retry automatically`)
    assert.ok(request.options.signal instanceof AbortSignal)
  }
  h.requests[3].resolve({ ok: true }); await removing
  assert.equal(h.state.rows.value.length, 0)
  h.unmount()
})
test('failed save/conflict keeps typed form and edit version, failed delete keeps record', async () => {
  const h = harness(); await h.loaded([item])
  h.state.compose(item); h.state.form.name = 'Typed'
  const saving = h.state.save()
  h.requests.at(-1).reject({ data: { statusMessage: 'Item changed since last sync' } }); await saving
  assert.equal(h.state.form.name, 'Typed')
  assert.equal(h.state.dialogOpen.value, true)
  assert.match(h.state.error.value, /changed/)
  assert.equal(h.state.busy.value, false)
  const retry = h.state.save()
  assert.equal(h.requests.at(-1).options.body.expectedUpdatedAt, 'v1')
  h.requests.at(-1).reject(new Error('offline')); await retry
  h.state.deleting.value = item.id
  const removing = h.state.remove(item)
  h.requests.at(-1).reject(new Error('offline')); await removing
  assert.equal(h.state.rows.value.length, 1)
  assert.equal(h.state.deleting.value, item.id)
  h.unmount()
})
test('account switch aborts and clears old data, late mutation finally cannot clear new busy', async () => {
  const h = harness(); await h.loaded([item])
  h.state.compose(item)
  const oldSave = h.state.save()
  const oldRequest = h.requests.at(-1)
  h.props.user = { id: 'b', farmType: 'crops' }
  assert.equal(oldRequest.options.signal.aborted, true)
  assert.equal(h.state.rows.value.length, 0)
  assert.equal(h.state.dialogOpen.value, false)
  await h.loaded()
  h.state.compose(); Object.assign(h.state.form, { name: 'Account B', quantity: 1, threshold: 0 })
  const newSave = h.state.save()
  oldRequest.resolve({ inventory: item }); await oldSave
  assert.equal(h.state.busy.value, true)
  assert.equal(h.state.rows.value.length, 0)
  h.requests.at(-1).resolve({ inventory: { ...item, id: 'b' } }); await newSave
  assert.equal(h.state.rows.value[0].id, 'b')
  h.unmount()
})
test('late loads ignored on section switch and unmount, load failure supports retry', async () => {
  const h = harness()
  const first = h.requests[0]
  h.props.section = 'enterprises'
  first.resolve({ inventory: [item], enterprises: [item] }); await flush()
  assert.equal(h.state.loading.value, true)
  assert.equal(h.state.rows.value.length, 0)
  h.requests.at(-1).reject(new Error('offline')); await flush()
  assert.match(h.state.error.value, /load/)
  const retry = h.state.load()
  await h.loaded([]); await retry
  assert.equal(h.state.error.value, '')
  h.state.compose()
  assert.equal(h.state.form.kind, 'livestock')
  const last = h.state.load(); const request = h.requests.at(-1)
  h.unmount(); assert.equal(request.options.signal.aborted, true)
  request.resolve({ enterprises: [item] }); await last
  assert.equal(h.state.rows.value.length, 0)
})
test('failed add preserves composer, stale delete cannot remove another account record', async () => {
  const h = harness(); await h.loaded()
  h.state.compose(); Object.assign(h.state.form, { name: 'Seed', quantity: '.5', threshold: 0 })
  const saving = h.state.save()
  h.requests.at(-1).reject(new Error('offline')); await saving
  assert.equal(h.state.form.name, 'Seed')
  assert.equal(h.state.form.quantity, '.5')
  assert.equal(h.state.dialogOpen.value, true)
  h.state.rows.value = [item]; h.state.deleting.value = item.id
  const removing = h.state.remove(item); const request = h.requests.at(-1)
  h.props.user.id = 'other'
  await h.loaded([{ ...item, name: 'Other account' }])
  request.resolve({ ok: true }); await removing
  assert.equal(h.state.rows.value[0].name, 'Other account')
  h.unmount()
})
test('strict blanks and invalid numeric values never become zero, optional register quantity stays null', async () => {
  for (const value of ['', '  ', null, undefined, false, [], Infinity, NaN, '-1', '0x10', '1e3']) assert.throws(() => helpers.numericInput(value))
  assert.equal(helpers.numericInput('0'), 0)
  assert.equal(helpers.numericInput(' ', true), null)
  const h = harness(); await h.loaded(); h.state.compose(); h.state.form.quantity = ' '
  await h.state.save()
  assert.equal(h.requests.length, 1)
  assert.equal(h.state.busy.value, false)
  assert.match(h.state.error.value, /quantity/)
  h.unmount()
})
test('search, kind/status filtering and sorting preserve source and use actual stock/expiry', () => {
  const rows = [item, { id: 'two', name: 'Apples', quantity: 9, threshold: 1, notes: 'Orchard', expiresOn: '2000-01-01' }]
  assert.deepEqual(helpers.filterManagementRows(rows).map(r => r.id), ['two', 'one'])
  assert.deepEqual(helpers.filterManagementRows(rows, { search: ' ORCHARD ' }).map(r => r.id), ['two'])
  assert.deepEqual(helpers.filterManagementRows(rows, { filter: 'low' }).map(r => r.id), ['one'])
  assert.deepEqual(helpers.filterManagementRows(rows, { filter: 'expired' }).map(r => r.id), ['two'])
  assert.deepEqual(helpers.filterManagementRows(rows, { sort: 'quantity' }).map(r => r.id), ['one', 'two'])
  assert.equal(rows[0], item)
  assert.equal(helpers.filterManagementRows([{ kind: 'livestock', name: 'Cows' }], { section: 'enterprises', filter: 'crops' }).length, 0)
  assert.equal(helpers.filterManagementRows([{ status: 'draft', title: 'Case' }], { section: 'referrals', filter: 'draft' }).length, 1)
  assert.deepEqual(helpers.stockStatus({ quantity: 0, threshold: 0, expiresOn: '2026-10-24' }, new Date(2026, 9, 24)), { low: true, expired: false })
})
