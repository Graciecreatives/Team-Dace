import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createApp, toNodeListener } from 'h3'

const directory = await mkdtemp(join(tmpdir(), 'farmbuddy-test-'))
process.env.FARMBUDDY_DATA_FILE = join(directory, 'store.json')
process.env.NODE_ENV = 'production'
const { default: handler } = await import('../api/[...].js')
const app = createApp().use(handler)
const server = createServer(toNodeListener(app))
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const origin = base.replace('http:', 'https:')
let checks = 0
async function request(path, method = 'GET', input, cookie, status = 200, extra = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { ...(method === 'GET' ? {} : { Origin: origin, 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...extra },
    body: input === undefined ? undefined : JSON.stringify(input),
  })
  const payload = await response.json()
  assert.equal(response.status, status, JSON.stringify(payload))
  assert.equal(response.headers.get('cache-control'), 'no-store')
  checks++
  return { payload, cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers }
}
const account = { name: 'Test Farmer', email: 'TEST@example.test', password: 'local-test-password', farmName: 'Test Farm', farmType: 'Mixed' }
try {
  await request('/api/auth/me', 'GET', undefined, undefined, 401)
  await request('/api/farm', 'GET', undefined, undefined, 401)
  await request('/api/auth/register', 'POST', account, undefined, 403, { Origin: 'https://evil.example' })
  await request('/api/auth/register', 'POST', account, undefined, 403, { Origin: 'null' })
  await request('/api/auth/register', 'POST', account, undefined, 403, { 'Sec-Fetch-Site': 'cross-site' })
  await request('/api/auth/register', 'POST', account, undefined, 415, { 'Content-Type': 'text/plain' })
  await request('/api/auth/register', 'POST', { ...account, name: 'x'.repeat(17000) }, undefined, 413)
  await request('/api/auth/register', 'POST', { ...account, password: 'short' }, undefined, 400)
  const streamed = await fetch(base + '/api/auth/register', {
    method: 'POST', duplex: 'half', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: (async function* () { yield '{"name":"'; yield 'x'.repeat(17000); yield '"}' })(),
  })
  assert.equal(streamed.status, 413)
  assert.equal((await fetch(base + '/api/auth/register', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{broken' })).status, 400)
  checks += 2
  const first = await request('/api/auth/register', 'POST', account)
  const a = first.cookie
  assert.match(first.headers.get('set-cookie'), /HttpOnly/i)
  assert.match(first.headers.get('set-cookie'), /SameSite=Lax/i)
  assert.match(first.headers.get('set-cookie'), /Secure/i)
  assert.deepEqual(Object.keys(first.payload.user).sort(), ['id', 'name', 'email', 'farmName', 'farmType', 'onboardingCompleted', 'location', 'mainEnterprises', 'preferredLanguage'].sort())
  assert.equal(first.payload.user.onboardingCompleted, false)
  assert.equal(first.payload.user.email, 'test@example.test')
  await request('/api/auth/register', 'POST', account, undefined, 409)
  await request('/api/auth/login', 'POST', { email: account.email, password: 'wrong' }, undefined, 401)
  await request('/api/auth/login', 'POST', { email: 'missing@example.test', password: 'wrong' }, undefined, 401)
  assert.equal((await request('/api/auth/me', 'GET', undefined, a)).payload.user.id, first.payload.user.id)
  assert.deepEqual((await request('/api/farm', 'GET', undefined, a)).payload, { records: [], reminders: [] })
  const b = (await request('/api/auth/register', 'POST', { ...account, email: 'second@example.test' })).cookie
  await request('/api/tools', 'GET', undefined, undefined, 401)
  const emptyTools = { enterprises: [], inventory: [], referrals: [], notes: [] }
  // Existing v1 stores have no tools arrays. Reads must migrate without losing base data.
  const oldStore = JSON.parse(await readFile(process.env.FARMBUDDY_DATA_FILE, 'utf8'))
  for (const key of Object.keys(emptyTools)) delete oldStore[key]
  await writeFile(process.env.FARMBUDDY_DATA_FILE, JSON.stringify(oldStore))
  assert.deepEqual((await request('/api/tools', 'GET', undefined, a)).payload, emptyTools)
  const samples = {
    enterprises: { kind: 'crops', name: 'Maize', quantity: 2.5, unit: 'acres', startedOn: '2028-02-29', notes: 'North field' },
    inventory: { name: 'Feed', quantity: 10, unit: 'kg', threshold: 12, expiresOn: '2027-01-01', notes: '' },
    referrals: { title: 'Leaf observations', professionalType: 'agronomist', summary: 'Yellow leaves. Ask about next steps.', contact: 'My local adviser', status: 'draft' },
    notes: { id: '11111111-1111-4111-8111-111111111111', title: 'Field walk', body: 'Observed growth' },
  }
  const singular = { enterprises: 'enterprise', inventory: 'inventory', referrals: 'referral', notes: 'note' }
  for (const [collection, input] of Object.entries(samples)) {
    const path = `/api/tools/${collection}`
    await request(path, 'POST', input, undefined, 401)
    await request(path, 'POST', input, a, 403, { Origin: 'https://evil.example' })
    await request(path, 'POST', { ...input, userId: 'forged' }, a, 400)
    await request(path, 'POST', { ...input, toString: 'forged' }, a, 400)
    const item = (await request(path, 'POST', input, a)).payload[singular[collection]]
    assert.equal(item.userId, undefined)
    assert.ok(item.createdAt && item.updatedAt)
    assert.deepEqual((await request('/api/tools', 'GET', undefined, b)).payload, emptyTools)
    await request(`${path}/${item.id}`, 'PATCH', { [collection === 'referrals' || collection === 'notes' ? 'title' : 'name']: 'Changed' }, b, 404)
    await request(`${path}/${item.id}`, 'DELETE', undefined, b, 404)
    const field = collection === 'referrals' || collection === 'notes' ? 'title' : 'name'
    const updated = (await request(`${path}/${item.id}`, 'PATCH', { [field]: 'Changed' }, a)).payload[singular[collection]]
    assert.equal(updated[field], 'Changed')
    await request(`${path}/${item.id}`, 'PATCH', { [field]: '' }, a, 400)
    await request(`${path}/${item.id}`, 'PATCH', { createdAt: 'forged' }, a, 400)
    const persistedTool = spawnSync(process.execPath, ['--input-type=module', '-e', `import { store } from './server/utils/store.js'; const item = await store(d => d.${collection}.find(i => i.id === '${item.id}')); if (item?.${field} !== 'Changed') process.exit(1)`], { env: process.env, encoding: 'utf8' })
    assert.equal(persistedTool.status, 0, persistedTool.stderr)
    if (collection === 'notes') {
      const concurrent = await Promise.all(Array.from({ length: 6 }, () => request(path, 'POST', input, a)))
      assert.ok(concurrent.every(result => result.payload.note.title === 'Changed'))
      assert.equal((await request('/api/tools', 'GET', undefined, a)).payload.notes.length, 1)
      const replay = (await request(path, 'POST', input, a)).payload.note
      assert.deepEqual(replay, updated, 'Offline replay must not overwrite a newer note')
      await request(`${path}/${item.id}`, 'PATCH', { title: 'Stale', expectedUpdatedAt: item.updatedAt }, a, 409)
      const other = (await request(path, 'POST', input, b)).payload.note
      assert.equal(other.title, input.title, 'Client UUID is scoped to user')
      await request(`${path}/${item.id}`, 'DELETE', undefined, b)
    }
    await request(`${path}/${item.id}`, 'DELETE', undefined, a)
    await request(`${path}/${item.id}`, 'DELETE', undefined, a, 404)
  }
  for (const [collection, invalids] of Object.entries({
    enterprises: [{ kind: 'fish' }, { quantity: -1 }, { quantity: '2' }, { quantity: 1e13 }, { startedOn: '2026-02-29' }, { name: '' }, { unit: 'x'.repeat(61) }],
    inventory: [{ quantity: null }, { quantity: -1 }, { threshold: -1 }, { threshold: '1' }, { expiresOn: '0000-01-01' }, { expiresOn: '2026-13-01' }],
    referrals: [{ professionalType: 'dealer' }, { status: 'sent' }, { summary: '' }, { contact: 'x'.repeat(301) }],
    notes: [{ id: 'bad' }, { title: '' }, { body: 'x'.repeat(10001) }, { updatedAt: 'client-time' }],
  })) for (const invalid of invalids) await request(`/api/tools/${collection}`, 'POST', { ...samples[collection], ...invalid }, a, 400)
  const optionalEnterprise = (await request('/api/tools/enterprises', 'POST', { kind: 'livestock', name: 'Hens' }, a)).payload.enterprise
  assert.equal(optionalEnterprise.quantity, null)
  await request(`/api/tools/enterprises/${optionalEnterprise.id}`, 'DELETE', undefined, a)
  const migrated = JSON.parse(await readFile(process.env.FARMBUDDY_DATA_FILE, 'utf8'))
  assert.ok(Object.keys(emptyTools).every(key => Array.isArray(migrated[key])))
  const validStore = JSON.stringify(migrated)
  for (const key of ['users', 'sessions', 'records', 'reminders', ...Object.keys(emptyTools)]) {
    await writeFile(process.env.FARMBUDDY_DATA_FILE, JSON.stringify({ ...migrated, [key]: {} }))
    await request('/api/tools', 'GET', undefined, a, 500)
  }
  await writeFile(process.env.FARMBUDDY_DATA_FILE, validStore)
  const profile = { farmName: ' New Farm ', farmType: 'poultry', onboardingCompleted: true, location: ' Accra ', mainEnterprises: ' Hens, ducks ', preferredLanguage: ' English ' }
  await request('/api/farm/profile', 'PATCH', profile, undefined, 401)
  await request('/api/farm/profile', 'PATCH', profile, a, 403, { Origin: 'https://evil.example' })
  for (const key of ['farmName', 'farmType', 'onboardingCompleted']) {
    const missing = { ...profile }
    delete missing[key]
    await request('/api/farm/profile', 'PATCH', missing, a, 400)
  }
  for (const invalid of [
    { farmName: '' }, { farmName: ' '.repeat(10) }, { farmName: 'x'.repeat(151) },
    { farmType: 'fish' }, { farmType: 'Crops' }, { farmType: null },
    { onboardingCompleted: false }, { onboardingCompleted: 'true' },
    { location: '<script>' }, { location: 'x'.repeat(201) }, { location: 2 }, { location: '\nAccra' },
    { mainEnterprises: 'x'.repeat(501) }, { preferredLanguage: 'x'.repeat(81) },
    { preferredLanguage: null }, { userId: first.payload.user.id }, { email: 'stolen@example.test' },
  ]) await request('/api/farm/profile', 'PATCH', { ...profile, ...invalid }, a, 400)
  assert.equal((await request('/api/auth/me', 'GET', undefined, a)).payload.user.onboardingCompleted, false)
  const saved = (await request('/api/farm/profile', 'PATCH', profile, a)).payload.user
  assert.equal(saved.farmType, 'livestock')
  assert.equal(saved.farmName, 'New Farm')
  assert.equal(saved.location, 'Accra')
  assert.equal(saved.mainEnterprises, 'Hens, ducks')
  assert.equal(saved.preferredLanguage, 'English')
  assert.equal(saved.onboardingCompleted, true)
  assert.deepEqual((await request('/api/auth/me', 'GET', undefined, a)).payload.user, saved)
  assert.equal((await request('/api/auth/me', 'GET', undefined, b)).payload.user.onboardingCompleted, false)
  for (const farmType of ['crops', 'mixed', 'livestock']) {
    const updated = (await request('/api/farm/profile', 'PATCH', { farmName: 'New Farm', farmType, onboardingCompleted: true }, a)).payload.user
    assert.equal(updated.farmType, farmType)
    assert.equal(updated.location, 'Accra', 'Omitted optional fields are preserved')
  }
  const persistedProfile = spawnSync(process.execPath, ['--input-type=module', '-e', `import { store } from './server/utils/store.js'; const user = await store(d => d.users.find(u => u.id === '${saved.id}')); if (!user.onboardingCompleted || user.location !== 'Accra' || user.mainEnterprises !== 'Hens, ducks') process.exit(1)`], { env: process.env, encoding: 'utf8' })
  assert.equal(persistedProfile.status, 0, persistedProfile.stderr)
  const legacy = JSON.parse(await readFile(process.env.FARMBUDDY_DATA_FILE, 'utf8'))
  delete legacy.users[1].onboardingCompleted
  await writeFile(process.env.FARMBUDDY_DATA_FILE, JSON.stringify(legacy))
  assert.equal((await request('/api/auth/me', 'GET', undefined, b)).payload.user.onboardingCompleted, false)
  const record = (await request('/api/farm/records', 'POST', { title: 'Harvest', category: 'income', amount: 42.5, note: 'Test only' }, a)).payload.record
  assert.deepEqual(Object.keys(record).sort(), ['id', 'title', 'category', 'amount', 'note', 'createdAt', 'updatedAt'].sort())
  assert.equal(record.updatedAt, record.createdAt)
  assert.equal((await request('/api/farm/records', 'POST', { title: 'Work', category: 'activity' }, a)).payload.record.amount, null)
  for (const amount of [-1, null, '12', 1e13]) await request('/api/farm/records', 'POST', { title: 'Bad', category: 'expense', amount }, a, 400)
  await request('/api/farm/records', 'POST', { title: 'Bad', category: 'other' }, a, 400)
  await request('/api/farm/records', 'POST', { title: 'x'.repeat(201), category: 'income' }, a, 400)
  const reminder = (await request('/api/farm/reminders', 'POST', { title: 'Water', date: '2028-02-29' }, a)).payload.reminder
  assert.deepEqual(Object.keys(reminder).sort(), ['id', 'title', 'date', 'completed', 'createdAt', 'updatedAt'].sort())
  assert.equal(reminder.updatedAt, reminder.createdAt)
  for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-1-01', '2026-10-23T10:00:00Z', '0000-01-01']) {
    await request('/api/farm/reminders', 'POST', { title: 'Bad', date }, a, 400)
  }
  assert.deepEqual((await request('/api/farm', 'GET', undefined, b)).payload, { records: [], reminders: [] })
  await request(`/api/farm/records/${record.id}`, 'DELETE', undefined, b, 404)
  await request(`/api/farm/reminders/${reminder.id}`, 'PATCH', { completed: true }, b, 404)
  await request(`/api/farm/reminders/${reminder.id}`, 'PATCH', { completed: 'true' }, a, 400)
  assert.equal((await request(`/api/farm/reminders/${reminder.id}`, 'PATCH', { completed: true }, a)).payload.reminder.completed, true)
  await Promise.all(Array.from({ length: 12 }, (_, i) => request('/api/farm/records', 'POST', { title: `Concurrent ${i}`, category: 'activity' }, a)))
  assert.equal((await request('/api/farm', 'GET', undefined, a)).payload.records.length, 14)
  let disk = JSON.parse(await readFile(process.env.FARMBUDDY_DATA_FILE, 'utf8'))
  const rawToken = a.split('=')[1]
  assert.ok(!JSON.stringify(disk).includes(rawToken))
  assert.ok(!JSON.stringify(disk).includes(account.password))
  assert.ok(disk.sessions.some(s => s.tokenHash === createHash('sha256').update(rawToken).digest('hex')))
  assert.match(disk.users[0].passwordHash, /^scrypt\$16384\$8\$5\$[a-f0-9]{128}$/)
  assert.equal(disk.users[0].salt.length, 32)
  // A separate process verifies persistence independently of the running handler.
  const restart = spawnSync(process.execPath, ['--input-type=module', '-e', `import { store } from './server/utils/store.js'; const count = await store(d => d.records.length); if (count !== 14) process.exit(1)`], { env: process.env, encoding: 'utf8' })
  assert.equal(restart.status, 0, restart.stderr)
  await request(`/api/farm/records/${record.id}`, 'DELETE', undefined, a)
  await request(`/api/farm/records/${record.id}`, 'DELETE', undefined, a, 404)
  const login = await request('/api/auth/login', 'POST', { email: account.email, password: account.password }, a)
  await request('/api/auth/me', 'GET', undefined, a, 401)
  const logout = await request('/api/auth/logout', 'POST', undefined, login.cookie)
  assert.deepEqual(logout.payload, { ok: true })
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/i)
  await request('/api/auth/me', 'GET', undefined, login.cookie, 401)
  disk = JSON.parse(await readFile(process.env.FARMBUDDY_DATA_FILE, 'utf8'))
  disk.sessions.forEach(s => { s.expiresAt = Date.now() - 1 })
  await writeFile(process.env.FARMBUDDY_DATA_FILE, JSON.stringify(disk))
  await request('/api/auth/me', 'GET', undefined, b, 401)
  await request('/api/auth/me', 'GET', undefined, 'farmbuddy_session=invalid', 401)
  // Failed storage must fail closed without replacing the file.
  await writeFile(process.env.FARMBUDDY_DATA_FILE, '{broken')
  await request('/api/auth/me', 'GET', undefined, b, 500)
  assert.equal(await readFile(process.env.FARMBUDDY_DATA_FILE, 'utf8'), '{broken')
  await writeFile(process.env.FARMBUDDY_DATA_FILE, JSON.stringify(disk))
  let limited = false
  for (let i = 0; i < 21; i++) {
    const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' })
    if (response.status === 429) {
      assert.ok(Number(response.headers.get('retry-after')) > 0)
      limited = true
      break
    }
  }
  assert.ok(limited, 'Authentication must be throttled')
  console.log(`PASS: ${checks} HTTP checks, cookie flags, stored secrets, concurrent writes, process persistence, expiration, corruption, and throttling`)
} finally {
  await new Promise(resolve => server.close(resolve))
  await rm(directory, { recursive: true, force: true })
}
