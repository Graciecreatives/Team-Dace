import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createApp, createRouter, toNodeListener } from 'h3'
import { changeBusiness } from '../server/utils/farm-business.js'
import { emptyWorkspace } from '../server/utils/farm-workspace.js'

function fixture() {
  const workspace = emptyWorkspace('owner')
  workspace.seasons.push({ id: 'season', name: 'Maize' })
  const ctx = { user: { id: 'owner' }, farmId: 'owner', role: 'owner', workspace }
  const data = { users: [{ id: 'owner', farmName: 'Green Farm' }], records: [], inventory: [{ id: 'stock', userId: 'owner', name: 'Maize', quantity: 10, unit: 'kg' }], marketplaceProducts: [{ id: 'product', ownerId: 'owner', currency: 'NGN', quantity: 99 }, { id: 'usd', ownerId: 'owner', currency: 'USD' }] }
  const sale = { action: 'orders.record', seasonId: 'season', inventoryId: 'stock', quantity: 1.5, unitPrice: 10.01, customer: 'Buyer', date: '2026-10-24' }
  return { data, ctx, sale, run: input => changeBusiness(data, ctx, input) }
}
function unchanged(f, input, status) {
  const before = JSON.stringify([f.data, f.ctx])
  assert.throws(() => f.run(input), error => error.statusCode === status)
  assert.equal(JSON.stringify([f.data, f.ctx]), before)
}
test('direct sale records confirmed invoice, stock and rounded cashbook once', () => {
  const f = fixture()
  const { id } = f.run({ ...f.sale, productId: 'product' })
  const row = f.ctx.workspace.orders[0]
  assert.equal(row.id, id)
  assert.equal(row.status, 'confirmed')
  assert.ok(row.confirmedAt)
  assert.equal(row.amountMinor, 1502)
  assert.equal(row.currency, 'NGN')
  assert.equal(row.productId, 'product')
  assert.equal(f.data.inventory[0].quantity, 8.5)
  assert.equal(f.data.marketplaceProducts[0].quantity, 99)
  assert.equal(f.data.records.length, 1)
  assert.equal(f.data.records[0].sourceId, id)
  assert.equal(f.data.records[0].amountMinor, 1502)
  assert.equal(f.data.records[0].date, f.sale.date)
  assert.equal(f.ctx.workspace.movements.length, 1)
  const invoice = JSON.stringify(row)
  f.data.users[0].farmName = 'Renamed'
  f.data.inventory[0].name = 'Renamed crop'
  f.run({ action: 'orders.confirm', id })
  assert.equal(JSON.stringify(row), invoice)
  assert.equal(f.data.records.length, 1)
  assert.equal(f.ctx.workspace.movements.length, 1)
  unchanged(f, { action: 'orders.cancel', id }, 409)
  unchanged(f, { action: 'orders.update', id, amountMinor: 1 }, 400)
})
test('direct domain validation and every history bound reject without partial mutation', () => {
  const f = fixture()
  for (const role of ['worker', 'viewer']) {
    f.ctx.role = role
    unchanged(f, f.sale, 403)
  }
  f.ctx.role = 'manager'
  for (const change of [{ quantity: 11 }, { quantity: 0 }, { quantity: 0.0000001 }, { quantity: 1e9, unitPrice: 1e9 }, { quantity: 0.000001, unitPrice: 0.01 }, { unitPrice: 1.001 }, { customer: '<script>' }, { date: '2026-02-30' }, { productId: 'usd' }]) unchanged(f, { ...f.sale, ...change }, change.quantity === 11 ? 409 : 400)
  for (const change of [{ seasonId: 'other' }, { inventoryId: 'other' }, { productId: 'other' }]) unchanged(f, { ...f.sale, ...change }, 404)
  for (const [target, key, count] of [[f.ctx.workspace, 'orders', 10000], [f.ctx.workspace, 'movements', 10000], [f.data, 'records', 20000]]) {
    target[key] = Array.from({ length: count }, () => ({ userId: 'owner' }))
    unchanged(f, f.sale, 409)
    target[key] = []
  }
  f.run({ ...f.sale, quantity: 10 })
  assert.equal(f.data.inventory[0].quantity, 0)
})
test('legacy draft create, cancel and confirm stay separate', () => {
  const f = fixture()
  const cancelled = f.run({ ...f.sale, action: 'orders.create' }).id
  assert.equal(f.data.records.length, 0)
  assert.equal(f.data.inventory[0].quantity, 10)
  f.run({ action: 'orders.cancel', id: cancelled })
  const draft = f.run({ ...f.sale, action: 'orders.create' }).id
  f.run({ action: 'orders.confirm', id: draft })
  assert.equal(f.ctx.workspace.orders[0].status, 'cancelled')
  assert.equal(f.ctx.workspace.orders[1].status, 'confirmed')
  assert.equal(f.data.records.length, 1)
})
test('real management HTTP direct sales enforce roles, rollback, replay and concurrency', async () => {
  const directory = await mkdtemp(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'direct-sale-'))
  process.env.FARMBUDDY_DATA_FILE = join(directory, 'store.json')
  process.env.NODE_ENV = 'production'
  const { default: auth } = await import('../server/api/[...].js')
  const { default: management } = await import('../server/api/management.js')
  const server = createServer(toNodeListener(createApp().use(createRouter().use('/api/management', management).use('/api/**', auth))))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  async function request(path, method = 'GET', input, cookie, expected = 200) {
    const response = await fetch(base + path, { method, headers: { ...(method === 'GET' ? {} : { Origin: base.replace('http:', 'https:'), 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, body: input === undefined ? undefined : JSON.stringify(input) })
    const body = await response.json()
    assert.equal(response.status, expected, JSON.stringify(body))
    return { body, cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  try {
    const register = name => request('/api/auth/register', 'POST', { name, email: `${name}@direct.example`, password: 'test-password-long', farmName: 'Farm', farmType: 'mixed' })
    const owner = await register('Owner'), worker = await register('Worker')
    const post = (input, expected = 200, cookie = owner.cookie) => request('/api/management', 'POST', { commandId: randomUUID(), ...input }, cookie, expected)
    const inventory = await request('/api/tools/inventory', 'POST', { name: 'Maize', quantity: 10, unit: 'kg', threshold: 0, expiresOn: '', notes: '' }, owner.cookie)
    const season = await post({ action: 'season.create', name: 'Season', kind: 'crops', startsOn: '2026-01-01', endsOn: '2026-12-31' })
    const farmId = season.body.farm.id
    const sale = { commandId: randomUUID(), action: 'orders.record', seasonId: season.body.planning.seasons[0].id, inventoryId: inventory.body.inventory.id, quantity: 2, unitPrice: 10.01, customer: 'Buyer', date: '2026-10-24' }
    await request('/api/management', 'POST', sale, undefined, 401)
    const replies = await Promise.all([post(sale), post(sale)])
    assert.equal(replies.filter(r => r.body.result.alreadyApplied).length, 1)
    const saved = await post(sale)
    assert.equal(saved.body.result.alreadyApplied, true)
    assert.equal(saved.body.business.orders.length, 1)
    assert.equal(saved.body.business.orders[0].status, 'confirmed')
    assert.equal(saved.body.inventory[0].quantity, 8)
    assert.equal(saved.body.business.reports.overall.incomeMinor, 2002)
    let before = await readFile(process.env.FARMBUDDY_DATA_FILE, 'utf8')
    await post({ ...sale, customer: 'Changed' }, 409)
    await post({ ...sale, commandId: randomUUID(), quantity: 9 }, 409)
    assert.equal(await readFile(process.env.FARMBUDDY_DATA_FILE, 'utf8'), before)
    const invite = await post({ action: 'team.invite', email: 'worker@direct.example', role: 'worker' })
    await post({ action: 'team.accept', token: invite.body.result.token }, 200, worker.cookie)
    before = await readFile(process.env.FARMBUDDY_DATA_FILE, 'utf8')
    await post({ ...sale, commandId: randomUUID(), farmId }, 403, worker.cookie)
    assert.equal(await readFile(process.env.FARMBUDDY_DATA_FILE, 'utf8'), before)
    // Distinct commands race for the remaining stock. Only one can commit.
    const concurrent = await Promise.all([1, 2].map(() => fetch(base + '/api/management', { method: 'POST', headers: { Origin: base.replace('http:', 'https:'), 'Content-Type': 'application/json', Cookie: owner.cookie }, body: JSON.stringify({ ...sale, commandId: randomUUID(), quantity: 5 }) })))
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409])
    const persisted = JSON.parse(await readFile(process.env.FARMBUDDY_DATA_FILE, 'utf8'))
    const ws = persisted.farmWorkspaces.find(w => w.id === farmId)
    assert.equal(ws.orders.length, 2)
    assert.equal(ws.movements.length, 2)
    assert.equal(persisted.records.filter(r => r.userId === farmId).length, 2)
    assert.equal(persisted.inventory.find(r => r.id === sale.inventoryId).quantity, 3)
    assert.equal(ws.commands.filter(c => c.action === 'orders.record').length, 2)
  } finally {
    await new Promise(resolve => server.close(resolve))
    await rm(directory, { recursive: true, force: true })
  }
})
