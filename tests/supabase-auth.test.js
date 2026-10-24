import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp, defineEventHandler, toNodeListener } from 'h3'

// All SDK traffic is intercepted at its fetch boundary. No cloud requests or emails.
test('Supabase auth with real h3 middleware and mocked official SDK transport', async t => {
  const saved = { ...process.env }
  const dir = await mkdtemp(join(tmpdir(), 'farmbuddy-auth-'))
  process.env.FARMBUDDY_DATA_FILE = join(dir, 'store.json')
  process.env.FARMBUDDY_DATABASE = 'local'
  process.env.FARMBUDDY_AUTH = 'supabase'
  process.env.SUPABASE_URL = 'https://auth.example.test'
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_secret'
  process.env.APP_URL = 'https://farm.example.test'
  const { default: handler, authenticated } = await import('../server/api/[...].js')
  const { default: middleware } = await import('../server/middleware/supabase-auth.js')
  const { store } = await import('../server/utils/store.js')
  const { confirmationRedirect } = await import('../server/utils/supabase-auth.js')
  const id = 'd65f5d10-4c1f-4b2a-b2d8-792111127abc'
  let email = 'farmer@example.test'
  let confirmation = false
  let bad = false
  let offline = false
  let transportFailure = ''
  let calls = []
  const jwt = payload => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.c2lnbmF0dXJl`
  const access = jwt({ exp: Math.floor(Date.now() / 1000) + 3600, sub: id })
  const session = () => ({ access_token: access, refresh_token: 'refresh-secret', token_type: 'bearer', expires_in: 3600, user: { id, email } })
  const mockFetch = async (url, init) => {
    assert.ok(init.signal, 'provider request must be timeout bounded')
    assert.equal(init.redirect, 'error', 'provider credentials must never follow redirects')
    if (transportFailure === 'redirect') return new Response(null, { status: 302, headers: { location: 'https://evil.test' } })
    if (transportFailure === 'length') return new Response('PRIVATE', { headers: { 'content-length': '1048577' } })
    if (transportFailure === 'chunked') return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(700000))
        controller.enqueue(new Uint8Array(400000))
        controller.close()
      },
    }))
    calls.push({ url: String(url), body: init.body && JSON.parse(init.body) })
    if (offline) return Response.json({ message: 'PRIVATE provider failure sb_publishable_test_secret' }, { status: 503 })
    if (bad || (String(url).endsWith('/user') && init.headers.Authorization === 'Bearer expired')) return Response.json({ message: 'PRIVATE bad credentials', code: 'bad_jwt' }, { status: 400 })
    if (String(url).includes('/logout')) return new Response(null, { status: 204 })
    if (String(url).endsWith('/user')) return Response.json({ id, email, user_metadata: { id: 'attacker', role: 'admin', name: '<script>', farmName: 'Verified Display Farm', farmType: 'mixed', onboardingCompleted: true } })
    if (String(url).includes('/signup') && confirmation) return Response.json({ id, email, identities: [] })
    return Response.json(session())
  }
  const app = createApp({ debug: false })
  app.use(defineEventHandler(event => { event.context.supabaseAuthFetch = mockFetch }))
  app.use(middleware)
  app.use(defineEventHandler(event => {
    if (['/', '/login', '/register', '/dashboard'].includes(event.path)) return { page: true }
  }))
  app.use(handler)
  const server = createServer(toNodeListener(app))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const request = async (path, method = 'GET', input, cookie, extra = {}) => {
    const response = await fetch(base + path, { method, headers: { ...(input ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...extra }, body: input ? JSON.stringify(input) : undefined })
    return { status: response.status, body: await response.json(), cookies: response.headers.getSetCookie() }
  }
  const login = () => request('/api/auth/login', 'POST', { email, password: 'password123' })
  const cookie = `farmbuddy_access=${access}; farmbuddy_refresh=refresh-secret`
  try {
    await t.test('public configuration and trusted redirect', async () => {
      assert.deepEqual((await request('/api/auth/config')).body, { mode: 'supabase', configured: true })
      assert.equal(confirmationRedirect(), 'https://farm.example.test/login')
      process.env.APP_URL = 'http://evil.example.test'
      assert.throws(confirmationRedirect, /configuration/)
      process.env.APP_URL = 'https://farm.example.test'
    })
    await t.test('confirmation signup never maps fake provider identity', async () => {
      confirmation = true
      const result = await request('/api/auth/register', 'POST', { email, password: 'password123', name: 'Farmer' })
      assert.equal(result.body.requiresEmailConfirmation, true)
      assert.equal(result.body.user, undefined)
      assert.equal(result.cookies.length, 0)
      assert.equal(await store(data => data.users.length), 0)
      confirmation = false
    })
    let userId
    await t.test('confirmed signup verifies identity and private projection', async () => {
      const result = await request('/api/auth/register', 'POST', { email, password: 'password123', name: 'Farmer', farmName: 'Green Farm', farmType: 'mixed', supabaseId: 'attacker' })
      assert.equal(result.status, 200)
      userId = result.body.user.id
      assert.equal(result.body.user.name, 'Farmer')
      assert.equal(result.body.user.supabaseId, undefined)
      assert.equal(JSON.stringify(result.body).includes('secret'), false)
      assert.equal(result.cookies.length, 2)
      for (const value of result.cookies) assert.match(value, /HttpOnly.*SameSite=Lax/i)
      assert.equal(await store(data => data.users[0].supabaseId), id)
      assert.ok(calls.some(call => call.url.endsWith('/user')))
    })
    await t.test('login preserves mapping rather than trusting metadata/email changes', async () => {
      email = 'changed@example.test'
      const result = await login()
      assert.equal(result.body.user.id, userId)
      assert.equal(result.body.user.name, 'Farmer')
      assert.equal((await request('/api/auth/me', 'GET', undefined, cookie)).body.user.id, userId)
      assert.equal((await request('/api/farm', 'GET', undefined, cookie)).status, 200)
      assert.equal((await request('/api/auth/me', 'GET', undefined, 'farmbuddy_session=' + 'a'.repeat(64))).status, 401)
      assert.throws(() => authenticated({ users: [{ supabaseId: id }], sessions: [] }, { context: { farmbuddyAuth: { id } } }), /Authentication required/)
    })
    await t.test('production provider cookies are Secure and never expose session JSON', async () => {
      const previous = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
      try {
        const result = await login()
        assert.equal(result.status, 200)
        for (const value of result.cookies) assert.match(value, /; Secure/)
        assert.equal(JSON.stringify(result.body).includes('access_token'), false)
        assert.equal(JSON.stringify(result.body).includes('refresh-secret'), false)
        assert.equal(JSON.stringify(result.body).includes('sb_publishable'), false)
      } finally {
        if (previous === undefined) delete process.env.NODE_ENV
        else process.env.NODE_ENV = previous
      }
    })
    await t.test('expired access refreshes and verifies exactly once across middleware and handler', async () => {
      calls = []
      const result = await request('/api/auth/me', 'GET', undefined, 'farmbuddy_access=expired; farmbuddy_refresh=refresh-secret')
      assert.equal(result.status, 200)
      assert.equal(result.cookies.length, 2)
      assert.equal(calls.filter(call => call.url.includes('grant_type=refresh_token')).length, 1)
      assert.equal(calls.filter(call => call.url.endsWith('/user')).length, 2)
    })
    await t.test('SSR refresh coordinates concurrent requests and writes browser cookies', async () => {
      calls = []
      const stale = 'farmbuddy_access=expired; farmbuddy_refresh=ssr-refresh-secret'
      const results = await Promise.all([request('/dashboard', 'GET', undefined, stale), request('/api/auth/me', 'GET', undefined, stale)])
      for (const result of results) {
        assert.equal(result.status, 200)
        assert.equal(result.cookies.length, 2)
      }
      assert.equal(calls.filter(call => call.url.includes('grant_type=refresh_token')).length, 1)
      const before = calls.length
      await request('/dashboard', 'GET', undefined, stale)
      assert.equal(calls.filter(call => call.url.includes('grant_type=refresh_token')).length, 1)
      assert.ok(calls.length > before, 'cached refresh is still provider-verified per request')
    })
    await t.test('farm ownership remains enforced', async () => {
      await store(data => data.records.push({ id: 'other-record', userId: 'other-user', title: 'private' }), true)
      const result = await request('/api/farm', 'GET', undefined, cookie)
      assert.deepEqual(result.body.records, [])
      const created = await request('/api/farm/records', 'POST', { title: 'Own', category: 'activity' }, cookie)
      assert.equal(created.status, 200)
      assert.equal(created.body.record.userId, undefined)
    })
    await t.test('bad credentials and CSRF are sanitized', async () => {
      bad = true
      const result = await login()
      assert.equal(result.status, 401)
      assert.equal(JSON.stringify(result.body).includes('PRIVATE'), false)
      bad = false
      const before = calls.length
      assert.equal((await request('/api/auth/login', 'POST', { email, password: 'password123' }, undefined, { origin: 'https://evil.test' })).status, 403)
      assert.equal(calls.length, before)
    })
    await t.test('direct catchall requests also resolve verified identity', async () => {
      const direct = createApp()
      direct.use(defineEventHandler(event => { event.context.supabaseAuthFetch = mockFetch }))
      direct.use(handler)
      const isolated = createServer(toNodeListener(direct))
      await new Promise(resolve => isolated.listen(0, '127.0.0.1', resolve))
      try {
        const response = await fetch(`http://127.0.0.1:${isolated.address().port}/api/auth/me`, { headers: { cookie } })
        assert.equal(response.status, 200)
        assert.equal((await response.json()).user.id, userId)
      } finally { await new Promise(resolve => isolated.close(resolve)) }
    })
    await t.test('provider transport rejects redirects and oversized declared or chunked bodies', async () => {
      for (const kind of ['redirect', 'length', 'chunked']) {
        transportFailure = kind
        const result = await request('/api/auth/me', 'GET', undefined, cookie)
        assert.equal(result.status, 503, kind)
        assert.equal(JSON.stringify(result.body).includes('PRIVATE'), false)
        assert.equal(JSON.stringify(result.body).includes('sb_publishable'), false)
      }
      transportFailure = ''
    })
    await t.test('configuration whitespace is trimmed before privileged credential checks', async () => {
      const previousUrl = process.env.SUPABASE_URL
      const previousKey = process.env.SUPABASE_PUBLISHABLE_KEY
      try {
        process.env.SUPABASE_URL = '  https://auth.example.test  '
        process.env.SUPABASE_PUBLISHABLE_KEY = '  sb_publishable_test_secret  '
        assert.deepEqual((await request('/api/auth/config')).body, { mode: 'supabase', configured: true })
        assert.equal((await request('/api/auth/me', 'GET', undefined, cookie)).status, 200)
        for (const key of ['  sb_secret_forbidden  ', `  ${jwt({ role: 'service_role' })}  `]) {
          process.env.SUPABASE_PUBLISHABLE_KEY = key
          assert.deepEqual((await request('/api/auth/config')).body, { mode: 'supabase', configured: false })
          assert.equal((await request('/api/auth/me', 'GET', undefined, cookie)).status, 503)
        }
      } finally {
        process.env.SUPABASE_URL = previousUrl
        process.env.SUPABASE_PUBLISHABLE_KEY = previousKey
      }
    })
    await t.test('later confirmed login uses sanitized display metadata only', async () => {
      await store(data => { data.users = [] }, true)
      const result = await login()
      assert.equal(result.status, 200)
      assert.equal(result.body.user.name, '')
      assert.equal(result.body.user.farmName, 'Verified Display Farm')
      assert.equal(result.body.user.onboardingCompleted, false)
      assert.equal(result.body.user.role, undefined)
      assert.notEqual(result.body.user.id, 'attacker')
    })
    await t.test('same-email legacy account cannot be taken over', async () => {
      await store(data => { data.users = [{ id: 'legacy', email, name: 'Legacy' }] }, true)
      const result = await login()
      assert.equal(result.status, 409)
      assert.equal(result.cookies.length, 0)
      assert.equal(await store(data => data.users[0].id), 'legacy')
    })
    await t.test('logout revokes only local provider session and clears cookies', async () => {
      calls = []
      const result = await request('/api/auth/logout', 'POST', {}, cookie)
      assert.equal(result.status, 200)
      assert.ok(calls.some(call => call.url.endsWith('/logout?scope=local')))
      assert.ok(result.cookies.some(value => value.includes('farmbuddy_access=;')))
    })
    await t.test('unavailable logout clears cookies and safely reports failure', async () => {
      offline = true
      for (const page of ['/', '/login', '/register', '/dashboard']) assert.equal((await request(page, 'GET', undefined, cookie)).status, 200)
      assert.equal((await request('/api/farm', 'GET', undefined, cookie)).status, 503)
      const result = await request('/api/auth/logout', 'POST', {}, cookie)
      assert.equal(result.status, 503)
      assert.ok(result.cookies.length >= 2)
      assert.equal(JSON.stringify(result.body).includes('PRIVATE'), false)
      offline = false
    })
    await t.test('explicit missing configuration fails closed without leaking keys', async () => {
      delete process.env.SUPABASE_PUBLISHABLE_KEY
      delete process.env.SUPABASE_ANON_KEY
      for (const page of ['/', '/login', '/register', '/dashboard']) assert.equal((await request(page, 'GET', undefined, cookie)).status, 200)
      const missing = await request('/api/auth/me', 'GET', undefined, cookie)
      assert.equal(missing.status, 503)
      assert.match(JSON.stringify(missing.body), /SUPABASE_URL.*SUPABASE_PUBLISHABLE_KEY/)
      assert.equal((await request('/api/farm', 'GET', undefined, cookie)).status, 503)
      const loggedOut = await request('/api/auth/logout', 'POST', {}, cookie)
      assert.equal(loggedOut.status, 503)
      assert.ok(loggedOut.cookies.length >= 2)
      assert.deepEqual((await request('/api/auth/config')).body, { mode: 'supabase', configured: false })
      process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_secret_forbidden'
      assert.equal((await login()).status, 503)
      process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_secret'
      process.env.FARMBUDDY_AUTH = 'typo'
      assert.equal((await request('/api/auth/me')).status, 503)
      process.env.FARMBUDDY_AUTH = 'supabase'
      process.env.SUPABASE_URL = 'https://auth.example.test/unsafe'
      assert.equal((await request('/api/auth/me')).status, 503)
      process.env.FARMBUDDY_AUTH = 'local'
      assert.equal((await request('/api/auth/config')).body.mode, 'local')
    })
  } finally {
    await new Promise(resolve => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
    Object.assign(process.env, saved)
  }
})
