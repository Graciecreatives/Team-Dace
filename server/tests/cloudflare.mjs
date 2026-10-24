import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFile, access } from 'node:fs/promises'
import sharp from 'sharp'

const base = process.env.FARMBUDDY_WORKER_TEST_URL || 'http://127.0.0.1:8787'
const url = new URL(base)
if (!['127.0.0.1', 'localhost'].includes(url.hostname) && !(process.argv.includes('--remote') && url.protocol === 'https:' && url.hostname.endsWith('.workers.dev'))) throw new Error('Only local Workers or explicitly selected HTTPS workers.dev smoke tests are allowed')
try {
  await access('.data/cloudflare-smoke-account.json')
  throw new Error('A previous smoke account manifest exists. Clean up that exact test account before running another smoke test.')
} catch (error) { if (error.code !== 'ENOENT') throw error }
const id = randomUUID()
const email = `cloudflare-qa-${id}@example.test`
const password = randomUUID() + randomUUID()
let cookie
const origin = url.origin
async function call(path, method = 'GET', body, useCookie = true) {
  const response = await fetch(base + path, {
    method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(useCookie && cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  assert.equal(response.status, 200, `${path}: ${await response.clone().text()}`)
  return { value: await response.json(), response }
}
assert.equal((await fetch(base)).status, 200)
assert.deepEqual((await call('/api/auth/config')).value, { mode: 'cloudflare', configured: true })
const registered = await call('/api/auth/register', 'POST', { name: 'Cloudflare validation', email, password })
cookie = registered.response.headers.get('set-cookie')?.split(';')[0]
assert.ok(cookie)
assert.match(registered.response.headers.get('set-cookie'), /HttpOnly/)
if (url.protocol === 'https:') assert.match(registered.response.headers.get('set-cookie'), /Secure/)
const ownerId = registered.value.user.id
await writeFile('.data/cloudflare-smoke-account.json', JSON.stringify({ ownerId, email, imageId: null }), { mode: 0o600, flag: 'wx' })
await call('/api/farm/profile', 'PATCH', { farmName: 'Cloudflare validation', farmType: 'mixed', onboardingCompleted: true })
const serviceStatus = await call('/api/services/status')
assert.equal(serviceStatus.response.headers.get('cache-control'), 'no-store')
assert.equal(serviceStatus.value.configurationOnly, true)
for (const value of Object.values(serviceStatus.value.services)) assert.equal(typeof value, 'boolean')
assert.equal((await fetch(base + '/api/services/status')).status, 401)
for (const [path, provider] of [['/api/plant-scan', 'Pl@ntNet'], ['/api/animal-scan', 'Roboflow']]) {
  assert.equal((await fetch(base + path)).status, 401)
  const status = await call(path)
  assert.equal(status.response.headers.get('cache-control'), 'no-store')
  assert.equal(status.value.provider, provider)
  assert.equal(typeof status.value.configured, 'boolean')
  // Exercise the actual Worker upload guard without sending photos to a provider.
  const denied = await fetch(base + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ padding: 'x'.repeat(17000) }) })
  assert.equal(denied.status, 401, 'Photo-sized request must reach auth, not fail at the old 16 KB guard')
}
const manual = (await call('/api/farm/records', 'POST', { title: 'Validation seed', category: 'expense', amount: 12.5, note: 'Disposable smoke entry' })).value.record
assert.equal(manual.updatedAt, manual.createdAt)
const revised = (await call(`/api/farm/records/${manual.id}`, 'PATCH', { title: 'Validation seed revised', amount: 15, expectedUpdatedAt: manual.updatedAt })).value.record
assert.equal(revised.amount, 15)
assert.notEqual(revised.updatedAt, manual.updatedAt)
const conflict = await fetch(base + `/api/farm/records/${manual.id}`, { method: 'PATCH', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 20, expectedUpdatedAt: manual.updatedAt }) })
assert.equal(conflict.status, 409)
let reminder = (await call('/api/farm/reminders', 'POST', { title: 'Validation water', date: '2026-10-25' })).value.reminder
reminder = (await call(`/api/farm/reminders/${reminder.id}`, 'PATCH', { title: 'Validation water revised', completed: true, expectedUpdatedAt: reminder.updatedAt })).value.reminder
assert.equal(reminder.completed, true)
const journal = (await call('/api/farm')).value
assert.equal(journal.records.find(row => row.id === manual.id).amount, 15)
assert.equal(journal.reminders.find(row => row.id === reminder.id).title, 'Validation water revised')
await call(`/api/farm/reminders/${reminder.id}`, 'DELETE')
await call(`/api/farm/records/${manual.id}`, 'DELETE')
const inventory = (await call('/api/tools/inventory', 'POST', { name: 'Validation maize', quantity: 0, unit: 'kg', threshold: 1 })).value.inventory
const command = (action, fields = {}) => call('/api/management', 'POST', { action, farmId: ownerId, commandId: randomUUID(), ...fields })
const season = await command('season.create', { name: 'Cloudflare season', kind: 'crops', startsOn: '2026-10-01', endsOn: '2027-03-31' })
const seasonId = season.value.planning.seasons[0].id
await command('harvest.create', { seasonId, inventoryId: inventory.id, quantity: 10, date: '2026-10-24' })
const sale = await command('orders.create', { seasonId, inventoryId: inventory.id, quantity: 4, unitPrice: 25.5, customer: 'Validation buyer', date: '2026-10-24' })
const confirmation = { action: 'orders.confirm', farmId: ownerId, commandId: randomUUID(), id: sale.value.business.orders[0].id }
const confirmed = (await call('/api/management', 'POST', confirmation)).value
assert.equal(confirmed.inventory.find(row => row.id === inventory.id).quantity, 6)
assert.equal(confirmed.business.reports.seasons[0].incomeMinor, 10200)
const replay = (await call('/api/management', 'POST', confirmation)).value
assert.equal(replay.inventory.find(row => row.id === inventory.id).quantity, 6)
const directCommand = { action: 'orders.record', farmId: ownerId, commandId: randomUUID(), seasonId, inventoryId: inventory.id, quantity: 1, unitPrice: 10, customer: 'Validation walk-in buyer', date: '2026-10-24' }
const direct = (await call('/api/management', 'POST', directCommand)).value
assert.equal(direct.inventory.find(row => row.id === inventory.id).quantity, 5)
assert.equal(direct.business.reports.seasons[0].incomeMinor, 11200)
const paidOrder = direct.business.orders.find(row => row.customer === directCommand.customer)
assert.equal(paidOrder.status, 'confirmed')
assert.equal(paidOrder.amountMinor, 1000)
assert.ok(paidOrder.invoiceId)
const directReplay = (await call('/api/management', 'POST', directCommand)).value
assert.equal(directReplay.inventory.find(row => row.id === inventory.id).quantity, 5)
assert.equal(directReplay.business.reports.seasons[0].incomeMinor, 11200)
assert.equal(directReplay.business.orders.filter(row => row.customer === directCommand.customer).length, 1)
const bytes = await sharp({ create: { width: 64, height: 32, channels: 3, background: '#076a37' } }).withMetadata({ orientation: 6 }).jpeg().toBuffer()
const upload = await fetch(base + '/api/product-images', { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'image/jpeg' }, body: bytes })
assert.equal(upload.status, 200, await upload.clone().text())
const photo = await upload.json()
await writeFile('.data/cloudflare-smoke-account.json', JSON.stringify({ ownerId, email, imageId: photo.id || photo.imageUrl.split('/').at(-1) }), { mode: 0o600 })
assert.equal((await fetch(base + photo.imageUrl)).status, 404)
const ownPhoto = await fetch(base + photo.imageUrl, { headers: { Cookie: cookie } })
assert.equal(ownPhoto.status, 200)
const metadata = await sharp(Buffer.from(await ownPhoto.arrayBuffer())).metadata()
assert.equal(metadata.format, 'jpeg')
assert.equal(metadata.width, 32)
assert.equal(metadata.height, 64)
assert.equal(metadata.exif, undefined)
const slug = `validation-${id.slice(0, 8)}`
const appearance = { action: 'configure', slug, name: 'Validation farm', contact: 'Validation ordering contact', contactConsent: true, published: true, headline: 'Fresh from the validation farm', tagline: 'A temporary test collection', theme: 'sage', showHero: true, coverImageUrl: photo.imageUrl }
await call('/api/marketplace', 'POST', appearance)
assert.equal((await fetch(base + photo.imageUrl)).status, 200, 'Published cover is visible before any product references it')
await call('/api/marketplace', 'POST', { ...appearance, showHero: false })
assert.equal((await fetch(base + photo.imageUrl)).status, 404, 'Hiding hero revokes otherwise private cover')
await call('/api/marketplace', 'POST', appearance)
await call('/api/marketplace', 'POST', { action: 'saveProduct', name: 'Validation maize', description: 'Temporary test', price: 100, quantity: 6, unit: 'kg', currency: 'NGN', published: true, imageUrl: photo.imageUrl })
assert.equal((await fetch(base + photo.imageUrl)).status, 200)
const publicStore = (await call(`/api/storefront/${slug}`, 'GET', undefined, false)).value
assert.ok(!JSON.stringify(publicStore).includes(email))
assert.ok(!JSON.stringify(publicStore).includes(ownerId))
assert.equal(publicStore.farm.headline, appearance.headline)
assert.equal(publicStore.farm.coverImageUrl, photo.imageUrl)
assert.equal(publicStore.farm.theme, 'sage')
const storefrontPage = await fetch(`${base}/${slug}/products`)
assert.equal(storefrontPage.status, 200)
assert.match(await storefrontPage.text(), /Fresh from the validation farm/)
await call('/api/marketplace', 'POST', { action: 'configure', slug, name: 'Validation farm', contact: 'Validation ordering contact', contactConsent: true, published: false })
assert.equal((await fetch(base + photo.imageUrl)).status, 404)
await call('/api/auth/logout', 'POST')
assert.equal((await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } })).status, 401)
const loggedIn = await call('/api/auth/login', 'POST', { email, password }, false)
cookie = loggedIn.response.headers.get('set-cookie')?.split(';')[0]
assert.equal((await call('/api/auth/me')).value.user.id, ownerId)
assert.equal((await call('/api/management')).value.inventory.find(row => row.id === inventory.id).quantity, 5)
const forbidden = await fetch(base + '/api/farm/records', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://attacker.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Denied', category: 'activity' }) })
assert.equal(forbidden.status, 403)
await call('/api/auth/logout', 'POST')
console.log('PASS Worker auth, versioned journal/reminder CRUD, private service status, D1 connected harvest-stock-sale-bookkeeping and replay, private R2 WASM photo orientation/metadata/publication and customizable hero privacy, login persistence and CSRF. Disposable account manifest saved privately for operator cleanup.')
