import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createApp, toNodeListener } from 'h3'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

test('farm records and reminders: authenticated atomic HTTP CRUD and persistence', async () => {
  const directory = await mkdtemp(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'farm-crud-'))
  const file = join(directory, 'store.json')
  const keys = ['FARMBUDDY_DATA_FILE', 'FARMBUDDY_AUTH', 'FARMBUDDY_DATABASE', 'NODE_ENV']
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  Object.assign(process.env, { FARMBUDDY_DATA_FILE: file, FARMBUDDY_AUTH: 'local', FARMBUDDY_DATABASE: 'local', NODE_ENV: 'development' })
  const { default: handler } = await import('../server/api/[...].js')
  let server
  let base
  async function start() {
    server = createServer(toNodeListener(createApp({ debug: false }).use(handler)))
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${server.address().port}`
  }
  async function stop() {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
  async function request(path, method = 'GET', input, cookie, status = 200, extra = {}) {
    const response = await fetch(base + path, { method, headers: { origin: base, 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...extra }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) })
    assert.equal(response.status, status, `${method} ${path}: ${await response.clone().text()}`)
    return { value: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  async function unchanged(operation) {
    const before = await readFile(file, 'utf8')
    await operation()
    assert.equal(await readFile(file, 'utf8'), before, 'Rejected request must not mutate persisted state')
  }
  try {
    await start()
    const register = email => request('/api/auth/register', 'POST', { name: 'Farmer', email, password: 'secure-test-password' })
    const owner = (await register('owner@example.test')).cookie
    const stranger = (await register('stranger@example.test')).cookie
    const record = (await request('/api/farm/records', 'POST', { title: 'Seed', category: 'expense', amount: 20, note: 'Initial' }, owner)).value.record
    const reminder = (await request('/api/farm/reminders', 'POST', { title: 'Water', date: '2028-02-29' }, owner)).value.reminder
    const rp = `/api/farm/records/${record.id}`
    const mp = `/api/farm/reminders/${reminder.id}`
    assert.equal(record.updatedAt, record.createdAt)
    assert.equal(reminder.updatedAt, reminder.createdAt)
    assert.equal(reminder.completed, false)
    assert.ok(!Object.hasOwn(record, 'userId'))
    for (const path of [rp, mp]) {
      await unchanged(() => request(path, 'PATCH', { title: 'No' }, undefined, 401))
      await unchanged(() => request(path, 'DELETE', undefined, undefined, 401))
      await unchanged(() => request(path, 'PATCH', { title: 'No' }, stranger, 404))
      await unchanged(() => request(path, 'DELETE', undefined, stranger, 404))
      await unchanged(() => request(path, 'PATCH', { title: 'No' }, owner, 403, { origin: 'https://evil.example' }))
      await unchanged(() => request(path, 'DELETE', undefined, owner, 403, { 'sec-fetch-site': 'cross-site' }))
    }
    const invalidCommon = [{}, { title: '' }, { title: null }, { title: 2 }, { title: '<b>unsafe</b>' }, { title: 'line\nbreak' }, { title: 'x'.repeat(201) }, { userId: 'other', title: 'No' }, { updatedAt: record.updatedAt }, { title: 'No', expectedUpdatedAt: null }, { title: 'No', expectedUpdatedAt: 'garbage' }]
    for (const path of [rp, mp]) for (const input of invalidCommon) await unchanged(() => request(path, 'PATCH', input, owner, 400))
    for (const input of [{ amount: null }, { amount: '20' }, { amount: -1 }, { amount: 1e12 + 1 }, { category: 'unknown' }, { note: {} }, { note: '<script>' }, { note: 'x'.repeat(2001) }, { title: 'Do not save', amount: false }]) await unchanged(() => request(rp, 'PATCH', input, owner, 400))
    for (const input of [{ date: '2027-02-29' }, { date: '0000-01-01' }, { date: '2028-13-01' }, { date: null }, { completed: 1 }, { completed: 'true' }, { title: 'Do not save', date: 'bad' }]) await unchanged(() => request(mp, 'PATCH', input, owner, 400))
    for (const [path, input] of [['/api/farm/records', { title: 'Bad', category: 'expense', amount: null }], ['/api/farm/reminders', { title: '<b>Bad</b>', date: '2028-02-29' }]]) await unchanged(() => request(path, 'POST', input, owner, 400))
    const edited = (await request(rp, 'PATCH', { title: ' Seed purchase ', category: 'income', amount: 0, note: '', expectedUpdatedAt: record.updatedAt }, owner)).value.record
    assert.equal(edited.title, 'Seed purchase')
    assert.equal(edited.amount, 0)
    assert.equal(edited.note, '')
    assert.equal(edited.createdAt, record.createdAt)
    assert.ok(edited.updatedAt > record.updatedAt)
    await unchanged(() => request(rp, 'PATCH', { title: 'Stale', expectedUpdatedAt: record.updatedAt }, owner, 409))
    const races = await Promise.all(['First', 'Second'].map(title => fetch(base + rp, { method: 'PATCH', headers: { origin: base, 'content-type': 'application/json', cookie: owner }, body: JSON.stringify({ title, expectedUpdatedAt: edited.updatedAt }) })))
    assert.deepEqual(races.map(response => response.status).sort(), [200, 409])
    const completed = (await request(mp, 'PATCH', { completed: true }, owner)).value.reminder
    assert.equal(completed.completed, true, 'Legacy completion-only PATCH works')
    const moved = (await request(mp, 'PATCH', { title: 'Water field', date: '2029-01-01', completed: false, expectedUpdatedAt: completed.updatedAt }, owner)).value.reminder
    assert.ok(moved.updatedAt > completed.updatedAt)
    await unchanged(() => request(mp, 'PATCH', { completed: true, expectedUpdatedAt: completed.updatedAt }, owner, 409))
    // Seed a real persisted linked workflow row and a legacy timestamp-less reminder.
    const snapshot = JSON.parse(await readFile(file, 'utf8'))
    snapshot.records.find(item => item.id === record.id).sourceId = 'workflow-sale'
    delete snapshot.reminders.find(item => item.id === reminder.id).updatedAt
    delete snapshot.reminders.find(item => item.id === reminder.id).createdAt
    await writeFile(file, JSON.stringify(snapshot))
    await unchanged(() => request(rp, 'PATCH', { title: 'Cannot edit linked' }, owner, 409))
    await unchanged(() => request(rp, 'DELETE', undefined, owner, 409))
    const legacy = (await request(mp, 'PATCH', { completed: true }, owner)).value.reminder
    assert.ok(Number.isFinite(Date.parse(legacy.updatedAt)))
    const expected = (await request('/api/farm', 'GET', undefined, owner)).value
    assert.equal(expected.records[0].sourceId, 'workflow-sale')
    assert.ok(expected.records[0].updatedAt)
    assert.ok(expected.reminders[0].updatedAt)
    assert.deepEqual((await request('/api/farm', 'GET', undefined, stranger)).value, { records: [], reminders: [] })
    await stop()
    await start()
    assert.deepEqual((await request('/api/farm', 'GET', undefined, owner)).value, expected, 'New HTTP server reads durable snapshot')
    await request(mp, 'DELETE', undefined, owner)
    await request(mp, 'DELETE', undefined, owner, 404)
    const manual = (await request('/api/farm/records', 'POST', { title: 'Manual', category: 'activity' }, owner)).value.record
    assert.equal(manual.amount, null)
    const future = JSON.parse(await readFile(file, 'utf8'))
    future.records.find(item => item.id === manual.id).updatedAt = '2099-01-01T00:00:00.000Z'
    await writeFile(file, JSON.stringify(future))
    const monotonic = (await request(`/api/farm/records/${manual.id}`, 'PATCH', { note: 'Future clock guard' }, owner)).value.record
    assert.equal(monotonic.updatedAt, '2099-01-01T00:00:00.001Z')
    await request(`/api/farm/records/${manual.id}`, 'DELETE', undefined, owner)
    assert.deepEqual((await request('/api/farm', 'GET', undefined, owner)).value.reminders, [])
  } finally {
    if (server?.listening) await stop()
    await rm(directory, { recursive: true, force: true })
    for (const key of keys) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]
  }
})
