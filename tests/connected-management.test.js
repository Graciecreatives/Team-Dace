import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp, toNodeListener, getRequestURL } from 'h3'

const directory = await mkdtemp(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'farmbuddy-connected-'))
process.env.FARMBUDDY_DATA_FILE = join(directory, 'store.json')
process.env.FARMBUDDY_AUTH = 'local'; process.env.FARMBUDDY_DATABASE = 'local'; process.env.NODE_ENV = 'production'
const { default: auth } = await import('../server/api/[...].js')
const { default: management } = await import('../server/api/management.js')
const app = createApp().use(event => getRequestURL(event).pathname === '/api/management' ? management(event) : auth(event))
const server = createServer(toNodeListener(app))
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`, origin = base.replace('http:', 'https:')
async function request(path, method = 'GET', input, cookie, status = 200, headers = {}) {
  const response = await fetch(base + path, { method, headers: { ...(method === 'GET' ? {} : { Origin: origin, 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: input === undefined ? undefined : JSON.stringify(input) })
  const value = await response.json()
  assert.equal(response.status, status, JSON.stringify(value))
  return { value, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}
const register = name => request('/api/auth/register', 'POST', { name, email: `${name.toLowerCase()}@example.test`, password: 'safe-temporary-test-password', farmName: `${name} farm`, farmType: 'mixed' })
const cmd = (cookie, farmId, action, fields = {}, status = 200) => request('/api/management', 'POST', { action, farmId, commandId: randomUUID(), ...fields }, cookie, status)

test('connected HTTP workflow: production, account permissions, offline replay, stock, cash and delivery', async () => {
  try {
    await request('/api/management', 'GET', undefined, undefined, 401)
    const owner = await register('Owner'), worker = await register('Worker'), outsider = await register('Outsider')
    const farmId = owner.value.user.id
    await request(`/api/management?farmId=${farmId}`, 'GET', undefined, outsider.cookie, 403)
    await request('/api/management', 'POST', { action: 'event.create', commandId: randomUUID() }, owner.cookie, 403, { Origin: 'https://evil.example' })
    const initial = (await request('/api/management', 'GET', undefined, owner.cookie)).value
    assert.equal(initial.farm.role, 'owner')
    const stock = (await request('/api/tools/inventory', 'POST', { name: 'Maize', quantity: 0, unit: 'kg', threshold: 2, notes: '' }, owner.cookie)).value.inventory
    const inputStock = (await request('/api/tools/inventory', 'POST', { name: 'Seed', quantity: 20, unit: 'kg', threshold: 2, notes: '' }, owner.cookie)).value.inventory
    const seasonState = (await cmd(owner.cookie, farmId, 'season.create', { name: 'Maize 2026', kind: 'crops', startsOn: '2026-10-01', endsOn: '2027-03-31' })).value
    const seasonId = seasonState.planning.seasons[0].id
    await cmd(owner.cookie, farmId, 'plot.create', { name: 'North field', coordinates: [[7.4, 3.9], [7.41, 3.9], [7.41, 3.91]], areaHa: 1.5 })
    await cmd(owner.cookie, farmId, 'schedule.create', { seasonId, title: 'Harvest target', date: '2027-03-01' })
    await cmd(owner.cookie, farmId, 'event.create', { seasonId, type: 'planting', date: '2026-10-24', note: 'Planting started' })
    const invite = (await cmd(owner.cookie, farmId, 'team.invite', { email: 'worker@example.test', role: 'worker' })).value.result.token
    assert.ok(invite)
    await cmd(outsider.cookie, outsider.value.user.id, 'team.accept', { token: invite }, 403)
    const acceptance = { action: 'team.accept', token: invite, commandId: randomUUID() }
    await request('/api/management', 'POST', acceptance, worker.cookie)
    const acceptedAgain = (await request('/api/management', 'POST', acceptance, worker.cookie)).value
    assert.equal(acceptedAgain.result.alreadyApplied, true)
    const workerView = (await request(`/api/management?farmId=${farmId}`, 'GET', undefined, worker.cookie)).value
    assert.equal(workerView.farm.role, 'worker'); assert.equal(workerView.business, null)
    assert.ok(!JSON.stringify(workerView).includes('tokenHash'))
    await cmd(worker.cookie, farmId, 'season.create', { name: 'Not allowed' }, 403)
    await cmd(worker.cookie, farmId, 'orders.create', {}, 403)
    const taskState = (await cmd(owner.cookie, farmId, 'tasks.create', { title: 'Sow maize', dueOn: '2026-10-25', assigneeId: worker.value.user.id, seasonId })).value
    const taskId = taskState.operations.tasks[0].id
    const use = { action: 'tasks.consume', farmId, commandId: randomUUID(), id: taskId, inventoryId: inputStock.id, quantity: 3 }
    await request('/api/management', 'POST', use, worker.cookie)
    await request('/api/management', 'POST', use, worker.cookie)
    await request('/api/management', 'POST', { ...use, quantity: 4 }, worker.cookie, 409)
    await cmd(worker.cookie, farmId, 'tasks.complete', { id: taskId, completed: true })
    await cmd(worker.cookie, farmId, 'tasks.consume', { id: taskId, inventoryId: inputStock.id, quantity: 1 }, 409)
    const harvest = { action: 'harvest.create', farmId, commandId: randomUUID(), seasonId, inventoryId: stock.id, quantity: 100, date: '2026-10-24', note: 'First batch' }
    await Promise.all([request('/api/management', 'POST', harvest, owner.cookie), request('/api/management', 'POST', harvest, owner.cookie)])
    const orderState = (await cmd(owner.cookie, farmId, 'orders.create', { seasonId, inventoryId: stock.id, quantity: 40, unitPrice: 12.25, customer: 'Local buyer', date: '2026-10-24' })).value
    const orderId = orderState.business.orders[0].id
    const confirmation = { action: 'orders.confirm', farmId, commandId: randomUUID(), id: orderId }
    await request('/api/management', 'POST', confirmation, owner.cookie)
    await request('/api/management', 'POST', confirmation, owner.cookie)
    await cmd(owner.cookie, farmId, 'orders.confirm', { id: orderId })
    await cmd(owner.cookie, farmId, 'orders.deliver', { id: orderId, status: 'delivered', reference: 'Delivered to gate' })
    await cmd(owner.cookie, farmId, 'expense.create', { seasonId, title: 'Labour', amount: 100, date: '2026-10-24', note: '' })
    const badOrder = (await cmd(owner.cookie, farmId, 'orders.create', { seasonId, inventoryId: stock.id, quantity: 1000, unitPrice: 1, customer: 'Too much', date: '2026-10-24' })).value.business.orders.at(-1)
    await cmd(owner.cookie, farmId, 'orders.confirm', { id: badOrder.id }, 409)
    const final = (await request('/api/management', 'GET', undefined, owner.cookie)).value
    assert.equal(final.inventory.find(row => row.id === stock.id).quantity, 60)
    assert.equal(final.inventory.find(row => row.id === inputStock.id).quantity, 17)
    assert.equal(final.planning.events.filter(row => row.type === 'harvest').length, 1)
    assert.equal(final.business.reports.seasons[0].incomeMinor, 49000)
    assert.equal(final.business.reports.seasons[0].expenseMinor, 10000)
    assert.equal(final.business.reports.seasons[0].profitMinor, 39000)
    assert.equal(final.business.orders[0].delivery.status, 'delivered')
    const farm = (await request('/api/farm', 'GET', undefined, owner.cookie)).value
    assert.equal(farm.records.filter(row => row.category === 'income').length, 1)
    await request(`/api/farm/records/${farm.records[0].id}`, 'DELETE', undefined, owner.cookie, 409)
    await request(`/api/tools/inventory/${stock.id}`, 'PATCH', { quantity: 5, expectedUpdatedAt: stock.updatedAt }, owner.cookie, 409)
    await request(`/api/tools/inventory/${stock.id}`, 'DELETE', undefined, owner.cookie, 409)
    await cmd(owner.cookie, farmId, 'team.remove', { userId: worker.value.user.id })
    await request(`/api/management?farmId=${farmId}`, 'GET', undefined, worker.cookie, 403)
    await request('/api/management', 'POST', use, worker.cookie, 403)
    const persisted = JSON.parse(await readFile(process.env.FARMBUDDY_DATA_FILE, 'utf8'))
    assert.equal(persisted.farmWorkspaces[0].orders[0].status, 'confirmed')
    assert.equal(persisted.farmWorkspaces[0].commands.filter(row => row.id === harvest.commandId).length, 1)
    console.log('PASS connected HTTP account access, idempotent concurrent harvest/sale, stock, seasonal cash profit and revocation')
  } finally { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }) }
})
