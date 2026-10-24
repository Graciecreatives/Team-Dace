import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp, createRouter, toNodeListener } from 'h3'
import sharp from 'sharp'
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
test('Supabase Storage uses a private bucket, bounded fixed endpoints and no secret-bearing photo URLs', async () => {
  const restore = env({ FARMBUDDY_DATABASE: 'supabase', SUPABASE_DATABASE_URL: 'postgres://test@localhost/test', SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'private-test-service-key', SUPABASE_STORAGE_BUCKET: 'farm-products', FARMBUDDY_IMAGE_STORAGE: undefined })
  const asset = { backend: 'supabase', key: photoKey('owner', '12345678-1234-1234-1234-123456789abc') }
  try {
    assert.equal(photoBackend(), 'supabase')
    process.env.FARMBUDDY_IMAGE_STORAGE = 'local'
    assert.throws(photoBackend, error => error.statusCode === 503)
    delete process.env.FARMBUDDY_IMAGE_STORAGE
    const requests = []
    await writePhoto(asset, Buffer.from('jpeg'), async (url, options) => {
      requests.push({ url, options })
      assert.equal(options.redirect, 'error')
      assert.ok(options.signal)
      assert.equal(options.headers.apikey, 'private-test-service-key')
      return url.includes('/bucket/') ? Response.json({ public: false }) : Response.json({ Key: asset.key })
    })
    assert.equal(requests.length, 2)
    assert.match(requests[1].url, /\/storage\/v1\/object\/farm-products\//)
    assert.equal(requests[1].options.headers['x-upsert'], 'false')
    assert.ok(!requests[1].url.includes('private-test-service-key'))
    let writes = 0
    await assert.rejects(writePhoto(asset, Buffer.from('jpeg'), async () => { writes++; return Response.json({ public: true }) }), error => error.statusCode === 503)
    assert.equal(writes, 1, 'Public buckets must not receive uploads')
    const read = await readPhoto(asset, async (url, options) => {
      assert.match(url, /\/object\/authenticated\/farm-products\//)
      assert.equal(options.headers.apikey, 'private-test-service-key')
      return new Response(Buffer.from('test-jpeg'), { headers: { 'Content-Type': 'image/jpeg' } })
    })
    assert.equal(read.toString(), 'test-jpeg')
    await assert.rejects(readPhoto(asset, async () => new Response('private provider internals', { status: 401 })), error => error.statusCode === 503 && !error.message.includes('internals'))
    await assert.rejects(readPhoto(asset, async () => new Response('x', { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': 9000000 } })), error => error.statusCode === 503)
    await removePhoto(asset, async (url, options) => { assert.equal(options.method, 'DELETE'); assert.deepEqual(JSON.parse(options.body).prefixes, [asset.key]); return Response.json([]) })
  } finally { restore() }
})
test('real upload HTTP workflow enforces ownership, CSRF, image validation and publication privacy', async () => {
  const directory = await mkdtemp(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'product-photos-'))
  const restore = env({ FARMBUDDY_DATABASE: 'local', FARMBUDDY_IMAGE_STORAGE: 'local', FARMBUDDY_DATA_FILE: join(directory, 'store.json'), FARMBUDDY_UPLOAD_DIR: join(directory, 'uploads'), NODE_ENV: 'production' })
  const { default: auth } = await import('../server/api/[...].js')
  const { default: owner } = await import('../server/api/marketplace.js')
  const { default: upload } = await import('../server/api/product-images/index.post.js')
  const { default: image } = await import('../server/api/product-images/[id].get.js')
  const router = createRouter().post('/api/product-images', upload).get('/api/product-images/:id', image).use('/api/marketplace', owner).use('/api/**', auth)
  const server = createServer(toNodeListener(createApp().use(router)))
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
