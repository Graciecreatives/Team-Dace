import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createApp, toNodeListener, getRequestURL } from 'h3'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

test('health bulletin HTTP route authenticates before cache, validates input, guards origin and throttles', async () => {
  const dir = await mkdtemp(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'farmbuddy-health-http-'))
  process.env.FARMBUDDY_DATA_FILE = join(dir, 'store.json')
  process.env.NODE_ENV = 'production'
  const nativeFetch = globalThis.fetch
  let upstream = 0
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://gd.eppo.int/')) { upstream++; return new Response('<table><tr><td>2020/001</td><td><a href="/reporting/article-1">Old plant report</a></td><td>2020-01</td></tr></table>') }
    if (String(url).startsWith('https://www.woah.org/')) { upstream++; return new Response('<rss><channel></channel></rss>') }
    return nativeFetch(url, options)
  }
  const { default: auth } = await import('../server/api/[...].js')
  const { default: alerts } = await import('../server/api/health-alerts.post.js')
  const app = createApp().use(event => getRequestURL(event).pathname === '/api/health-alerts' ? alerts(event) : auth(event))
  const server = createServer(toNodeListener(app))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  async function post(path, value, cookie, origin = base.replace('http:', 'https:')) {
    return nativeFetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(value) })
  }
  const input = { latitude: 7.41234, longitude: 3.91234, countryCode: 'NG' }
  try {
    assert.equal((await post('/api/health-alerts', input)).status, 401)
    const registered = await post('/api/auth/register', { name: 'Health Test', email: 'health-test@example.test', password: 'temporary-health-test-password' })
    assert.equal(registered.status, 200)
    const cookie = registered.headers.get('set-cookie').split(';')[0]
    assert.equal((await post('/api/health-alerts', input, cookie, 'https://evil.example')).status, 403)
    for (const invalid of [{ ...input, latitude: 91 }, { ...input, longitude: '3.9' }, { ...input, countryCode: '../NG' }]) assert.equal((await post('/api/health-alerts', invalid, cookie)).status, 400)
    assert.equal(upstream, 0)
    const response = await post('/api/health-alerts', input, cookie)
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.deepEqual(result.items, [])
    assert.equal(result.sources.filter(source => source.status === 'ok').length, 2)
    assert.equal(upstream, 2)
    assert.equal((await post('/api/health-alerts', input, cookie)).status, 200)
    assert.equal(upstream, 2)
    assert.equal((await post('/api/health-alerts', input)).status, 401)
    for (let i = 0; i < 8; i++) assert.equal((await post('/api/health-alerts', input, cookie)).status, 200)
    assert.equal((await post('/api/health-alerts', input, cookie)).status, 429)
  } finally {
    globalThis.fetch = nativeFetch
    await new Promise(resolve => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
  }
})
