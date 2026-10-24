import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { createApp, toNodeListener, getRequestURL } from 'h3'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { changeProduction, planningView } from '../server/utils/farm-production.js'
import { emptyWorkspace } from '../server/utils/farm-workspace.js'

function fixture(role = 'owner') {
  const data = { enterprises: [{ id: 'herd', userId: 'owner' }, { id: 'foreign', userId: 'other' }], inventory: [{ quantity: 12 }], records: [] }
  const ctx = { farmId: 'owner', user: { id: role }, role, workspace: emptyWorkspace('owner') }
  const apply = input => changeProduction(data, ctx, input)
  return { data, ctx, apply }
}
const seasonInput = { action: 'season.create', name: 'Dairy herd', kind: 'livestock', startsOn: '2026-01-01', endsOn: '2026-12-31' }
test('production links plots and register, stores schedules and animal history without stock mutations', () => {
  const { data, ctx, apply } = fixture()
  const plot = apply({ action: 'plot.create', name: 'North', coordinates: [[7, 3], [7.1, 3], [7.1, 3.1]], areaHa: 5 })
  const { seasonId } = apply({ ...seasonInput, plotId: plot.plotId, enterpriseId: 'herd' })
  apply({ action: 'schedule.create', seasonId, date: '2026-03-02', title: 'Check herd' })
  ctx.role = 'worker'
  for (const type of ['health', 'breeding', 'feeding', 'production', 'observation', 'planting']) apply({ action: 'event.create', seasonId, type, date: '2026-03-02', quantity: 2, unit: 'head', note: 'Group A' })
  const view = planningView(data, ctx)
  assert.equal(view.plots.length, 1)
  assert.equal(view.seasons[0].schedule[0].title, 'Check herd')
  assert.equal(view.events.length, 6)
  assert.equal(data.inventory[0].quantity, 12)
  assert.deepEqual(data.records, [])
  view.plots[0].coordinates[0][0] = 80
  assert.equal(ctx.workspace.plots[0].coordinates[0][0], 7)
  assert.equal(view.commands, undefined)
})
test('invalid input and cross-farm references never mutate the workspace', () => {
  const { ctx, apply } = fixture()
  const { seasonId } = apply(seasonInput)
  const before = JSON.stringify(ctx.workspace)
  const invalid = [
    { action: 'plot.create', name: 'Crossing', coordinates: [[0, 0], [3, 3], [0, 3], [2, 0]] },
    { action: 'plot.create', name: 'Repeated', coordinates: [[0, 0], [0, 1], [1, 1], [0, 1], [1, 0]] },
    { ...seasonInput, enterpriseId: 'foreign' }, { ...seasonInput, plotId: 'missing' },
    { ...seasonInput, startsOn: '2026-02-30' }, { ...seasonInput, endsOn: '2025-01-01' }, { ...seasonInput, kind: 'unknown' },
    ...[[[7, 3], [7, 3], [8, 4]], [[0, 0], [1, 1], [2, 2]], [[91, 0], [0, 1], [0, 0]], [['7', 3], [8, 3], [8, 4]], Array(101).fill([0, 0])].map(coordinates => ({ action: 'plot.create', name: 'Bad', coordinates })),
    { action: 'schedule.create', seasonId, date: '2027-01-01', title: 'Outside' },
    { action: 'schedule.create', seasonId: 'foreign', date: '2026-03-01', title: 'Foreign' },
    ...[{ quantity: 0 }, { quantity: -1 }, { quantity: '2' }, { quantity: Infinity }, { quantity: 1, unit: '' }, { type: 'harvest' }, { note: '<script>' }].map(fields => ({ action: 'event.create', seasonId, date: '2026-03-01', type: 'health', unit: 'head', ...fields })),
    { action: 'harvest.create', seasonId, quantity: 3 }
  ]
  for (const input of invalid) {
    assert.throws(() => apply(input), error => [400, 404].includes(error.statusCode), JSON.stringify(input))
    assert.equal(JSON.stringify(ctx.workspace), before)
  }
})
test('production enforces role permissions and bounded lists', () => {
  for (const role of ['worker', 'viewer', 'unknown']) {
    const { apply } = fixture(role)
    assert.throws(() => apply(seasonInput), { statusCode: 403 })
  }
  const { ctx, apply } = fixture('manager')
  const { seasonId } = apply(seasonInput)
  ctx.role = 'viewer'
  assert.throws(() => apply({ action: 'event.create', seasonId, type: 'health', date: '2026-02-01' }), { statusCode: 403 })
  ctx.role = 'owner'
  ctx.workspace.seasons = Array(1000).fill({})
  assert.throws(() => apply(seasonInput), { statusCode: 409 })
})
test('management HTTP uses real auth, persists planning, rejects cross-farm access and deduplicates commands', async () => {
  const dir = await mkdtemp(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'production-http-'))
  process.env.FARMBUDDY_DATA_FILE = join(dir, 'store.json')
  process.env.NODE_ENV = 'production'
  const { default: auth } = await import('../server/api/[...].js')
  const { default: management } = await import('../server/api/management.js')
  const app = createApp().use(event => getRequestURL(event).pathname === '/api/management' ? management(event) : auth(event))
  const server = createServer(toNodeListener(app))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const post = (path, input, cookie) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base.replace('http:', 'https:'), ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(input) })
  try {
    assert.equal((await fetch(base + '/api/management')).status, 401)
    const register = await post('/api/auth/register', { name: 'Production Test', email: 'production@example.test', password: 'production-test-password-long' })
    assert.equal(register.status, 200)
    const cookie = register.headers.get('set-cookie').split(';')[0]
    const input = { ...seasonInput, commandId: randomUUID() }
    const saved = await post('/api/management', input, cookie)
    assert.equal(saved.status, 200)
    const snapshot = await saved.json()
    const seasonId = snapshot.planning.seasons[0].id
    assert.equal((await post('/api/management', input, cookie)).status, 200)
    assert.equal((await post('/api/management', { ...input, name: 'Changed' }, cookie)).status, 409)
    const invalid = await post('/api/management', { action: 'schedule.create', commandId: randomUUID(), seasonId, title: 'Invalid', date: '2027-01-01' }, cookie)
    assert.equal(invalid.status, 400)
    const event = await post('/api/management', { action: 'event.create', commandId: randomUUID(), seasonId, type: 'health', date: '2026-03-01', note: 'Herd check' }, cookie)
    assert.equal(event.status, 200)
    const current = await (await fetch(base + '/api/management', { headers: { Cookie: cookie } })).json()
    assert.equal(current.planning.seasons.length, 1)
    assert.equal(current.planning.events.length, 1)
    assert.equal(current.planning.seasons[0].schedule.length, 0)
    const second = await post('/api/auth/register', { name: 'Other Farmer', email: 'production-other@example.test', password: 'production-test-password-long' })
    const otherCookie = second.headers.get('set-cookie').split(';')[0]
    assert.equal((await fetch(base + `/api/management?farmId=${snapshot.farm.id}`, { headers: { Cookie: otherCookie } })).status, 403)
  } finally {
    await new Promise(resolve => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
  }
})
