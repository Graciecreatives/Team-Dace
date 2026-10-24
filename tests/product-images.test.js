import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp, createRouter, defineEventHandler, toNodeListener } from 'h3'
import sharp from 'sharp'
import { registerHooks } from 'node:module'
import { encodeProductPhoto, writePhoto, readPhoto, removePhoto, photoBackend, photoKey, MAX_PHOTO_BYTES } from '../server/utils/product-images.js'

function env(values) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
  for (const [key, value] of Object.entries(values)) value === undefined ? delete process.env[key] : process.env[key] = value
  return () => { for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value }
}
test('phone photos are actually decoded, oriented, resized and stripped of EXIF metadata', async () => {
  const original = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#066136' } }).withMetadata({ orientation: 6 }).jpeg().toBuffer()
  assert.ok((await sharp(original).metadata()).exif)
  const result = await encodeProductPhoto(original, 'image/jpeg')
  const metadata = await sharp(result.bytes).metadata()
  assert.equal(metadata.format, 'jpeg')
  assert.equal(metadata.width, 800)
  assert.equal(metadata.height, 1600)
  assert.equal(metadata.exif, undefined)
  assert.equal(metadata.orientation, undefined)
  assert.equal(metadata.icc, undefined)
  for (const [bytes, mime, code] of [[Buffer.from('<svg/>'), 'image/svg+xml', 415], [original, 'image/png', 415], [Buffer.from([255,216,255,0,0,0]), 'image/jpeg', 415], [Buffer.alloc(MAX_PHOTO_BYTES + 1), 'image/jpeg', 413]]) {
    await assert.rejects(encodeProductPhoto(bytes, mime), error => error.statusCode === code)
  }
})
test('WASM codec supports PNG and WebP, white transparency, and all EXIF orientations', async () => {
  for (const format of ['png', 'webp']) {
    const original = await sharp({ create: { width: 24, height: 12, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })[format]().toBuffer()
    const result = await encodeProductPhoto(original, `image/${format}`)
    assert.equal(result.width, 24)
    assert.equal(result.height, 12)
    const { data } = await sharp(result.bytes).raw().toBuffer({ resolveWithObject: true })
    assert.ok(data[0] > 245 && data[1] > 245 && data[2] > 245)
  }
  const pattern = Buffer.alloc(24 * 12 * 3)
  for (let y = 0; y < 12; y++) for (let x = 0; x < 24; x++) {
    const at = (y * 24 + x) * 3
    pattern[at] = x < 12 ? 220 : 20
    pattern[at + 1] = y < 6 ? 220 : 20
    pattern[at + 2] = x < 12 ? 20 : 220
  }
  for (let orientation = 1; orientation <= 8; orientation++) {
    const original = await sharp(pattern, { raw: { width: 24, height: 12, channels: 3 } }).withMetadata({ orientation }).jpeg().toBuffer()
    const result = await encodeProductPhoto(original, 'image/jpeg')
    assert.equal(result.width, orientation >= 5 ? 12 : 24)
    assert.equal(result.height, orientation >= 5 ? 24 : 12)
    assert.equal((await sharp(result.bytes).metadata()).exif, undefined)
    const actual = await sharp(result.bytes).raw().toBuffer()
    const expected = await sharp(original).autoOrient().raw().toBuffer()
    for (let channel = 0; channel < 3; channel++) assert.ok(Math.abs(actual[channel] - expected[channel]) < 35, `orientation ${orientation} channel ${channel}`)
  }
})
test('cloud codec rejects oversized dimensions before importing WASM', async () => {
  const restore = env({ FARMBUDDY_DATABASE: 'cloudflare', FARMBUDDY_IMAGE_STORAGE: 'cloudflare' })
  try {
    const oversized = Buffer.alloc(24)
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(oversized)
    oversized.write('IHDR', 12)
    oversized.writeUInt32BE(4000, 16)
    oversized.writeUInt32BE(3000, 20)
    await assert.rejects(encodeProductPhoto(oversized, 'image/png'), error => error.statusCode === 413 && /4 megapixels/.test(error.message))
  } finally { restore() }
})
test('R2 uses only the private binding with bounded reads and no public object URLs', async () => {
  const restore = env({ FARMBUDDY_DATABASE: 'cloudflare', FARMBUDDY_IMAGE_STORAGE: undefined })
  const requests = []
  let object = { size: 9, httpMetadata: { contentType: 'image/jpeg' }, body: new Blob(['test-jpeg']).stream() }
  globalThis.__imageTestBucket = {
    async put(key, bytes, options) { requests.push({ key, bytes, options }); return { key } },
    async get(key) { requests.push({ key }); return object },
    async delete(key) { requests.push({ key, deleted: true }) },
  }
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env = { get FARMBUDDY_IMAGES() { return globalThis.__imageTestBucket } }', shortCircuit: true }
    return next(specifier, context)
  } })
  const asset = { backend: 'cloudflare', key: photoKey('owner', '12345678-1234-1234-1234-123456789abc') }
  try {
    assert.equal(photoBackend(), 'cloudflare')
    process.env.FARMBUDDY_IMAGE_STORAGE = 'local'
    assert.throws(photoBackend, error => error.statusCode === 503)
    delete process.env.FARMBUDDY_IMAGE_STORAGE
    await writePhoto(asset, Buffer.from('jpeg'))
    assert.equal(requests[0].key, asset.key)
    assert.deepEqual(requests[0].options, { httpMetadata: { contentType: 'image/jpeg', cacheControl: 'no-store' }, onlyIf: { etagDoesNotMatch: '*' } })
    assert.equal((await readPhoto(asset)).toString(), 'test-jpeg')
    object = { ...object, size: 9000000 }
    await assert.rejects(readPhoto(asset), error => error.statusCode === 503)
    object = { size: 1, httpMetadata: { contentType: 'image/jpeg' }, body: new Blob([Buffer.alloc(4 * 1024 * 1024 + 1)]).stream() }
    await assert.rejects(readPhoto(asset), error => error.statusCode === 503)
    await removePhoto(asset)
    assert.deepEqual(requests.at(-1), { key: asset.key, deleted: true })
    await assert.rejects(readPhoto({ ...asset, backend: 'local' }), error => error.statusCode === 503)
    await assert.rejects(writePhoto({ ...asset, backend: 'supabase' }, Buffer.from('x')), error => error.statusCode === 503)
    delete globalThis.__imageTestBucket
    await assert.rejects(writePhoto(asset, Buffer.from('x')), error => error.statusCode === 503)
  } finally { hooks.deregister(); delete globalThis.__imageTestBucket; restore() }
})
test('real upload HTTP workflow enforces ownership, CSRF, image validation and publication privacy', async () => {
  const directory = await mkdtemp(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'product-photos-'))
  const restore = env({ FARMBUDDY_DATABASE: 'local', FARMBUDDY_IMAGE_STORAGE: 'local', FARMBUDDY_DATA_FILE: join(directory, 'store.json'), FARMBUDDY_UPLOAD_DIR: join(directory, 'uploads'), NODE_ENV: 'production' })
  const { default: auth } = await import('../server/api/[...].js')
  const { default: owner } = await import('../server/api/marketplace.js')
  const { default: upload } = await import('../server/api/product-images/index.post.js')
  const { default: image } = await import('../server/api/product-images/[id].get.js')
  const router = createRouter().post('/api/product-images', upload).get('/api/product-images/:id', image).use('/api/marketplace', owner).use('/api/**', auth)
  const app = createApp().use(defineEventHandler(async event => {
    if (event.node.req.headers['x-test-nitro-body'] !== '1') return
    const chunks = []
    for await (const chunk of event.node.req) chunks.push(Buffer.from(chunk))
    event.node.req.body = new Uint8Array(Buffer.concat(chunks))
    event.node.req.iterator = undefined
  })).use(router)
  const server = createServer(toNodeListener(app))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  async function json(path, input, cookie, expected = 200) {
    const response = await fetch(base + path, { method: input ? 'POST' : 'GET', headers: { Origin: base.replace('http:', 'https:'), 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: input ? JSON.stringify(input) : undefined })
    assert.equal(response.status, expected, await response.clone().text())
    return { data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#f9c23c' } }).png().toBuffer()
  async function photo(bytes, cookie, headers = {}) {
    return fetch(base + '/api/product-images', { method: 'POST', headers: { Origin: base.replace('http:', 'https:'), 'Content-Type': 'image/png', ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: bytes })
  }
  try {
    assert.equal((await photo(png)).status, 401)
    const a = await json('/api/auth/register', { name: 'Photo owner', email: 'photos-owner@example.test', password: 'test-long-password' })
    const b = await json('/api/auth/register', { name: 'Other owner', email: 'photos-other@example.test', password: 'test-long-password' })
    assert.equal((await photo(png, a.cookie, { Origin: 'https://evil.example' })).status, 403)
    assert.equal((await photo(png, a.cookie, { 'Sec-Fetch-Site': 'cross-site' })).status, 403)
    assert.equal((await photo(Buffer.from('not an image'), a.cookie)).status, 415)
    assert.equal((await photo(png, a.cookie, { 'Content-Type': 'image/jpeg' })).status, 415)
    assert.equal((await photo(Buffer.alloc(MAX_PHOTO_BYTES + 1), a.cookie)).status, 413)
    const workerUpload = await photo(png, a.cookie, { 'x-test-nitro-body': '1' })
    assert.equal(workerUpload.status, 200, await workerUpload.clone().text())
    const workerPhoto = await workerUpload.json()
    assert.equal(workerPhoto.width, 40)
    assert.equal(workerPhoto.height, 30)
    assert.equal((await fetch(base + workerPhoto.imageUrl)).status, 404)
    assert.equal((await fetch(base + workerPhoto.imageUrl, { headers: { Cookie: a.cookie } })).status, 200)
    const uploaded = await photo(png, a.cookie)
    assert.equal(uploaded.status, 200, await uploaded.clone().text())
    const result = await uploaded.json()
    assert.match(result.imageUrl, /^\/api\/product-images\/[a-f0-9-]{36}$/)
    assert.deepEqual(Object.keys(result).sort(), ['height', 'imageUrl', 'width'])
    assert.equal((await fetch(base + result.imageUrl)).status, 404)
    assert.equal((await fetch(base + result.imageUrl, { headers: { Cookie: b.cookie } })).status, 404)
    const own = await fetch(base + result.imageUrl, { headers: { Cookie: a.cookie } })
    assert.equal(own.status, 200)
    assert.equal(own.headers.get('content-type'), 'image/jpeg')
    assert.equal(own.headers.get('cache-control'), 'no-store')
    assert.equal((await sharp(Buffer.from(await own.arrayBuffer())).metadata()).format, 'jpeg')
    const configure = { action: 'configure', slug: 'photo-farm', name: 'Photo farm', contact: '', contactConsent: false, published: true }
    const product = { action: 'saveProduct', name: 'Maize', description: '', price: 2000, quantity: 20, currency: 'NGN', unit: 'kg', imageUrl: result.imageUrl, published: false }
    await json('/api/marketplace', product, b.cookie, 400)
    await json('/api/marketplace', configure, a.cookie)
    const saved = await json('/api/marketplace', product, a.cookie)
    const id = saved.data.products[0].id
    assert.equal((await fetch(base + result.imageUrl)).status, 404)
    await json('/api/marketplace', { ...product, id, published: true }, a.cookie)
    assert.equal((await fetch(base + result.imageUrl)).status, 200)
    await json('/api/marketplace', { ...configure, published: false }, a.cookie)
    assert.equal((await fetch(base + result.imageUrl)).status, 404)
    assert.equal((await fetch(base + result.imageUrl, { headers: { Cookie: a.cookie } })).status, 200)
    const persisted = JSON.parse(await readFile(join(directory, 'store.json'), 'utf8'))
    assert.equal(persisted.marketplaceImages[0].backend, 'local')
    assert.equal(persisted.marketplaceImages[0].ownerId, a.data.user.id)
    console.log('PASS phone upload, decoded JPEG storage, own-image preview, cross-farm denial and public unpublish revocation')
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); restore(); await rm(directory, { recursive: true, force: true }) }
})
