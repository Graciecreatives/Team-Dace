import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createApp, toNodeListener, getRequestURL } from 'h3'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { changeRoster, memberFields, roster } from '../server/utils/farm-team.js'

const person = { name: ' Ada ', role: 'Field lead', contact: '+234 123', responsibilities: 'Check irrigation', status: 'active' }
test('roster validates every bounded field and never grants privileges', () => {
  const user = { id: 'owner' }
  assert.deepEqual(roster(user), [])
  const result = changeRoster(user, { action: 'add', ...person, userId: 'victim', permissions: ['admin'] })
  assert.equal(result.members[0].name, 'Ada')
  assert.equal(result.members[0].permissions, undefined)
  const original = JSON.stringify(user)
  for (const invalid of [{ name: '' }, { name: 'x'.repeat(101) }, { role: 'x'.repeat(81) }, { contact: 'x'.repeat(151) }, { responsibilities: 'x'.repeat(601) }, { status: 'invited' }, { contact: '<script>' }, { name: 'bad\u0000' }, { role: {} }]) {
    assert.throws(() => memberFields({ ...person, ...invalid }), error => error.statusCode === 400)
  }
  assert.equal(JSON.stringify(user), original)
  assert.throws(() => changeRoster(user, { action: 'remove', id: 'missing' }), error => error.statusCode === 404)
  user.teamRoster = Array.from({ length: 100 }, (_, i) => ({ ...result.members[0], id: String(i) }))
  assert.throws(() => changeRoster(user, { action: 'add', ...person }), error => error.statusCode === 409)
})

test('HTTP roster enforces sessions, origin, ownership and persists without schema changes', async () => {
  const directory = await mkdtemp(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'farm-team-'))
  process.env.FARMBUDDY_DATA_FILE = join(directory, 'store.json')
  process.env.NODE_ENV = 'production'
  const { default: auth } = await import('../server/api/[...].js')
  const { default: team } = await import('../server/api/farm-team.js')
  const server = createServer(toNodeListener(createApp().use(event => getRequestURL(event).pathname === '/api/farm-team' ? team(event) : auth(event))))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  async function request(path, method = 'GET', input, cookie, status = 200, headers = {}) {
    const response = await fetch(base + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method === 'GET' ? {} : { Origin: base.replace('http:', 'https:'), 'Content-Type': 'application/json' }), ...headers }, body: input === undefined ? undefined : JSON.stringify(input) })
    const payload = await response.json()
    assert.equal(response.status, status, JSON.stringify(payload))
    assert.equal(response.headers.get('cache-control'), 'no-store')
    return { payload, cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  try {
    await request('/api/farm-team', 'GET', undefined, undefined, 401)
    await request('/api/farm-team', 'POST', { action: 'add', ...person }, undefined, 401)
    const register = email => request('/api/auth/register', 'POST', { name: 'Owner', email, password: 'test-password-for-roster' })
    const a = (await register('a@example.test')).cookie
    const b = (await register('b@example.test')).cookie
    assert.deepEqual((await request('/api/farm-team', 'GET', undefined, a)).payload, { members: [] })
    await request('/api/farm-team', 'POST', { action: 'add', ...person }, a, 403, { Origin: 'https://evil.example' })
    await request('/api/farm-team', 'POST', { action: 'add', ...person }, a, 403, { Origin: '' })
    await request('/api/farm-team', 'POST', { action: 'add', ...person }, a, 403, { 'Sec-Fetch-Site': 'cross-site' })
    await request('/api/farm-team', 'POST', { action: 'add', ...person }, a, 415, { 'Content-Type': 'text/plain' })
    await request('/api/farm-team', 'POST', { action: 'add', ...person, name: 'x'.repeat(17000) }, a, 413)
    const member = (await request('/api/farm-team', 'POST', { action: 'add', ...person, userId: 'other' }, a)).payload.members[0]
    assert.deepEqual((await request('/api/farm-team', 'GET', undefined, b)).payload.members, [])
    for (const action of ['edit', 'remove']) await request('/api/farm-team', 'POST', { action, ...person, id: member.id }, b, 404)
    const edited = await request('/api/farm-team', 'POST', { action: 'edit', ...person, id: member.id, name: 'Ada Updated', status: 'seasonal' }, a)
    assert.equal(edited.payload.members[0].name, 'Ada Updated')
    assert.equal(edited.payload.members[0].createdAt, member.createdAt)
    const persisted = JSON.parse(await readFile(process.env.FARMBUDDY_DATA_FILE, 'utf8'))
    assert.equal(persisted.version, 1)
    assert.equal(persisted.users[0].teamRoster[0].status, 'seasonal')
    assert.equal(persisted.users[1].teamRoster, undefined)
    await request('/api/farm-team', 'POST', { action: 'edit', ...person, id: member.id, status: 'admin' }, a, 400)
    assert.equal((await request('/api/farm-team', 'GET', undefined, a)).payload.members[0].status, 'seasonal')
    await request('/api/farm-team', 'POST', { action: 'remove', id: member.id }, a)
    assert.deepEqual((await request('/api/farm-team', 'GET', undefined, a)).payload.members, [])
    await request('/api/farm-team', 'PUT', {}, a, 405)
    await request('/api/auth/logout', 'POST', {}, a)
    await request('/api/farm-team', 'GET', undefined, a, 401)
  } finally {
    await new Promise(resolve => server.close(resolve))
    await rm(directory, { recursive: true, force: true })
  }
})
