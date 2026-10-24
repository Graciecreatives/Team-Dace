import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { scryptSync, pbkdf2Sync } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp, toNodeListener } from 'h3'
import { authConfig, hashPassword, verifyPassword } from '../server/utils/auth.js'

test('app auth configuration accepts local and Cloudflare only', () => {
  assert.deepEqual(authConfig({}), { mode: 'local', configured: true })
  assert.deepEqual(authConfig({ FARMBUDDY_DATABASE: 'cloudflare' }), { mode: 'cloudflare', configured: true })
  assert.equal(authConfig({ FARMBUDDY_AUTH: 'invalid' }).configured, false)
})

test('portable hashes verify and malformed hashes fail safely', async () => {
  const salt = '01'.repeat(16)
  const passwordHash = await hashPassword('correct-password', salt)
  assert.match(passwordHash, /^scrypt\$16384\$8\$5\$[a-f0-9]{128}$/)
  assert.equal(await verifyPassword('correct-password', { salt, passwordHash }), true)
  assert.equal(await verifyPassword('wrong-password', { salt, passwordHash }), false)
  for (const malformed of ['abc', 'f'.repeat(127), 'pbkdf2-sha256$999999999$' + 'f'.repeat(64)]) {
    assert.equal(await verifyPassword('password', { salt, passwordHash: malformed }), false)
  }
  assert.equal(await verifyPassword('password', null), false)
  const legacy = scryptSync('original-password', salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')
  assert.equal(await verifyPassword('original-password', { salt, passwordHash: legacy }), true)
  assert.equal(await verifyPassword('wrong-password', { salt, passwordHash: legacy }), false)
  const interim = 'pbkdf2-sha256$100000$' + pbkdf2Sync('interim-password', salt, 100000, 32, 'sha256').toString('hex')
  assert.equal(await verifyPassword('interim-password', { salt, passwordHash: interim }), true)
  assert.equal(await verifyPassword('wrong-password', { salt, passwordHash: interim }), false)
})

test('store-owned authentication over HTTP preserves sessions, CSRF, ownership and legacy passwords', async t => {
  const saved = { ...process.env }
  const directory = await mkdtemp(join(tmpdir(), 'farmbuddy-owned-auth-'))
  process.env.FARMBUDDY_DATA_FILE = join(directory, 'store.json')
  process.env.FARMBUDDY_DATABASE = 'local'
  process.env.FARMBUDDY_AUTH = 'local'
  process.env.NODE_ENV = 'production'
  const { default: handler } = await import('../server/api/[...].js')
  const { default: middleware } = await import('../server/middleware/auth.js')
  const { store } = await import('../server/utils/store.js')
  const app = createApp({ debug: false })
  app.use(middleware)
  app.use(handler)
  const server = createServer(toNodeListener(app))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const request = async (path, method = 'GET', input, cookie, headers = {}) => {
    const response = await fetch(base + path, { method, headers: { ...(input ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers }, body: input ? JSON.stringify(input) : undefined })
    return { status: response.status, body: await response.json(), cookies: response.headers.getSetCookie() }
  }
  const details = { name: 'Farmer', email: 'Farmer@example.test', password: 'original-password', farmType: 'mixed' }
  let cookie, userId
  try {
    await t.test('registration hashes passwords and uses secure opaque session cookies', async () => {
      assert.deepEqual((await request('/api/auth/config')).body, { mode: 'local', configured: true })
      const registered = await request('/api/auth/register', 'POST', details)
      assert.equal(registered.status, 200)
      userId = registered.body.user.id
      assert.equal(registered.body.user.email, 'farmer@example.test')
      assert.equal(registered.body.user.passwordHash, undefined)
      assert.equal(registered.cookies.length, 1)
      assert.match(registered.cookies[0], /HttpOnly/)
      assert.match(registered.cookies[0], /Secure/)
      assert.match(registered.cookies[0], /SameSite=Lax/i)
      cookie = registered.cookies[0].split(';')[0]
      const snapshot = await store(data => data)
      assert.match(snapshot.users[0].passwordHash, /^scrypt\$16384\$8\$5\$/)
      assert.equal(JSON.stringify(snapshot).includes(cookie.split('=')[1]), false)
      assert.equal((await request('/api/auth/me', 'GET', undefined, cookie)).body.user.id, userId)
      assert.equal((await request('/api/auth/register', 'POST', details)).status, 409)
    })
    await t.test('invalid credentials, forged identity and expired sessions are denied', async () => {
      assert.equal((await request('/api/auth/login', 'POST', { ...details, password: 'wrong-password' })).status, 401)
      assert.equal((await request('/api/auth/login', 'POST', { email: 'missing@example.test', password: 'wrong-password' })).status, 401)
      assert.equal((await request('/api/auth/me', 'GET', undefined, 'farmbuddy_session=' + 'a'.repeat(64))).status, 401)
      await store(data => { data.sessions[0].expiresAt = Date.now() - 1 }, true)
      assert.equal((await request('/api/auth/me', 'GET', undefined, cookie)).status, 401)
      const login = await request('/api/auth/login', 'POST', details)
      assert.equal(login.status, 200)
      cookie = login.cookies[0].split(';')[0]
    })
    await t.test('CSRF protection covers auth and farm mutations', async () => {
      for (const headers of [{ origin: 'https://evil.test' }, { 'sec-fetch-site': 'cross-site' }]) {
        assert.equal((await request('/api/auth/login', 'POST', details, cookie, headers)).status, 403)
        assert.equal((await request('/api/farm/records', 'POST', { title: 'bad', category: 'activity' }, cookie, headers)).status, 403)
      }
    })
    await t.test('permissions stay user-scoped', async () => {
      await store(data => data.records.push({ id: 'private-other', userId: 'someone-else', title: 'Private' }), true)
      assert.deepEqual((await request('/api/farm', 'GET', undefined, cookie)).body.records, [])
      const created = await request('/api/farm/records', 'POST', { title: 'Own', category: 'activity' }, cookie)
      assert.equal(created.status, 200)
      assert.equal(created.body.record.userId, undefined)
      assert.equal((await request('/api/farm', 'GET', undefined, cookie)).body.records.length, 1)
    })
    await t.test('legacy scrypt credentials upgrade only after successful login', async () => {
      const salt = 'ab'.repeat(16)
      const legacyHash = scryptSync(details.password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')
      await store(data => Object.assign(data.users[0], { salt, passwordHash: legacyHash }), true)
      assert.equal((await request('/api/auth/login', 'POST', { ...details, password: 'wrong-password' })).status, 401)
      assert.equal(await store(data => data.users[0].passwordHash), legacyHash)
      const login = await request('/api/auth/login', 'POST', details)
      assert.equal(login.status, 200)
      assert.equal(login.body.user.id, userId)
      assert.match(await store(data => data.users[0].passwordHash), /^scrypt\$16384\$8\$5\$/)
      cookie = login.cookies[0].split(';')[0]
      assert.equal((await request('/api/auth/login', 'POST', details)).status, 200)
      const interim = 'pbkdf2-sha256$100000$' + pbkdf2Sync(details.password, salt, 100000, 32, 'sha256').toString('hex')
      await store(data => { data.users[0].passwordHash = interim }, true)
      assert.equal((await request('/api/auth/login', 'POST', { ...details, password: 'wrong-password' })).status, 401)
      assert.equal(await store(data => data.users[0].passwordHash), interim)
      const migrated = await request('/api/auth/login', 'POST', details)
      assert.equal(migrated.status, 200)
      assert.equal(migrated.body.user.id, userId)
      assert.match(await store(data => data.users[0].passwordHash), /^scrypt\$16384\$8\$5\$/)
    })
    await t.test('session cap and configuration failures remain safe', async () => {
      await store(data => {
        for (let index = 0; index < 15; index++) data.sessions.push({ userId, tokenHash: String(index).padStart(64, '0'), expiresAt: Date.now() + 60000 })
      }, true)
      const login = await request('/api/auth/login', 'POST', details)
      assert.equal(login.status, 200)
      cookie = login.cookies[0].split(';')[0]
      assert.equal(await store(data => data.sessions.filter(session => session.userId === userId).length), 10)
      process.env.FARMBUDDY_AUTH = 'invalid'
      assert.deepEqual((await request('/api/auth/config')).body, { mode: 'invalid', configured: false })
      assert.equal((await request('/api/auth/me', 'GET', undefined, cookie)).status, 503)
      assert.equal((await request('/api/auth/login', 'POST', details)).status, 503)
      process.env.FARMBUDDY_AUTH = 'local'
    })
    await t.test('logout revokes persisted session', async () => {
      const result = await request('/api/auth/logout', 'POST', {}, cookie)
      assert.equal(result.status, 200)
      assert.match(result.cookies[0], /farmbuddy_session=;/)
      assert.equal((await request('/api/auth/me', 'GET', undefined, cookie)).status, 401)
    })
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    await rm(directory, { recursive: true, force: true })
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
    Object.assign(process.env, saved)
  }
})
