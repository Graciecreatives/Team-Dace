import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { createApp, toNodeListener } from 'h3'
import { PhotonImage } from '@cf-wasm/photon/node'
import { scanPlant, plantVisionStatus, validatePlantScan } from '../server/utils/plant-vision.js'

const photo = new PhotonImage(new Uint8Array(16 * 16 * 4).fill(255), 16, 16)
const png = Buffer.from(photo.get_bytes())
photo.free()
const input = { task: 'disease', image: `data:image/png;base64,${png.toString('base64')}`, consent: true }
const status = code => error => error.statusCode === code
function restoreEnv(t, keys) {
  const saved = keys.map(key => [key, process.env[key]])
  t.after(() => { for (const [key, value] of saved) { if (value === undefined) delete process.env[key]; else process.env[key] = value } })
}

test('specialist multipart contract, true decoding, sanitized model scores and private status', async t => {
  restoreEnv(t, ['PLANTNET_API_KEY'])
  process.env.PLANTNET_API_KEY = 'private-test-key'
  assert.deepEqual(plantVisionStatus(), { configured: true, provider: 'Pl@ntNet', animalSupported: false })
  let calls = 0
  const fetcher = async (address, options) => {
    if (new URL(address).pathname === '/v2/diseases') return Response.json([])
    calls++
    const url = new URL(address)
    assert.equal(url.origin, 'https://my-api.plantnet.org')
    assert.equal(url.pathname, calls === 1 ? '/v2/diseases/identify' : '/v2/identify/all')
    assert.deepEqual(Object.fromEntries(url.searchParams), { 'api-key': 'private-test-key', lang: 'en', 'nb-results': '3', 'include-related-images': 'false' })
    assert.equal(options.method, 'POST')
    assert.equal(options.redirect, 'manual')
    assert.ok(options.signal instanceof AbortSignal)
    assert.deepEqual([...options.body.keys()], ['images', 'organs'])
    assert.equal(options.body.get('organs'), 'auto')
    const uploaded = options.body.get('images')
    assert.equal(uploaded.type, 'image/jpeg')
    const bytes = Buffer.from(await uploaded.arrayBuffer())
    assert.equal(bytes.toString('hex', 0, 2), 'ffd8')
    const decoded = PhotonImage.new_from_byteslice(bytes)
    assert.equal(decoded.get_width(), 16)
    decoded.free()
    return Response.json({ version: '2026-test', query: { secret: 'do-not-return' }, results: calls === 1 ? [
      { name: 'APHISP', description: 'Aphis sp.', score: 0.9 },
      { name: 'BAD', score: 2 }, { name: 'ELSIAM', score: 0.1 },
      { name: 'TRANSP', score: 0.05 }, { name: 'LAST', score: 0.01 }
    ] : [{ score: 0.8, species: { scientificNameWithoutAuthor: 'Zea mays', commonNames: ['Maize'], genus: { scientificNameWithoutAuthor: 'Zea' }, family: { scientificNameWithoutAuthor: 'Poaceae' } } }] })
  }
  const disease = await scanPlant(input, fetcher)
  assert.equal(disease.candidates.length, 3)
  assert.equal(disease.status, 'suggestions')
  assert.deepEqual(disease.candidates[0], { name: 'Aphis sp.', code: 'APHISP', score: 0.9 })
  assert.equal(disease.candidates[1].name, 'ELSIAM')
  assert.equal(disease.scoreLabel, 'Model score')
  assert.match(disease.notice, /not diagnostic probabilities/)
  assert.equal(disease.version, '2026-test')
  assert.equal(JSON.stringify(disease).includes('do-not-return'), false)
  const identify = await scanPlant({ ...input, task: 'identify' }, fetcher)
  assert.deepEqual(identify.candidates[0], { name: 'Maize', scientificName: 'Zea mays', commonNames: ['Maize'], genus: 'Zea', family: 'Poaceae', score: 0.8 })
})

test('no outbound calls without consent, valid bounded images and key', async t => {
  restoreEnv(t, ['PLANTNET_API_KEY'])
  process.env.PLANTNET_API_KEY = 'test'
  let calls = 0
  const fetcher = () => { calls++; throw new Error('must not call') }
  for (const bad of [{ ...input, consent: false }, { ...input, consent: 'true' }, { ...input, task: 'animal' }, { ...input, url: 'https://evil.test' }, { ...input, image: input.image.replace('image/png', 'image/jpeg') }, { ...input, image: 'data:image/png;base64,AAAA' }, { ...input, image: input.image + '=' }]) await assert.rejects(scanPlant(bad, fetcher), status(400))
  await assert.rejects(scanPlant({ ...input, image: `data:image/png;base64,${'A'.repeat(4200000)}` }, fetcher), status(413))
  const bomb = Buffer.from(png)
  bomb.writeUInt32BE(100000, 16)
  assert.throws(() => validatePlantScan({ ...input, image: `data:image/png;base64,${bomb.toString('base64')}` }), status(413))
  const corrupt = Buffer.from(png.subarray(0, 33))
  await assert.rejects(scanPlant({ ...input, image: `data:image/png;base64,${corrupt.toString('base64')}` }, fetcher), status(415))
  delete process.env.PLANTNET_API_KEY
  assert.equal(plantVisionStatus().configured, false)
  await assert.rejects(scanPlant(input, fetcher), status(503))
  assert.equal(calls, 0)
})

test('bounded provider errors, rejection, invalid payloads and no secret leaks', async t => {
  restoreEnv(t, ['PLANTNET_API_KEY'])
  process.env.PLANTNET_API_KEY = 'never-leak-key'
  for (const code of [401, 403, 429, 500]) await assert.rejects(scanPlant(input, async () => new Response('never-leak-key', { status: code })), error => error.statusCode === 502 && !error.message.includes('never-leak'))
  for (const code of [400, 404, 422]) await assert.rejects(scanPlant(input, async () => new Response('', { status: code })), status(422))
  for (const response of [new Response('{'), Response.json({}), new Response('x'.repeat(140000)), new Response('{}', { headers: { 'content-length': '140000' } })]) await assert.rejects(scanPlant(input, async () => response), status(502))
  await assert.rejects(scanPlant(input, async () => { throw new Error('https://my-api.plantnet.org/?api-key=never-leak-key') }), error => error.statusCode === 502 && !error.message.includes('never-leak'))
  assert.equal((await scanPlant(input, async () => Response.json({ results: [] }))).status, 'no-match')
})

test('bounded same-plant photo sets use repeated multipart parts and fail before outbound', async t => {
  restoreEnv(t, ['PLANTNET_API_KEY'])
  process.env.PLANTNET_API_KEY = 'multiple-test'
  const { image, ...rest } = input
  let calls = 0
  const fetcher = async (_url, options) => {
    calls++
    assert.equal(options.body.getAll('images').length, 3)
    assert.deepEqual(options.body.getAll('organs'), ['leaf', 'flower', 'auto'])
    return Response.json({ results: [] })
  }
  assert.equal((await scanPlant({ ...rest, images: [image, image, image], organs: ['leaf', 'flower', 'auto'] }, fetcher)).status, 'no-match')
  for (const images of [[], Array(6).fill(image), 'wrong', [image, 'data:image/png;base64,AAAA']]) await assert.rejects(scanPlant({ ...rest, images }, fetcher), status(400))
  await assert.rejects(scanPlant({ ...input, images: [image] }, fetcher), status(400))
  await assert.rejects(scanPlant({ ...rest, images: [image], consent: false }, fetcher), status(400))
  for (const organs of [[], ['habit'], ['leaf', 'flower'], 'leaf', [null]]) await assert.rejects(scanPlant({ ...rest, images: [image], organs }, fetcher), status(400))
  const padded = Buffer.alloc(1100000)
  png.copy(padded)
  const bigImage = `data:image/png;base64,${padded.toString('base64')}`
  await assert.rejects(scanPlant({ ...rest, images: [bigImage, bigImage, bigImage] }, fetcher), status(413))
  assert.equal(calls, 1)
})

test('English catalogue resolves missing descriptions, caches safely and preserves EPPO fallback', async t => {
  restoreEnv(t, ['PLANTNET_API_KEY'])
  process.env.PLANTNET_API_KEY = 'catalogue-test'
  let catalogueCalls = 0
  const fetcher = async (address, options) => {
    const url = new URL(address)
    if (url.pathname === '/v2/diseases') {
      catalogueCalls++
      assert.equal(options.method, 'GET')
      assert.equal(options.redirect, 'manual')
      assert.ok(options.signal instanceof AbortSignal)
      assert.equal(url.searchParams.get('lang'), 'en')
      assert.equal(url.searchParams.get('api-key'), 'catalogue-test')
      return Response.json([{ name: 'APHISP', label: 'Aphids' }, { name: 'BAD!', label: 'ignore' }])
    }
    return Response.json({ results: [{ name: 'APHISP', score: 0.9 }, { name: 'ELSIAM', description: 'Provider description', score: 0.1 }, { name: 'UNKNWN', score: 0.01 }] })
  }
  const first = await scanPlant(input, fetcher)
  assert.deepEqual(first.candidates.map(row => row.name), ['Aphids', 'Provider description', 'UNKNWN'])
  await scanPlant(input, fetcher)
  assert.equal(catalogueCalls, 1)
  for (const makeResponse of [() => new Response('private-error', { status: 503 }), () => new Response('x'.repeat(270000)), () => Response.json(Array(2001).fill({ name: 'APHISP', label: 'huge' })), () => new Response('{')]) {
    let requests = 0
    const unavailable = async address => {
      if (new URL(address).pathname === '/v2/diseases') { requests++; return makeResponse() }
      return Response.json({ results: [{ name: 'APHISP', score: 0.9 }] })
    }
    const result = await scanPlant(input, unavailable)
    assert.equal(result.candidates[0].name, 'APHISP')
    await scanPlant(input, unavailable)
    assert.equal(requests, 1)
    assert.equal(JSON.stringify(result).includes('private-error'), false)
  }
})

test('official maxima allow five species or disease photos, with total 8MP bound', async t => {
  restoreEnv(t, ['PLANTNET_API_KEY'])
  process.env.PLANTNET_API_KEY = 'limits-test'
  const image = input.image
  for (const [task, count] of [['identify', 5], ['disease', 5]]) {
    let calls = 0
    const fetcher = async (_url, options) => {
      calls++
      assert.equal(options.body.getAll('images').length, count)
      assert.equal(options.body.getAll('organs').length, count)
      return Response.json({ results: [] })
    }
    const request = { task, images: Array(count).fill(image), organs: Array(count).fill('auto'), consent: true }
    assert.equal((await scanPlant(request, fetcher)).status, 'no-match')
    await assert.rejects(scanPlant({ ...request, images: [...request.images, image], organs: [...request.organs, 'auto'] }, fetcher), status(400))
    assert.equal(calls, 1)
  }
  // Header-only fixtures intentionally exercise allocation preflight, not decoding.
  const largeHeader = Buffer.from(png)
  largeHeader.writeUInt32BE(2000, 16)
  largeHeader.writeUInt32BE(2000, 20)
  const largeImage = `data:image/png;base64,${largeHeader.toString('base64')}`
  const request = { task: 'identify', images: [largeImage, largeImage], consent: true }
  assert.equal(validatePlantScan(request).reduce((total, image) => total + image.width * image.height, 0), 8000000)
  let outbound = 0
  await assert.rejects(scanPlant({ ...request, images: [...request.images, image] }, () => { outbound++ }), status(413))
  assert.equal(outbound, 0)
})

test('actual HTTP handler enforces authentication, CSRF, bounded body and per-user rate limit', async t => {
  restoreEnv(t, ['PLANTNET_API_KEY', 'FARMBUDDY_DATA_FILE'])
  delete process.env.PLANTNET_API_KEY
  const directory = await mkdtemp(join(tmpdir(), 'plant-vision-'))
  process.env.FARMBUDDY_DATA_FILE = join(directory, 'data.json')
  const { store } = await import('../server/utils/store.js')
  const { default: handler } = await import('../server/api/plant-scan.post.js')
  const { default: getStatus } = await import('../server/api/plant-scan.get.js')
  const token = 'b'.repeat(64)
  await store(data => {
    data.users.push({ id: 'plant-scan-test', farmType: 'crop' })
    data.sessions.push({ userId: 'plant-scan-test', tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: Date.now() + 60000 })
  }, true)
  const server = createServer(toNodeListener(createApp().use('/status', getStatus).use('/api/plant-scan', handler)))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }) })
  const address = `http://127.0.0.1:${server.address().port}/api/plant-scan`
  const headers = { Cookie: `farmbuddy_session=${token}`, 'Content-Type': 'application/json' }
  const statusAddress = address.replace('/api/plant-scan', '/status')
  assert.equal((await fetch(statusAddress)).status, 401)
  const privateStatus = await fetch(statusAddress, { headers })
  assert.equal(privateStatus.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await privateStatus.json(), { configured: false, provider: 'Pl@ntNet', animalSupported: false })
  process.env.PLANTNET_API_KEY = 'must-not-be-visible'
  assert.deepEqual(await (await fetch(statusAddress, { headers })).json(), { configured: true, provider: 'Pl@ntNet', animalSupported: false })
  delete process.env.PLANTNET_API_KEY
  const post = (body, extra = headers) => fetch(address, { method: 'POST', headers: extra, body: typeof body === 'string' ? body : JSON.stringify(body) })
  assert.equal((await post(input, { 'Content-Type': 'application/json' })).status, 401)
  assert.equal((await post(input, { ...headers, Origin: 'https://evil.test' })).status, 403)
  assert.equal((await post(input, { ...headers, 'Sec-Fetch-Site': 'cross-site' })).status, 403)
  assert.equal((await post(input, { ...headers, 'Content-Type': 'text/plain' })).status, 415)
  assert.equal((await post('{')).status, 400)
  const missing = await post(input)
  assert.equal(missing.status, 503)
  assert.equal(missing.headers.get('cache-control'), 'no-store')
  assert.equal((await post({ ...input, consent: false })).status, 400)
  assert.equal((await post('x'.repeat(4 * 1024 * 1024 + 4097))).status, 413)
  const realFetch = globalThis.fetch
  let outbound = 0
  process.env.PLANTNET_API_KEY = 'handler-key'
  globalThis.fetch = async (url, options) => {
    if (new URL(url).origin !== 'https://my-api.plantnet.org') return realFetch(url, options)
    outbound++
    assert.equal(options.body.getAll('images').length, 2)
    return Response.json({ results: [{ name: 'APHISP', description: 'Aphids', score: 0.9 }] })
  }
  try {
    const response = await post({ task: 'disease', images: [input.image, input.image], organs: ['leaf', 'auto'], consent: true })
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.status, 'suggestions')
    assert.deepEqual(result.candidates, [{ name: 'Aphids', code: 'APHISP', score: 0.9 }])
    assert.equal(outbound, 1)
  } finally { globalThis.fetch = realFetch; delete process.env.PLANTNET_API_KEY }
  for (let i = 0; i < 5; i++) await post(input)
  assert.equal((await post(input)).status, 429)
})
