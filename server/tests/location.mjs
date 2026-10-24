import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createApp, toNodeListener, getRequestURL } from 'h3'
import { coordinates, distanceKm, forecastSummary } from '../utils/location.js'
const directory = await mkdtemp(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'farmbuddy-location-'))
process.env.FARMBUDDY_DATA_FILE = join(directory, 'store.json')
process.env.NODE_ENV = 'production'
process.env.OPENWEATHER_API_KEY = 'synthetic-weather-secret'
const { default: auth } = await import('../api/[...].js')
const { default: community } = await import('../api/community/index.js')
const { default: weather } = await import('../api/weather.post.js')
const clientFetch = globalThis.fetch
let providerCalls = 0, malformed = false, providerStatus = 200
// Synthetic upstream boundary only. No network forecast or paid providers are called.
globalThis.fetch = async (url, options) => {
  if (new URL(url).hostname === 'api.openweathermap.org') {
    assert.equal(new URL(url).pathname, '/data/2.5/forecast')
    assert.equal(new URL(url).searchParams.get('units'), 'metric')
    assert.equal(new URL(url).searchParams.get('appid'), 'synthetic-weather-secret')
    assert.equal(options.redirect, 'error')
    assert.ok(options.signal instanceof AbortSignal)
    assert.equal(new URL(url).searchParams.get('lat'), String(Math.round(Number(new URL(url).searchParams.get('lat')) * 10) / 10))
    providerCalls++
    if (providerStatus !== 200) return new Response('synthetic-weather-secret upstream private detail', { status: providerStatus })
    return Response.json(malformed ? { unexpected: true } : { cod: '200', city: { timezone: 3600 }, list: [
      { dt: 1792843200, main: { temp: 36, temp_min: 24, temp_max: 36, humidity: 70 }, wind: { speed: 4 }, rain: { '3h': 21 } },
      { dt: 1792886400, main: { temp: 30, temp_min: 22, temp_max: 30 } }
    ] })
  }
  return clientFetch(url, options)
}
const app = createApp().use(event => {
  const path = getRequestURL(event).pathname
  return path === '/api/community' ? community(event) : path === '/api/weather' ? weather(event) : auth(event)
})
const server = createServer(toNodeListener(app))
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`, origin = base.replace('http:', 'https:')
let checks = 0
async function request(path, method = 'GET', input, cookie, status = 200, headers = {}) {
  const response = await clientFetch(base + path, { method, headers: { ...(method === 'GET' ? {} : { Origin: origin, 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: input === undefined ? undefined : JSON.stringify(input) })
  const result = await response.json()
  assert.equal(response.status, status, JSON.stringify(result)); checks++
  return { body: result, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}
async function register(name) { return request('/api/auth/register', 'POST', { name, email: `${name}@example.test`, password: 'synthetic-test-password', farmName: `${name} Farm`, farmType: 'mixed' }) }
try {
  assert.throws(() => coordinates({ latitude: '', longitude: 2 }))
  assert.throws(() => coordinates({ latitude: 91, longitude: 2 }))
  assert.deepEqual(coordinates({ latitude: 7.41234, longitude: 3.91234 }), { latitude: 7.4, longitude: 3.9 })
  assert.equal(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }), 0)
  assert.ok(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 }) > 100)
  assert.throws(() => forecastSummary({ daily: { time: ['2026-10-24'], temperature_2m_max: [null] } }))
  await request('/api/community', 'GET', undefined, undefined, 401)
  await request('/api/weather', 'POST', { latitude: 7, longitude: 4 }, undefined, 401)
  const a = await register('Alice'), b = await register('Bola'), c = await register('Chika')
  const first = await request('/api/community', 'GET', undefined, a.cookie)
  assert.equal(first.body.profile.visible, false)
  const publish = { action: 'publish', latitude: 7.41234, longitude: 3.91234, displayName: 'Alice Farm', bio: 'Crop farmer', contact: 'alice-contact@example.test' }
  await request('/api/community', 'POST', publish, a.cookie, 400)
  await request('/api/community', 'POST', { ...publish, consent: true, latitude: 100 }, a.cookie, 400)
  const shared = await request('/api/community', 'POST', { ...publish, consent: true }, a.cookie)
  assert.equal(shared.body.profile.latitude, 7.4)
  const search = { action: 'search', latitude: 7.4, longitude: 3.9, radiusKm: 50 }
  const discovered = await request('/api/community', 'POST', search, b.cookie)
  assert.equal(discovered.body.farmers.length, 1)
  assert.ok(!JSON.stringify(discovered.body).includes('alice-contact'))
  assert.ok(!JSON.stringify(discovered.body).includes('email'))
  const aliceId = discovered.body.farmers[0].id
  await request('/api/community', 'POST', { action: 'request', targetId: aliceId }, b.cookie, 400)
  await request('/api/community', 'POST', { ...publish, consent: true, displayName: 'Bola Farm', contact: 'bola-contact@example.test' }, b.cookie)
  const pending = await request('/api/community', 'POST', { action: 'request', targetId: aliceId }, b.cookie)
  const requestId = pending.body.requests[0].id
  assert.equal(pending.body.requests[0].contact, '')
  await request('/api/community', 'POST', { action: 'request', targetId: aliceId }, b.cookie)
  assert.equal((await request('/api/community', 'GET', undefined, b.cookie)).body.requests.length, 1)
  await request('/api/community', 'POST', { action: 'respond', requestId, status: 'accepted' }, b.cookie, 404)
  await request('/api/community', 'POST', { action: 'respond', requestId, status: 'accepted' }, c.cookie, 404)
  const accepted = await request('/api/community', 'POST', { action: 'respond', requestId, status: 'accepted' }, a.cookie)
  assert.equal(accepted.body.requests[0].contact, 'bola-contact@example.test')
  assert.equal((await request('/api/community', 'GET', undefined, b.cookie)).body.requests[0].contact, 'alice-contact@example.test')
  assert.equal((await request('/api/community', 'GET', undefined, c.cookie)).body.requests.length, 0)
  await request('/api/community', 'POST', { action: 'block', targetId: aliceId }, b.cookie)
  assert.equal((await request('/api/community', 'POST', search, b.cookie)).body.farmers.length, 0)
  assert.equal((await request('/api/community', 'POST', search, a.cookie)).body.farmers.length, 0)
  await request('/api/community', 'POST', { action: 'hide' }, a.cookie)
  const remaining = await request('/api/community', 'POST', search, c.cookie)
  assert.ok(!remaining.body.farmers.some(f => f.id === aliceId))
  const hidden = await request('/api/community', 'GET', undefined, a.cookie)
  assert.equal(hidden.body.profile.latitude, null)
  assert.equal(hidden.body.profile.contact, '')
  await request('/api/community', 'POST', search, a.cookie, 403, { Origin: 'https://evil.example' })
  await request('/api/weather', 'POST', { latitude: '', longitude: 4 }, a.cookie, 400)
  delete process.env.OPENWEATHER_API_KEY
  await request('/api/weather', 'POST', { latitude: 7.4, longitude: 3.9 }, a.cookie, 503)
  assert.equal(providerCalls, 0)
  process.env.OPENWEATHER_API_KEY = 'synthetic-weather-secret'
  await request('/api/weather', 'POST', { latitude: 7.4, longitude: 3.9 }, a.cookie, 403, { Origin: 'https://evil.example' })
  const weatherResult = await request('/api/weather', 'POST', { latitude: 7.4, longitude: 3.9 }, a.cookie)
  assert.equal(weatherResult.body.days[0].indicators.length, 3)
  assert.equal(weatherResult.body.days[1].indicators.length, 1)
  assert.equal(weatherResult.body.source, 'OpenWeather')
  assert.ok(!JSON.stringify(weatherResult.body).includes('synthetic-weather-secret'))
  await request('/api/weather', 'POST', { latitude: 7.4, longitude: 3.9 }, b.cookie)
  assert.equal(providerCalls, 1)
  malformed = true
  await request('/api/weather', 'POST', { latitude: 9, longitude: 4 }, a.cookie, 502)
  for (const [i, status] of [401, 429, 500, 302].entries()) {
    providerStatus = status
    const failed = await request('/api/weather', 'POST', { latitude: 11 + i, longitude: 4 }, b.cookie, 502)
    assert.ok(!JSON.stringify(failed.body).includes('synthetic-weather-secret'))
    assert.ok(!JSON.stringify(failed.body).includes('upstream private detail'))
  }
  delete process.env.OPENWEATHER_API_KEY
  await request('/api/weather', 'POST', { latitude: 7.4, longitude: 3.9 }, b.cookie, 503)
  console.log(`PASS: ${checks} weather/community HTTP checks plus location validation, opt-in privacy, accepted contacts, blocking, isolation, forecast boundaries and cache tests (synthetic weather provider).`)
} finally {
  globalThis.fetch = clientFetch
  await new Promise(resolve => server.close(resolve))
  await rm(directory, { recursive: true, force: true })
}
