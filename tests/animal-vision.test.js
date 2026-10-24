import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { createApp, toNodeListener } from 'h3'
import { PhotonImage } from '@cf-wasm/photon/node'
import { scanAnimal, animalVisionStatus, validateAnimalScan, normalizeAnimalRegions, ANIMAL_MODEL_PROVENANCE } from '../server/utils/animal-vision.js'

const image = new PhotonImage(new Uint8Array(16 * 16 * 4).fill(255), 16, 16)
const png = Buffer.from(image.get_bytes())
image.free()
const input = { animal: 'cattle', image: `data:image/png;base64,${png.toString('base64')}` }
const status = code => error => error.statusCode === code
const prediction = (name, extra = {}) => ({ class: name, confidence: 0.8, x: 8, y: 8, width: 8, height: 8, ...extra })
const result = predictions => ({ image: { width: 16, height: 16 }, predictions })
function env(t, enabled = true) {
  const keys = ['ROBOFLOW_API_KEY', 'FARMBUDDY_EXPERIMENTAL_ANIMAL_SCAN', 'FARMBUDDY_DATA_FILE']
  const saved = keys.map(key => [key, process.env[key]])
  t.after(() => { for (const [key, value] of saved) { if (value === undefined) delete process.env[key]; else process.env[key] = value } })
  process.env.ROBOFLOW_API_KEY = 'private-test-key'
  process.env.FARMBUDDY_EXPERIMENTAL_ANIMAL_SCAN = enabled ? 'true' : 'false'
}

test('fixed Roboflow POST contract, actual JPEG re-encoding, explicit experimental output', async t => {
  env(t)
  assert.deepEqual(animalVisionStatus(), { configured: true, provider: 'Roboflow', experimental: true, animal: 'cattle', model: 'cattle-disease-detection/1' })
  let calls = 0
  const response = await scanAnimal(input, async (address, options) => {
    calls++
    const url = new URL(address)
    assert.equal(url.origin, 'https://serverless.roboflow.com')
    assert.equal(url.pathname, '/cattle-disease-detection/1')
    assert.deepEqual(Object.fromEntries(url.searchParams), { api_key: 'private-test-key' })
    assert.equal(options.method, 'POST')
    assert.equal(options.redirect, 'error')
    assert.equal(options.headers['Content-Type'], 'application/x-www-form-urlencoded')
    assert.ok(options.signal instanceof AbortSignal)
    const bytes = Buffer.from(options.body, 'base64')
    assert.equal(bytes.toString('base64'), options.body)
    assert.equal(bytes.toString('hex', 0, 2), 'ffd8')
    const decoded = PhotonImage.new_from_byteslice(bytes)
    assert.equal(decoded.get_width(), 16)
    assert.equal(decoded.get_height(), 16)
    decoded.free()
    return Response.json(result([prediction('Healthy'), prediction('lumpy'), prediction('objects')]))
  })
  assert.equal(calls, 1)
  assert.deepEqual(Object.keys(response), ['provider', 'experimental', 'animal', 'model', 'status', 'regions', 'notice'])
  assert.equal(response.status, 'regions')
  assert.deepEqual(response.regions, [{ label: 'Model-highlighted area', score: 0.8, box: { left: .25, top: .25, width: .5, height: .5 } }])
  assert.match(response.notice, /No regions does not mean healthy/)
  assert.match(response.notice, /not a validated diagnosis/)
  assert.equal(JSON.stringify(response).includes('private-test-key'), false)
})

test('private key AND literal opt-in required, no outbound requests when either missing', async t => {
  env(t)
  let calls = 0
  const fetcher = () => { calls++; throw new Error('must not call') }
  for (const flag of [undefined, '', 'false', 'TRUE', '1']) {
    if (flag === undefined) delete process.env.FARMBUDDY_EXPERIMENTAL_ANIMAL_SCAN
    else process.env.FARMBUDDY_EXPERIMENTAL_ANIMAL_SCAN = flag
    assert.equal(animalVisionStatus().configured, false)
    await assert.rejects(scanAnimal(input, fetcher), status(503))
  }
  process.env.FARMBUDDY_EXPERIMENTAL_ANIMAL_SCAN = 'true'
  for (const key of ['', '   ']) {
    process.env.ROBOFLOW_API_KEY = key
    await assert.rejects(scanAnimal(input, fetcher), status(503))
  }
  assert.equal(calls, 0)
})

test('strict fields, canonical base64, actual decoder and allocation limits', async t => {
  env(t)
  let calls = 0
  const fetcher = () => { calls++; throw new Error('must not call') }
  for (const bad of [null, [], {}, { ...input, animal: 'goat' }, { ...input, consent: true }, { ...input, model: 'other/1' }, { ...input, image: input.image + '=' }, { ...input, image: input.image.replace('image/png', 'image/jpeg') }, { ...input, image: 'data:image/png;base64,AAAA' }, { ...input, image: input.image.replace('base64,', 'base64,\n') }]) await assert.rejects(scanAnimal(bad, fetcher), status(400))
  await assert.rejects(scanAnimal({ ...input, image: `data:image/png;base64,${'A'.repeat(4200000)}` }, fetcher), status(413))
  for (const [width, height] of [[0, 1], [2001, 2000], [8001, 1]]) {
    const bomb = Buffer.from(png)
    bomb.writeUInt32BE(width, 16)
    bomb.writeUInt32BE(height, 20)
    assert.throws(() => validateAnimalScan({ ...input, image: `data:image/png;base64,${bomb.toString('base64')}` }), status(413))
  }
  await assert.rejects(scanAnimal({ ...input, image: `data:image/png;base64,${png.subarray(0, 33).toString('base64')}` }, fetcher), status(415))
  assert.equal(calls, 0)
})

test('verified class metadata fails closed, unknown and healthy boxes never become findings', () => {
  assert.deepEqual(ANIMAL_MODEL_PROVENANCE.classes, ['Healthy', 'lumpy', 'objects'])
  assert.equal(ANIMAL_MODEL_PROVENANCE.images, 51)
  assert.equal(ANIMAL_MODEL_PROVENANCE.license, 'CC BY 4.0')
  const names = ['Healthy', 'healthy', 'objects', 'unknown', 'lumpy_skin', 'lumpy-skin', 'lumpyskin', 'lumpySkinDisease']
  for (const name of names) {
    for (const box of [{}, { x: -100 }, { x: 100 }, { y: -100 }, { y: 100 }, { x: 0, y: 0, width: 32, height: 32 }]) assert.deepEqual(normalizeAnimalRegions(result([prediction(name, box)])), [])
  }
  assert.deepEqual(normalizeAnimalRegions(result(Array.from({ length: 40 }, () => prediction('Healthy')))), [])
  assert.equal(normalizeAnimalRegions(result(Array.from({ length: 40 }, () => prediction('lumpy')))).length, 20)
  assert.deepEqual(normalizeAnimalRegions(result([prediction('lumpy', { x: 0, y: 0, width: 32, height: 32 })]))[0].box, { left: 0, top: 0, width: 1, height: 1 })
  assert.deepEqual(normalizeAnimalRegions(result([prediction('lumpy', { x: -100 })])), [])
  for (const malformed of [{}, { predictions: [] }, { image: { width: 0, height: 1 }, predictions: [] }, result([prediction('lumpy', { confidence: 2 })]), result([prediction('lumpy', { width: -1 })]), result([prediction('lumpy', { x: Infinity })]), result([null])]) assert.throws(() => normalizeAnimalRegions(malformed))
})

test('provider errors, timeouts, redirects, malformed and oversized JSON remain generic', async t => {
  env(t)
  for (const code of [400, 401, 403, 404, 422, 429, 500]) await assert.rejects(scanAnimal(input, async () => new Response('private-test-key', { status: code })), error => error.statusCode === 502 && !error.message.includes('private-test-key'))
  for (const response of [new Response('{'), Response.json({}), Response.json(result([prediction('lumpy', { confidence: '0.9' })])), new Response('x'.repeat(140000)), new Response('{}', { headers: { 'content-length': '140000' } })]) await assert.rejects(scanAnimal(input, async () => response), status(502))
  for (const name of ['TimeoutError', 'TypeError']) await assert.rejects(scanAnimal(input, async () => { const error = new Error('api_key=private-test-key'); error.name = name; throw error }), error => error.statusCode === 502 && !error.message.includes('private-test-key'))
})

test('HTTP auth, CSRF, no-store, strict content type, body size and rate limit', async t => {
  env(t, false)
  const directory = await mkdtemp(join(tmpdir(), 'animal-vision-'))
  process.env.FARMBUDDY_DATA_FILE = join(directory, 'data.json')
  const { store } = await import('../server/utils/store.js')
  const { default: postHandler } = await import('../server/api/animal-scan.post.js')
  const { default: getHandler } = await import('../server/api/animal-scan.get.js')
  const token = 'c'.repeat(64)
  await store(data => {
    data.users.push({ id: 'animal-scan-test', farmType: 'animal' })
    data.sessions.push({ userId: 'animal-scan-test', tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: Date.now() + 60000 })
  }, true)
  const app = createApp().use('/post', postHandler).use('/status', getHandler)
  const server = createServer(toNodeListener(app))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }) })
  const address = `http://127.0.0.1:${server.address().port}`
  const headers = { Cookie: `farmbuddy_session=${token}`, 'Content-Type': 'application/json' }
  const post = (body, extra = headers) => fetch(`${address}/post`, { method: 'POST', headers: extra, body: typeof body === 'string' ? body : JSON.stringify(body) })
  assert.equal((await fetch(`${address}/status`)).status, 401)
  const info = await fetch(`${address}/status`, { headers })
  assert.equal(info.headers.get('cache-control'), 'no-store')
  assert.equal(info.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(await info.json(), animalVisionStatus())
  assert.equal((await post(input, { 'Content-Type': 'application/json' })).status, 401)
  assert.equal((await post(input, { ...headers, Origin: 'https://evil.test' })).status, 403)
  assert.equal((await post(input, { ...headers, 'Sec-Fetch-Site': 'cross-site' })).status, 403)
  assert.equal((await post(input, { ...headers, 'Content-Type': 'text/plain' })).status, 415)
  assert.equal((await post('{')).status, 400)
  const missing = await post(input)
  assert.equal(missing.status, 503)
  assert.equal(missing.headers.get('cache-control'), 'no-store')
  assert.equal((await post({ ...input, animal: 'goat' })).status, 400)
  assert.equal((await post('x'.repeat(4 * 1024 * 1024 + 101))).status, 413)
  for (let i = 0; i < 5; i++) await post(input)
  assert.equal((await post(input)).status, 429)
})
