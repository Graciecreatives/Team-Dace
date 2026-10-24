import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createApp, createRouter, toNodeListener } from 'h3'
import { farmSlug, safeImage, publicCatalog } from '../server/utils/marketplace.js'

test('marketplace validates slugs and safe browser image URLs', () => {
  for (const slug of ['api', 'login', 'dashboard', 'onboarding', '../farm', 'Farm', 'a', '-farm', 'farm--name', 'a'.repeat(61)]) assert.throws(() => farmSlug(slug))
  assert.equal(farmSlug('green-acre-2'), 'green-acre-2')
  for (const url of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'http://example.com/a', 'https://user:pass@example.com/a', 'https://localhost/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://10.0.0.1/a', 'https://host.internal/a', 'https://2130706433/a']) assert.throws(() => safeImage(url))
  assert.equal(safeImage('https://images.example.com/a.jpg'), 'https://images.example.com/a.jpg')
  assert.equal(safeImage(), '')
  assert.equal(publicCatalog({ marketplaceFarms: [{ ownerId: 'a', name: 'Public farm', slug: 'farm', published: true, contact: 'secret', contactConsent: false }], marketplaceProducts: [] }, 'farm').farm.contact, '')
})

test('marketplace HTTP ownership, privacy, persistence, CSRF and publication lifecycle', async () => {
  const directory = await mkdtemp(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'marketplace-'))
  process.env.FARMBUDDY_DATA_FILE = join(directory, 'store.json')
  process.env.NODE_ENV = 'production'
  const { default: auth } = await import('../server/api/[...].js')
  const { default: owner } = await import('../server/api/marketplace.js')
  const { default: storefront } = await import('../server/api/storefront/[slug].get.js')
  const router = createRouter().use('/api/marketplace', owner).get('/api/storefront/:slug', storefront).use('/api/**', auth)
  const server = createServer(toNodeListener(createApp().use(router)))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  let checks = 0
  async function request(path, method = 'GET', input, cookie, expected = 200, headers = {}) {
    const response = await fetch(base + path, { method, headers: { ...(method === 'GET' ? {} : { Origin: base.replace('http:', 'https:'), 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: input === undefined ? undefined : JSON.stringify(input) })
    const body = await response.json()
    assert.equal(response.status, expected, JSON.stringify(body)); checks++
    assert.equal(response.headers.get('cache-control'), 'no-store')
    return { body, cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  const configure = { action: 'configure', slug: 'green-acre', name: 'Public Farm', contact: 'Order on 555-0123', contactConsent: true, published: true }
  const product = { action: 'saveProduct', name: 'Tomatoes', description: 'Fresh harvest', price: 1200.50, quantity: 20, unit: 'kg', currency: 'NGN', imageUrl: '', published: false }
  try {
    await request('/api/marketplace', 'GET', undefined, undefined, 401)
    await request('/api/marketplace', 'POST', configure, undefined, 401)
    const register = name => request('/api/auth/register', 'POST', { name, email: `${name}@private.example`, password: 'test-password-long', farmName: 'PRIVATE FARM PROFILE', farmType: 'mixed' })
    const a = await register('Alice'), b = await register('Bob')
    assert.deepEqual((await request('/api/marketplace', 'GET', undefined, a.cookie)).body.products, [])
    await request('/api/marketplace', 'POST', { ...configure, contactConsent: false }, a.cookie, 400)
    await request('/api/marketplace', 'POST', { ...configure, slug: 'api' }, a.cookie, 400)
    await request('/api/marketplace', 'POST', configure, a.cookie, 403, { Origin: 'https://evil.example' })
    await request('/api/marketplace', 'POST', configure, a.cookie, 403, { 'Sec-Fetch-Site': 'cross-site' })
    await request('/api/marketplace', 'POST', configure, a.cookie)
    await request('/api/marketplace', 'POST', configure, b.cookie, 409)
    const created = await request('/api/marketplace', 'POST', product, a.cookie)
    const id = created.body.products[0].id
    assert.deepEqual((await request('/api/storefront/green-acre')).body.products, [])
    await request('/api/marketplace', 'POST', { ...product, id, published: true }, b.cookie, 404)
    await request('/api/marketplace', 'POST', { action: 'deleteProduct', id }, b.cookie, 404)
    for (const invalid of [{ price: -1 }, { price: 1.001 }, { price: '10' }, { quantity: -2 }, { published: 'true' }, { name: '<script>' }, { imageUrl: 'javascript:alert(1)' }, { currency: 'XXX' }]) await request('/api/marketplace', 'POST', { ...product, ...invalid }, a.cookie, 400)
    await request('/api/marketplace', 'POST', { ...product, id, published: true }, a.cookie)
    const visible = (await request('/api/storefront/green-acre')).body
    assert.equal(visible.products.length, 1)
    assert.equal(visible.farm.contact, configure.contact)
    assert.deepEqual(Object.keys(visible.farm).sort(), ['contact', 'name', 'slug'])
    for (const secret of ['Alice', 'private.example', 'PRIVATE FARM PROFILE', 'ownerId', 'userId', 'password', 'tokenHash']) assert.ok(!JSON.stringify(visible).includes(secret), secret)
    assert.equal((await request('/api/marketplace', 'GET', undefined, b.cookie)).body.products.length, 0)
    const persisted = JSON.parse(await readFile(process.env.FARMBUDDY_DATA_FILE, 'utf8'))
    assert.equal(persisted.marketplaceProducts[0].id, id)
    assert.equal(persisted.marketplaceFarms[0].slug, 'green-acre')
    await request('/api/marketplace', 'POST', { ...configure, contact: '', contactConsent: false }, a.cookie)
    assert.equal((await request('/api/storefront/green-acre')).body.farm.contact, '')
    await request('/api/marketplace', 'POST', { ...configure, published: false }, a.cookie)
    await request('/api/storefront/green-acre', 'GET', undefined, undefined, 404)
    await request('/api/marketplace', 'POST', { ...configure, slug: 'new-farm' }, a.cookie)
    await request('/api/storefront/green-acre', 'GET', undefined, undefined, 404)
    await request('/api/marketplace', 'POST', { ...product, id, published: false }, a.cookie)
    assert.equal((await request('/api/storefront/new-farm')).body.products.length, 0)
    await request('/api/marketplace', 'POST', { action: 'deleteProduct', id }, a.cookie)
    assert.equal((await request('/api/marketplace', 'GET', undefined, a.cookie)).body.products.length, 0)
    await request('/api/marketplace', 'POST', { action: 'deleteProduct', id }, a.cookie, 404)
    console.log(`PASS ${checks} marketplace HTTP checks`)
  } finally { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }) }
})
