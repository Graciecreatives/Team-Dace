import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createApp, toNodeListener } from 'h3'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

test('service readiness is authenticated, no-store and returns booleans without credentials or provider calls', async () => {
  const directory = await mkdtemp(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'farm-services-'))
  const keys = ['FARMBUDDY_DATA_FILE', 'FARMBUDDY_AUTH', 'FARMBUDDY_DATABASE', 'NODE_ENV', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'FARMBUDDY_AI_MODEL', 'YARNGPT_API_KEY', 'OPENWEATHER_API_KEY', 'PLANTNET_API_KEY', 'ROBOFLOW_API_KEY', 'FARMBUDDY_EXPERIMENTAL_ANIMAL_SCAN']
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  Object.assign(process.env, { FARMBUDDY_DATA_FILE: join(directory, 'store.json'), FARMBUDDY_AUTH: 'local', FARMBUDDY_DATABASE: 'local', NODE_ENV: 'development' })
  for (const key of keys.slice(4)) delete process.env[key]
  const { default: api } = await import('../server/api/[...].js')
  const { default: status } = await import('../server/api/services/status.get.js')
  const app = createApp({ debug: false }).use('/api/services/status', status).use(api)
  const server = createServer(toNodeListener(app))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    let response = await fetch(`${base}/api/services/status`)
    assert.equal(response.status, 401)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    response = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Service Tester', email: 'services@example.test', password: 'test-services-password' }) })
    assert.equal(response.status, 200)
    const cookie = response.headers.get('set-cookie').split(';')[0]
    response = await fetch(`${base}/api/services/status`, { headers: { cookie } })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { configurationOnly: true, services: { text: false, photos: false, plantScan: false, animalScan: false, voice: false, weather: false } })
    Object.assign(process.env, { OPENROUTER_API_KEY: 'private-router-value', YARNGPT_API_KEY: 'private-yarn-value', OPENWEATHER_API_KEY: 'private-weather-value', PLANTNET_API_KEY: 'private-plant-value', ROBOFLOW_API_KEY: 'private-cattle-value', FARMBUDDY_EXPERIMENTAL_ANIMAL_SCAN: 'true' })
    response = await fetch(`${base}/api/services/status`, { headers: { cookie } })
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    const body = await response.text()
    assert.deepEqual(JSON.parse(body), { configurationOnly: true, services: { text: true, photos: true, plantScan: true, animalScan: true, voice: true, weather: true } })
    assert.doesNotMatch(body, /private-|KEY|password|email/)
    process.env.FARMBUDDY_EXPERIMENTAL_ANIMAL_SCAN = 'false'
    response = await fetch(`${base}/api/services/status`, { headers: { cookie } })
    assert.equal((await response.json()).services.animalScan, false)
    process.env.OPENROUTER_MODEL = 'invalid-model'
    response = await fetch(`${base}/api/services/status`, { headers: { cookie } })
    assert.equal((await response.json()).services.text, false)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] }
    await rm(directory, { recursive: true, force: true })
  }
})
