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
  assert.ok(!source.includes('farm currency'))
  assert.deepEqual(errors, [])
  const script = compileScript(descriptor, { id: 'business' })
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'FarmBusiness.vue', id: 'business', compilerOptions: { bindingMetadata: script.bindings } }).errors, [])
  for (const style of descriptor.styles) assert.deepEqual(compileStyle({ source: style.content, filename: 'FarmBusiness.vue', id: 'business', scoped: style.scoped }).errors, [])
})
test('business form drafts reset only after the matching confirmed server receipt', async () => {
  const source = await readFile(new URL('../app/components/FarmBusiness.vue', import.meta.url), 'utf8')
  const { descriptor } = parse(source)
  const props = Vue.reactive({ state: {}, busy: false })
  const commands = []
  const body = descriptor.scriptSetup.content.replace(/^import .* from 'vue'\n/m, '')
  const setup = new Function('computed', 'nextTick', 'reactive', 'ref', 'watch', 'defineProps', 'defineEmits', `${body}\nreturn { harvest, sale, expense, delivery, send }`)
  const scope = Vue.effectScope()
  const drafts = scope.run(() => setup(Vue.computed, Vue.nextTick, Vue.reactive, Vue.ref, Vue.watch, () => props, () => (_, payload) => commands.push(payload)))
  try {
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
    assert.equal(drafts.sale.customer, 'Unsaved customer')
    assert.equal(drafts.expense.title, 'Unsaved expense')
    drafts.harvest.note = 'Next draft'
    props.state = { lastCommandId: 'confirmed-1', result: { action: 'harvest.create', alreadyApplied: true } }
    await Vue.nextTick()
    assert.equal(drafts.harvest.note, 'Next draft', 'same receipt must not clear a later draft')
    props.state = { lastCommandId: 'confirmed-2', result: { action: 'orders.create' } }
    await Vue.nextTick()
    assert.equal(drafts.sale.customer, '')
    props.state = { lastCommandId: 'confirmed-3', result: { action: 'expense.create' } }
    await Vue.nextTick()
    assert.equal(drafts.expense.title, '')
    drafts.delivery.order = { status: 'delivered', reference: 'Truck' }
    props.state = { lastCommandId: 'confirmed-4', result: { action: 'orders.deliver' } }
    await Vue.nextTick()
    assert.deepEqual(Object.keys(drafts.delivery), [])
  } finally { scope.stop() }
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
