import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createApp, defineEventHandler, toNodeListener } from 'h3'
import handler, { mutationGuard, authenticationClientIP, cookieOptions } from '../server/api/[...].js'

test('trusted platform Request preserves public origin, cookie security and per-client throttling', async () => {
  const saved = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  let original = new Request('http://127.0.0.1:8787/api/probe', { headers: { 'cf-connecting-ip': '203.0.113.10' } })
  const app = createApp({ debug: false })
  app.use(defineEventHandler(event => { event.context.cloudflare = { request: original } }))
  app.use(defineEventHandler(event => {
    mutationGuard(event)
    if (event.path === '/api/probe') return { ip: authenticationClientIP(event), secure: cookieOptions(event).secure }
  }))
  app.use(handler)
  const server = createServer(toNodeListener(app))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const request = (origin, headers = {}, path = '/api/probe') => fetch(base + path, { method: 'POST', headers: { host: '127.0.0.1', origin, 'content-type': 'application/json', ...headers }, body: '{}' })
  try {
    let response = await request('http://127.0.0.1:8787')
    assert.equal(response.status, 200, 'original platform port overrides Nitro localFetch hostname')
    assert.deepEqual(await response.json(), { ip: '203.0.113.10', secure: false })
    for (const origin of ['https://127.0.0.1:8787', 'http://127.0.0.1', 'https://evil.test', 'null']) {
      assert.equal((await request(origin, { 'x-forwarded-host': 'evil.test', 'x-forwarded-proto': 'https' })).status, 403)
    }
    original = new Request('https://farm.example.test/api/probe', { headers: { 'cf-connecting-ip': '2001:db8::1' } })
    response = await request('https://farm.example.test', { 'cf-connecting-ip': '198.51.100.5', 'x-forwarded-for': '198.51.100.6' })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ip: '2001:db8::1', secure: true })
    assert.equal((await request('https://evil.test', { host: 'evil.test' })).status, 403, 'Host spoof cannot override platform origin')
    assert.equal((await request('https://farm.example.test', { 'sec-fetch-site': 'cross-site' })).status, 403)
    for (let index = 0; index < 20; index++) assert.equal((await request('https://farm.example.test', { 'x-forwarded-for': `192.0.2.${index}` }, '/api/auth/login')).status, 400)
    assert.equal((await request('https://farm.example.test', {}, '/api/auth/login')).status, 429)
    original = new Request('https://farm.example.test/api/auth/login', { headers: { 'cf-connecting-ip': '2001:db8::2' } })
    assert.equal((await request('https://farm.example.test', {}, '/api/auth/login')).status, 400, 'different edge client has separate limiter bucket')
    original = null
    response = await request(base, { 'cf-connecting-ip': '203.0.113.99', 'x-forwarded-for': '198.51.100.10', host: new URL(base).host })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).ip, '127.0.0.1', 'Node clients cannot spoof edge or forwarded IP')
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    if (saved === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = saved
  }
})
