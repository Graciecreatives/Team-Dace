import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createApp, createRouter, toNodeListener } from 'h3'
import * as Vue from 'vue'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import { changeBusiness, businessView, moneyMinor } from '../server/utils/farm-business.js'
import { emptyWorkspace } from '../server/utils/farm-workspace.js'
import { newCommandId } from '../app/utils/offline-workspace.js'

function fixture() {
  const workspace = emptyWorkspace('owner')
  workspace.seasons.push({ id: 'season', name: 'Maize' })
  const ctx = { user: { id: 'owner' }, farmId: 'owner', role: 'owner', workspace }
  const data = { users: [{ id: 'owner', name: 'Owner', farmName: 'Green Acre Farm' }], records: [], inventory: [{ id: 'stock', userId: 'owner', name: 'Maize', quantity: 10, unit: 'kg' }, { id: 'foreign', userId: 'other', quantity: 20 }], marketplaceProducts: [{ id: 'product', ownerId: 'owner', quantity: 99, currency: 'NGN' }, { id: 'usd-product', ownerId: 'owner', currency: 'USD' }, { id: 'other-product', ownerId: 'other' }] }
  const sale = { action: 'orders.create', seasonId: 'season', inventoryId: 'stock', quantity: 1.5, unitPrice: 10.01, customer: 'Buyer', date: '2026-10-24' }
  return { data, ctx, sale, run: input => changeBusiness(data, ctx, input) }
}
function rejectedWithoutMutation(f, input, status) {
  const before = JSON.stringify([f.data, f.ctx.workspace])
  assert.throws(() => f.run(input), error => error.statusCode === status)
  assert.equal(JSON.stringify([f.data, f.ctx.workspace]), before)
}
test('strict minor-unit money, half-up rounding and safe total bounds', () => {
  for (const value of [0, -1, '1', NaN, Infinity, 1.001, 0.0001, 1e10]) assert.throws(() => moneyMinor(value))
  assert.equal(moneyMinor(10.01), 1001)
  assert.equal(moneyMinor(0.29), 29)
  const f = fixture()
  f.run(f.sale)
  assert.equal(f.ctx.workspace.orders[0].amountMinor, 1502)
  rejectedWithoutMutation(f, { ...f.sale, quantity: 1e9, unitPrice: 1e9 }, 400)
  rejectedWithoutMutation(f, { ...f.sale, quantity: 0.000001, unitPrice: 0.01 }, 400)
})
test('harvest, confirmation exactly once, immutable invoices and delivery', () => {
  const f = fixture()
  const initialTimestamp = '2026-01-01T00:00:00.000Z'
  f.data.inventory[0].updatedAt = initialTimestamp
  f.run({ action: 'harvest.create', seasonId: 'season', inventoryId: 'stock', quantity: 5, date: '2026-10-24', note: 'Harvest' })
  const harvestTimestamp = f.data.inventory[0].updatedAt
  assert.ok(harvestTimestamp > initialTimestamp)
  assert.equal(f.data.inventory[0].quantity, 15)
  assert.equal(f.ctx.workspace.events[0].type, 'harvest')
  assert.equal(f.ctx.workspace.movements.length, 1)
  const { id } = f.run({ ...f.sale, productId: 'product' })
  const row = f.ctx.workspace.orders[0]
  assert.equal(f.data.inventory[0].quantity, 15)
  assert.equal(f.data.records.length, 0)
  rejectedWithoutMutation(f, { action: 'orders.deliver', id, status: 'delivered' }, 409)
  const invoice = row.invoiceId
  assert.equal(row.sellerName, 'Green Acre Farm')
  assert.equal(row.currency, 'NGN')
  f.data.users[0].farmName = 'Renamed Farm'
  assert.equal(row.sellerName, 'Green Acre Farm', 'seller snapshot stays stable after farm rename')
  f.run({ action: 'orders.confirm', id, amountMinor: 1, quantity: 999 })
  const confirmedTimestamp = f.data.inventory[0].updatedAt
  assert.ok(confirmedTimestamp > harvestTimestamp)
  f.run({ action: 'orders.confirm', id })
  assert.equal(f.data.inventory[0].updatedAt, confirmedTimestamp)
  assert.equal(f.data.inventory[0].quantity, 13.5)
  assert.equal(f.data.records.length, 1)
  assert.equal(f.data.records[0].amount, 15.02)
  assert.equal(f.ctx.workspace.movements.length, 2)
  assert.equal(row.quantity, 1.5)
  assert.equal(row.invoiceId, invoice)
  assert.equal(f.data.marketplaceProducts[0].quantity, 99)
  rejectedWithoutMutation(f, { action: 'orders.cancel', id }, 409)
  rejectedWithoutMutation(f, { action: 'orders.deliver', id, status: 'invalid' }, 400)
  f.run({ action: 'orders.deliver', id, status: 'dispatched', reference: 'Truck 1' })
  f.run({ action: 'orders.deliver', id, status: 'delivered' })
  assert.equal(row.invoiceId, invoice)
  assert.equal(row.delivery.status, 'delivered')
  assert.equal(f.data.records.length, 1)
})
test('ownership, roles, insufficient stock, validation and cancellation never partially mutate', () => {
  const f = fixture()
  for (const input of [{ ...f.sale, seasonId: 'foreign' }, { ...f.sale, inventoryId: 'foreign' }, { ...f.sale, productId: 'other-product' }]) rejectedWithoutMutation(f, input, 404)
  rejectedWithoutMutation(f, { ...f.sale, productId: 'usd-product' }, 400)
  for (const input of [{ ...f.sale, quantity: -1 }, { ...f.sale, quantity: '1' }, { ...f.sale, date: '2026-02-30' }, { ...f.sale, customer: '<script>' }]) rejectedWithoutMutation(f, input, 400)
  for (const role of ['worker', 'viewer']) { f.ctx.role = role; rejectedWithoutMutation(f, f.sale, 403); assert.equal(businessView(f.data, f.ctx), null) }
  f.ctx.role = 'manager'
  const { id } = f.run({ ...f.sale, quantity: 20 })
  rejectedWithoutMutation(f, { action: 'orders.confirm', id }, 409)
  f.run({ action: 'orders.cancel', id })
  rejectedWithoutMutation(f, { action: 'orders.confirm', id }, 409)
  rejectedWithoutMutation(f, { action: 'harvest.create', seasonId: 'season', inventoryId: 'stock', quantity: 1e9, date: '2026-10-24' }, 400)
})
test('expenses and reports isolate farms and separate unallocated totals', () => {
  const f = fixture()
  f.run({ action: 'expense.create', seasonId: 'season', amount: 2.99, title: 'Seed', date: '2026-10-23' })
  f.run({ action: 'orders.confirm', id: f.run(f.sale).id })
  f.data.records.push({ userId: 'owner', category: 'income', amount: 5 }, { userId: 'other', category: 'income', amount: 1000 })
  const reports = businessView(f.data, f.ctx).reports
  assert.equal(reports.currency, 'NGN')
  assert.deepEqual(reports.overall, { incomeMinor: 2002, expenseMinor: 299, profitMinor: 1703 })
  assert.equal(reports.seasons[0].profitMinor, 1203)
  assert.equal(reports.unallocated.incomeMinor, 500)
  assert.equal(f.data.records[0].date, '2026-10-23')
})
test('business Vue component compiles script, template and print styles', async () => {
  const source = await readFile(new URL('../app/components/FarmBusiness.vue', import.meta.url), 'utf8')
  const { descriptor, errors } = parse(source)
  assert.ok(source.includes('Unit price (NGN)'))
  assert.ok(source.includes('Amount (NGN)'))
  assert.ok(source.includes('Cash sale invoice (NGN)'))
  assert.ok(source.includes('Seller: {{ invoice.sellerName'))
  assert.ok(source.includes('Nigerian naira (NGN)'))
  assert.ok(source.includes('aria-label="Business record type"'))
  for (const label of ['Record paid sale', 'Save unpaid order', 'Decrease sale quantity', 'Increase sale quantity', 'Walk-in customer', 'Choose product', 'Sale details', 'Total paid']) assert.ok(source.includes(label), label)
  assert.ok(source.includes("send('orders.record', sale)"))
  assert.ok(source.includes('prefers-reduced-motion:reduce'))
  assert.ok(!source.includes('Harvest to cash workflow'), 'text-heavy workflow has been replaced with action tiles')
  assert.ok(source.includes('aria-label="Get ready to record"'))
  assert.ok(source.includes('v-if="!stock.length && canAddStock"'), 'inventory navigation is only shown for the current user’s farm')
  assert.ok(!source.includes('Create a season in Production and a stock item in Inventory before'))
  for (const name of ['harvest', 'sale', 'expense']) assert.ok(source.includes(`<template v-if="activeTab === '${name}'">`))
  assert.ok(!source.includes('farm currency'))
  assert.deepEqual(errors, [])
  const script = compileScript(descriptor, { id: 'business' })
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'FarmBusiness.vue', id: 'business', compilerOptions: { bindingMetadata: script.bindings } }).errors, [])
  for (const style of descriptor.styles) assert.deepEqual(compileStyle({ source: style.content, filename: 'FarmBusiness.vue', id: 'business', scoped: style.scoped }).errors, [])
})
test('business mounted lifecycle preserves in-flight edits and scopes successful receipts', async () => {
  const source = await readFile(new URL('../app/components/FarmBusiness.vue', import.meta.url), 'utf8')
  const { descriptor } = parse(source)
  const props = Vue.reactive({ state: {}, busy: false, currentUserId: 'owner' })
  const commands = []
  const navigation = []
  const compiled = compileScript(descriptor, { id: 'business-lifecycle' }).content
    .replace(/^import \{([^}]+)\} from 'vue'\n/m, 'const {$1} = Vue\n')
    .replace(/^import .* from .*\n/gm, '')
    .replace('export default', 'return')
  const component = new Function('Vue', 'FbTabs', 'FbButton', 'FbPageHeader', 'FbDialog', 'Sprout', 'Package', 'Receipt', 'Banknote', 'Plus', 'Truck', 'Printer', 'newCommandId', compiled)(Vue, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, newCommandId)
  // Mount with Vue's real renderer so watcher scheduling and unmount disposal
  // are exercised, rather than invoking watchers outside a component lifecycle.
  const renderer = Vue.createRenderer({
    createComment: () => ({}), createText: () => ({}), createElement: () => ({}),
    insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {},
    parentNode: () => null, nextSibling: () => null
  })
  let drafts
  const setup = component.setup
  component.setup = (props, context) => { drafts = setup(props, context); return drafts }
  component.render = () => null
  const app = renderer.createApp({ setup() {
    return () => Vue.h(component, { state: props.state, busy: props.busy, currentUserId: props.currentUserId, onCommand: payload => commands.push(payload), onNavigate: destination => navigation.push(destination) })
  } })
  app.mount({})
  try {
    props.state = { planning: { seasons: [{ id: 'season', name: 'Maize' }] }, inventory: [{ id: 'stock', name: 'Maize', quantity: 10, unit: 'kg' }] }
    await Vue.nextTick()
    assert.equal(drafts.editorOpen.value, false, 'forms start closed')
    drafts.openEditor('sale')
    assert.equal(drafts.activeTab.value, 'sale')
    assert.equal(drafts.editorOpen.value, true)
    drafts.sale.seasonId = 'season'
    assert.equal(drafts.choicesReady.value, false, 'sale needs stock before revealing details')
    drafts.sale.inventoryId = 'stock'
    assert.equal(drafts.choicesReady.value, true)
    await drafts.continueEditor()
    assert.equal(drafts.detailsOpen.sale, true)
    drafts.sale.customer = 'Kept after close'
    await drafts.backToChoices()
    assert.equal(drafts.detailsOpen.sale, false)
    assert.equal(drafts.sale.customer, 'Kept after close')
    await drafts.closeEditor()
    drafts.openEditor('sale')
    assert.equal(drafts.sale.customer, 'Kept after close')
    props.busy = true
    await Vue.nextTick()
    await drafts.closeEditor()
    await drafts.backToChoices()
    assert.equal(drafts.editorOpen.value, true, 'busy work cannot close editor')
    drafts.openEditor('expense')
    assert.equal(drafts.activeTab.value, 'sale', 'busy work cannot switch editor')
    props.busy = false
    await Vue.nextTick()
    Object.assign(drafts.harvest, { seasonId: 'season', inventoryId: 'stock', quantity: '2', note: 'Keep until confirmed' })
    drafts.sale.customer = 'Unsaved customer'
    drafts.expense.title = 'Unsaved expense'
    drafts.send('harvest.create', drafts.harvest)
    await Vue.nextTick()
    assert.equal(commands[0].quantity, 2)
    assert.equal(drafts.harvest.quantity, '2', 'emitting or offline enqueue must not clear draft')
    props.state = { error: 'Rejected' }
    await Vue.nextTick()
    assert.equal(drafts.harvest.note, 'Keep until confirmed')
    props.state = { lastCommandId: 'confirmed-1', result: { action: 'harvest.create' } }
    await Vue.nextTick()
    assert.equal(drafts.harvest.quantity, '')
    assert.equal(drafts.editorOpen.value, true, 'a harvest receipt must not close the unrelated sale editor')
    assert.equal(drafts.sale.customer, 'Unsaved customer')
    assert.equal(drafts.expense.title, 'Unsaved expense')
    drafts.harvest.note = 'Next draft'
    props.state = { lastCommandId: 'confirmed-1', result: { action: 'harvest.create', alreadyApplied: true } }
    await Vue.nextTick()
    assert.equal(drafts.harvest.note, 'Next draft', 'same receipt must not clear a later draft')
    props.state = { lastCommandId: 'confirmed-2', result: { action: 'orders.create' } }
    await Vue.nextTick()
    assert.equal(drafts.sale.customer, 'Unsaved customer', 'unsubmitted sales survive unrelated receipts')
    drafts.sale.quantity = '1'
    drafts.sale.unitPrice = '2'
    drafts.send('orders.create', drafts.sale)
    drafts.sale.customer = 'Edited during request'
    props.state = { lastCommandId: 'confirmed-sale', result: { action: 'orders.create' } }
    await Vue.nextTick()
    assert.equal(drafts.sale.customer, 'Edited during request')
    assert.equal(drafts.editorOpen.value, true, 'edits made during a request keep their editor open')
    drafts.send('orders.create', drafts.sale)
    props.state = { lastCommandId: 'confirmed-sale-unchanged', result: { action: 'orders.create' } }
    await Vue.nextTick()
    assert.equal(drafts.sale.customer, '', 'unchanged submitted sale clears')
    assert.equal(drafts.editorOpen.value, false, 'matching successful sale closes its editor')
    Object.assign(drafts.harvest, { quantity: '4', note: 'Submitted' })
    drafts.send('harvest.create', drafts.harvest)
    drafts.harvest.note = 'Edited harvest'
    props.state = { lastCommandId: 'confirmed-harvest-edited', result: { action: 'harvest.create' } }
    await Vue.nextTick()
    assert.equal(drafts.harvest.note, 'Edited harvest')
    const count = commands.length
    drafts.expense.amount = 'not a number'
    drafts.send('expense.create', drafts.expense)
    assert.equal(commands.length, count, 'invalid amounts are never emitted')
    props.busy = true
    await Vue.nextTick()
    drafts.expense.amount = '3'
    drafts.send('expense.create', drafts.expense)
    assert.equal(commands.length, count, 'busy submissions are ignored')
    props.busy = false
    await Vue.nextTick()
    drafts.expense.amount = '3'
    drafts.send('expense.create', drafts.expense)
    props.state = { lastCommandId: 'confirmed-3', result: { action: 'expense.create' } }
    await Vue.nextTick()
    assert.equal(drafts.expense.title, '')
    drafts.delivery.order = { status: 'delivered', reference: 'Truck' }
    drafts.delivery.other = { reference: 'Unrelated draft' }
    drafts.send('orders.deliver', { id: 'order', status: 'delivered', reference: 'Truck' })
    props.state = { lastCommandId: 'wrong-order', result: { action: 'orders.deliver', id: 'other' } }
    await Vue.nextTick()
    assert.equal(drafts.delivery.order.reference, 'Truck')
    props.state = { lastCommandId: 'confirmed-4', result: { action: 'orders.deliver', id: 'order' } }
    await Vue.nextTick()
    assert.deepEqual(Object.keys(drafts.delivery), ['other'])
    drafts.send('orders.deliver', { id: 'other', status: 'delivered', reference: 'Unrelated draft' })
    drafts.delivery.other = { reference: 'Edited while saving' }
    props.state = { lastCommandId: 'confirmed-5', result: { action: 'orders.deliver', id: 'other' } }
    await Vue.nextTick()
    assert.equal(drafts.delivery.other.reference, 'Edited while saving')
    const saleState = { planning: { seasons: [{ id: 'season', name: 'Maize' }] }, inventory: [{ id: 'stock', name: 'Maize', quantity: 10, unit: 'kg' }] }
    props.state = saleState
    await Vue.nextTick()
    await drafts.openEditor('sale')
    assert.equal(drafts.sale.seasonId, 'season', 'single season is automatic')
    Object.assign(drafts.sale, { inventoryId: 'stock', quantity: '1.5', unitPrice: '10.01', customer: '' })
    assert.equal(drafts.saleTotal.value, 1502, 'preview uses decimal half-up rounding')
    drafts.sale.unitPrice = '0.29'
    drafts.sale.quantity = '1'
    assert.equal(drafts.saleTotal.value, 29)
    drafts.stepQuantity(1)
    assert.equal(drafts.sale.quantity, '2', 'stepper updates editable quantity')
    drafts.sale.unitPrice = '1.001'
    assert.equal(drafts.saleTotal.value, null, 'invalid money precision never shows a payable total')
    drafts.sale.unitPrice = '10.01'
    drafts.sale.quantity = '11'
    const beforeInvalidSale = commands.length
    drafts.send('orders.record', drafts.sale)
    assert.equal(commands.length, beforeInvalidSale, 'paid sales cannot exceed available stock')
    drafts.sale.quantity = '1.5'
    drafts.send('orders.record', drafts.sale)
    const paidSale = commands.at(-1)
    assert.equal(paidSale.customer, 'Walk-in customer')
    assert.equal(paidSale.action, 'orders.record')
    assert.ok(paidSale.commandId)
    props.state = { ...saleState, lastCommandId: 'unrelated-paid-sale', result: { action: 'orders.record' } }
    await Vue.nextTick()
    assert.equal(drafts.sale.quantity, '1.5', 'same-action receipt cannot clear another command draft')
    props.state = { ...saleState, lastCommandId: paidSale.commandId, result: { action: 'orders.record', id: 'paid-order' } }
    await Vue.nextTick()
    assert.equal(drafts.sale.quantity, '', 'exact paid-sale receipt clears its unchanged draft')
    assert.equal(drafts.editorOpen.value, false)
    drafts.send('harvest.create', drafts.harvest)
    props.state = { farm: { id: 'new-farm' } }
    await Vue.nextTick()
    assert.equal(drafts.editorOpen.value, false)
    assert.equal(drafts.deliveryEditor.value, '')
    assert.equal(drafts.harvest.note, '')
    assert.equal(drafts.sale.customer, '')
    assert.deepEqual(Object.keys(drafts.delivery), [])
    drafts.harvest.note = 'New farm draft'
    props.state = { farm: { id: 'new-farm' }, lastCommandId: 'late', result: { action: 'harvest.create' } }
    await Vue.nextTick()
    assert.equal(drafts.harvest.note, 'New farm draft')
    props.state = { farm: { id: 'owner' }, business: {}, planning: { seasons: [] }, inventory: [] }
    await Vue.nextTick()
    assert.equal(drafts.canAddStock.value, true)
    drafts.sale.customer = 'Keep while navigating'
    drafts.navigatePrerequisite('planning')
    drafts.navigatePrerequisite('inventory')
    assert.deepEqual(navigation, ['planning', 'inventory'], 'prerequisite buttons emit exact workspace destination strings')
    assert.equal(drafts.sale.customer, 'Keep while navigating', 'navigation does not discard the sale draft')
    props.busy = true
    await Vue.nextTick()
    drafts.navigatePrerequisite('planning')
    drafts.navigatePrerequisite('inventory')
    assert.equal(navigation.length, 2, 'busy commands prevent prerequisite navigation')
    props.busy = false
    props.state = { farm: { id: 'shared-farm' }, business: {}, planning: { seasons: [] }, inventory: [] }
    await Vue.nextTick()
    assert.equal(drafts.canAddStock.value, false, 'another farm cannot navigate to personal inventory')
    drafts.navigatePrerequisite('inventory')
    drafts.navigatePrerequisite('planning')
    assert.deepEqual(navigation, ['planning', 'inventory', 'planning'], 'shared farm planning remains actionable without misleading inventory navigation')
    props.currentUserId = ''
    props.state = { business: {}, planning: { seasons: [{ id: 'season' }] }, inventory: [{ id: 'stock' }] }
    await Vue.nextTick()
    assert.equal(drafts.canAddStock.value, false, 'missing identity never grants inventory navigation')
    drafts.navigatePrerequisite('planning')
    drafts.navigatePrerequisite('inventory')
    drafts.navigatePrerequisite('unknown')
    assert.equal(navigation.length, 3, 'completed prerequisites and unknown destinations do not navigate')
    props.state = { farm: { id: 'owner' }, business: null }
    props.currentUserId = 'owner'
    await Vue.nextTick()
    drafts.navigatePrerequisite('planning')
    drafts.navigatePrerequisite('inventory')
    assert.equal(navigation.length, 3, 'restricted business view has no navigation actions')
  } finally { app.unmount() }
})
test('real management HTTP cash-sale lifecycle, replay, rollback and authentication', async () => {
  const directory = await mkdtemp(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'business-'))
  process.env.FARMBUDDY_DATA_FILE = join(directory, 'store.json')
  process.env.NODE_ENV = 'production'
  const { default: auth } = await import('../server/api/[...].js')
  const { default: management } = await import('../server/api/management.js')
  const router = createRouter().use('/api/management', management).use('/api/**', auth)
  const server = createServer(toNodeListener(createApp().use(router)))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  async function request(path, method = 'GET', input, cookie, expected = 200) {
    const response = await fetch(base + path, { method, headers: { ...(method === 'GET' ? {} : { Origin: base.replace('http:', 'https:'), 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, body: input === undefined ? undefined : JSON.stringify(input) })
    const body = await response.json()
    assert.equal(response.status, expected, JSON.stringify(body))
    return { body, cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  try {
    await request('/api/management', 'GET', undefined, undefined, 401)
    const register = name => request('/api/auth/register', 'POST', { name, email: `${name}@business.example`, password: 'test-password-long', farmName: 'Farm', farmType: 'mixed' })
    const a = await register('Alice'), b = await register('Bob')
    const post = (input, expected = 200) => request('/api/management', 'POST', { commandId: randomUUID(), ...input }, a.cookie, expected)
    const createdStock = await request('/api/tools/inventory', 'POST', { name: 'Maize', quantity: 10, unit: 'kg', threshold: 0, expiresOn: '', notes: '' }, a.cookie)
    const stockId = createdStock.body.inventory.id
    assert.ok(stockId, JSON.stringify(createdStock.body))
    const planning = await post({ action: 'season.create', name: 'Maize season', kind: 'crops', startsOn: '2026-01-01', endsOn: '2026-12-31' })
    const seasonId = planning.body.planning.seasons[0].id
    const harvest = { commandId: randomUUID(), action: 'harvest.create', seasonId, inventoryId: stockId, quantity: 5, date: '2026-10-24' }
    const legacyTimestamp = createdStock.body.inventory.updatedAt
    const first = await post(harvest)
    const harvestedStore = JSON.parse(await readFile(process.env.FARMBUDDY_DATA_FILE, 'utf8'))
    const harvestedTimestamp = harvestedStore.inventory[0].updatedAt
    assert.ok(harvestedTimestamp > legacyTimestamp)
    await request(`/api/tools/inventory/${stockId}`, 'PATCH', { quantity: 100, expectedUpdatedAt: legacyTimestamp }, a.cookie, 409)
    await post(harvest)
    await post({ ...harvest, quantity: 6 }, 409)
    assert.equal(first.body.inventory[0].quantity, 15)
    const draft = await post({ action: 'orders.create', seasonId, inventoryId: stockId, quantity: 2, unitPrice: 10.01, customer: 'Buyer', date: '2026-10-24' })
    const id = draft.body.business.orders[0].id
    assert.equal(draft.body.business.orders[0].sellerName, 'Farm')
    assert.equal(draft.body.business.orders[0].currency, 'NGN')
    assert.equal(draft.body.business.reports.currency, 'NGN')
    const confirm = { commandId: randomUUID(), action: 'orders.confirm', id }
    await Promise.all([post(confirm), post({ action: 'orders.confirm', id })])
    await post(confirm)
    const again = await post({ action: 'orders.confirm', id })
    assert.equal(again.body.inventory[0].quantity, 13)
    assert.equal(again.body.business.reports.overall.incomeMinor, 2002)
    const before = await readFile(process.env.FARMBUDDY_DATA_FILE, 'utf8')
    await post({ action: 'orders.cancel', id }, 409)
    assert.equal(await readFile(process.env.FARMBUDDY_DATA_FILE, 'utf8'), before)
    await request(`/api/management?farmId=${again.body.farm.id}`, 'GET', undefined, b.cookie, 403)
    const persisted = JSON.parse(before)
    assert.equal(persisted.records.filter(r => r.sourceId === id).length, 1)
    assert.equal(persisted.farmWorkspaces[0].movements.length, 2)
    const delivered = await post({ action: 'orders.deliver', id, status: 'delivered', reference: 'Collection' })
    assert.equal(delivered.body.business.orders[0].invoiceId, draft.body.business.orders[0].invoiceId)
    assert.equal(delivered.body.business.orders[0].delivery.status, 'delivered')
    const expense = await post({ action: 'expense.create', seasonId, title: 'Seed', amount: 2.99, date: '2026-10-23' })
    assert.equal(expense.body.business.reports.overall.profitMinor, 1703)
    const tooLarge = await post({ action: 'orders.create', seasonId, inventoryId: stockId, quantity: 100, unitPrice: 1, customer: 'Buyer', date: '2026-10-24' })
    const tooLargeId = tooLarge.body.result.id
    const unchanged = await readFile(process.env.FARMBUDDY_DATA_FILE, 'utf8')
    await post({ action: 'orders.confirm', id: tooLargeId }, 409)
    await post({ action: 'expense.create', seasonId, title: 'Bad money', amount: 1.001, date: '2026-10-23' }, 400)
    assert.equal(await readFile(process.env.FARMBUDDY_DATA_FILE, 'utf8'), unchanged)
    const invitation = await post({ action: 'team.invite', email: 'Bob@business.example'.toLowerCase(), role: 'worker' })
    const token = invitation.body.result.token
    assert.ok(token, JSON.stringify(invitation.body.result))
    await request('/api/management', 'POST', { commandId: randomUUID(), action: 'team.accept', token }, b.cookie)
    const worker = await request(`/api/management?farmId=${again.body.farm.id}`, 'GET', undefined, b.cookie)
    assert.equal(worker.body.business, null)
    await request('/api/management', 'POST', { farmId: again.body.farm.id, commandId: randomUUID(), action: 'orders.confirm', id }, b.cookie, 403)
  } finally { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }) }
})
