import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import sharp from 'sharp'

const directory = await mkdtemp(join(tmpdir(), 'farmbuddy-nitro-'))
const reservation = createServer()
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
const port = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
const base = `http://127.0.0.1:${port}`
let child
let logs = ''
async function start() {
  child = spawn(process.execPath, ['.output/server/index.mjs'], {
    env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), FARMBUDDY_DATA_FILE: join(directory, 'store.json'), FARMBUDDY_UPLOAD_DIR: join(directory, 'uploads'), FARMBUDDY_AUTH: 'local', FARMBUDDY_DATABASE: 'local', FARMBUDDY_IMAGE_STORAGE: 'local', OPENAI_API_KEY: '', PLANTNET_API_KEY: '', ROBOFLOW_API_KEY: '', FARMBUDDY_EXPERIMENTAL_ANIMAL_SCAN: 'false', YARNGPT_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', data => { logs += data })
  child.stderr.on('data', data => { logs += data })
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(base + '/api/auth/me')
      if (response.status === 401) return
    } catch {}
    if (child.exitCode !== null) throw new Error(logs)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Nitro did not become ready: ${logs}`)
}
async function stop() {
  if (!child || child.exitCode !== null) return
  await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM') })
}
async function call(path, method = 'GET', body, cookie) {
  const response = await fetch(base + path, {
    method,
    headers: { Origin: `https://127.0.0.1:${port}`, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  assert.equal(response.status, 200, await response.clone().text())
  return { value: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
}
try {
  await start()
  const healthWithoutSession = await fetch(base + '/api/health-alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ latitude: 7.4, longitude: 3.9 }) })
  assert.equal(healthWithoutSession.status, 401, 'Built health route must require authentication')
  const registered = await call('/api/auth/register', 'POST', { name: 'Nitro test', email: 'nitro@example.test', password: 'temporary-password' })
  assert.equal(registered.value.user.onboardingCompleted, false)
  const profile = await call('/api/farm/profile', 'PATCH', { farmName: 'Restart Farm', farmType: 'poultry', onboardingCompleted: true, location: 'Kumasi', mainEnterprises: 'Hens', preferredLanguage: 'English' }, registered.cookie)
  assert.equal(profile.value.user.farmType, 'livestock')
  const record = await call('/api/farm/records', 'POST', { title: 'Restart test', category: 'activity' }, registered.cookie)
  const enterprise = await call('/api/tools/enterprises', 'POST', { kind: 'livestock', name: 'Restart flock', quantity: 20, unit: 'birds', notes: '' }, registered.cookie)
  const inventory = await call('/api/tools/inventory', 'POST', { name: 'Restart feed', quantity: 2, unit: 'bags', threshold: 5, notes: '' }, registered.cookie)
  const referral = await call('/api/tools/referrals', 'POST', { title: 'Restart case', professionalType: 'veterinarian', summary: 'Questions for my chosen veterinarian', status: 'draft' }, registered.cookie)
  const note = await call('/api/tools/notes', 'POST', { id: 'de6cb8ec-6a26-4539-b8c6-6f0196fd5467', title: 'Restart note', body: 'Persistent notebook entry' }, registered.cookie)
  const team = await call('/api/farm-team', 'POST', { action: 'add', name: 'Restart field lead', role: 'Field lead', contact: 'Private roster contact', responsibilities: 'Check the irrigation', status: 'active' }, registered.cookie)
  const configuredStore = await call('/api/marketplace', 'POST', { action: 'configure', slug: 'restart-farm', name: 'Restart Farm', contact: 'Public farm ordering line', contactConsent: true, published: true }, registered.cookie)
  assert.equal(configuredStore.value.farm.slug, 'restart-farm')
  const photoBytes = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#066136' } }).png().toBuffer()
  const upload = await fetch(base + '/api/product-images', { method: 'POST', headers: { Origin: `https://127.0.0.1:${port}`, Cookie: registered.cookie, 'Content-Type': 'image/png' }, body: photoBytes })
  assert.equal(upload.status, 200, await upload.clone().text())
  const photo = await upload.json()
  assert.equal((await fetch(base + photo.imageUrl)).status, 404, 'Unattached photos remain private')
  const appearance = await call('/api/marketplace', 'POST', { ...configuredStore.value.farm, action: 'configure', headline: 'Fresh from Restart Farm', tagline: 'Explore our latest collection.', coverImageUrl: photo.imageUrl, theme: 'teal', showHero: true }, registered.cookie)
  assert.equal(appearance.value.farm.theme, 'teal')
  assert.equal((await fetch(base + photo.imageUrl)).status, 200, 'Published hero cover works without attaching it to a product')
  await call('/api/marketplace', 'POST', { ...appearance.value.farm, action: 'configure', showHero: false }, registered.cookie)
  assert.equal((await fetch(base + photo.imageUrl)).status, 404, 'Hidden hero revokes cover-only public photo access')
  await call('/api/marketplace', 'POST', { ...appearance.value.farm, action: 'configure' }, registered.cookie)
  const products = await call('/api/marketplace', 'POST', { action: 'saveProduct', name: 'Fresh eggs', description: 'Farm fresh eggs', price: 5000, quantity: 10, unit: 'tray', currency: 'NGN', published: true, imageUrl: photo.imageUrl }, registered.cookie)
  const publishedPhoto = await fetch(base + photo.imageUrl)
  assert.equal(publishedPhoto.status, 200)
  assert.equal((await sharp(Buffer.from(await publishedPhoto.arrayBuffer())).metadata()).format, 'jpeg')
  const publicStore = await call('/api/storefront/restart-farm')
  assert.equal(publicStore.value.products[0].name, 'Fresh eggs')
  assert.equal(publicStore.value.farm.headline, 'Fresh from Restart Farm')
  assert.equal(publicStore.value.farm.tagline, 'Explore our latest collection.')
  assert.equal(publicStore.value.farm.coverImageUrl, photo.imageUrl)
  assert.equal(publicStore.value.farm.theme, 'teal')
  assert.equal(publicStore.value.farm.showHero, true)
  assert.ok(!JSON.stringify(publicStore.value).includes('ownerId'))
  assert.ok(!JSON.stringify(publicStore.value).includes('nitro@example.test'))
  assert.ok(!JSON.stringify(publicStore.value).includes('Private roster contact'))
  const storefrontPage = await fetch(base + '/restart-farm/products')
  assert.equal(storefrontPage.status, 200, 'Public storefront page is packaged')
  assert.match(await storefrontPage.text(), /Fresh from Restart Farm/, 'Saved headline renders in the packaged storefront')
  assert.equal((await fetch(base + '/api/farm-team')).status, 401)
  assert.equal((await fetch(base + '/api/marketplace')).status, 401)
  assert.equal((await fetch(base + '/api/plant-scan')).status, 401)
  assert.deepEqual((await call('/api/plant-scan', 'GET', undefined, registered.cookie)).value, { configured: false, provider: 'Pl@ntNet', animalSupported: false })
  assert.equal((await fetch(base + '/api/animal-scan')).status, 401)
  const animalStatus = (await call('/api/animal-scan', 'GET', undefined, registered.cookie)).value
  assert.equal(animalStatus.configured, false)
  assert.equal(animalStatus.experimental, true)
  assert.equal(animalStatus.animal, 'cattle')
  assert.deepEqual((await call('/api/assistant/status', 'GET', undefined, registered.cookie)).value, { chat: false, photo: false, voice: false })
  assert.equal((await call('/api/community', 'GET', undefined, registered.cookie)).value.profile.visible, false)
  assert.equal((await call('/api/community', 'POST', { action: 'search', latitude: 7.4, longitude: 3.9 }, registered.cookie)).value.farmers.length, 0)
  const noAI = await fetch(base + '/api/assistant/chat', { method: 'POST', headers: { Origin: `https://127.0.0.1:${port}`, 'Content-Type': 'application/json', Cookie: registered.cookie }, body: JSON.stringify({ messages: [{ role: 'user', content: 'How can I inspect my maize?' }] }) })
  assert.equal(noAI.status, 503)
  const cashStock = await call('/api/tools/inventory', 'POST', { name: 'Restart maize', quantity: 0, unit: 'kg', threshold: 1, notes: '' }, registered.cookie)
  const command = (action, fields = {}) => call('/api/management', 'POST', { action, farmId: registered.value.user.id, commandId: randomUUID(), ...fields }, registered.cookie)
  const season = await command('season.create', { name: 'Restart season', kind: 'crops', startsOn: '2026-10-01', endsOn: '2027-03-31' })
  const seasonId = season.value.planning.seasons[0].id
  await command('harvest.create', { seasonId, inventoryId: cashStock.value.inventory.id, quantity: 10, date: '2026-10-24' })
  const sale = await command('orders.create', { seasonId, inventoryId: cashStock.value.inventory.id, quantity: 4, unitPrice: 25.5, customer: 'Restart buyer', date: '2026-10-24' })
  const orderId = sale.value.business.orders[0].id
  const confirmed = await command('orders.confirm', { id: orderId })
  assert.equal(confirmed.value.inventory.find(row => row.id === cashStock.value.inventory.id).quantity, 6)
  assert.equal(confirmed.value.business.reports.seasons[0].incomeMinor, 10200)
  const beforeRestart = (await call('/api/farm', 'GET', undefined, registered.cookie)).value
  await stop()
  await start()
  assert.equal((await call('/api/auth/me', 'GET', undefined, registered.cookie)).value.user.id, registered.value.user.id)
  assert.deepEqual((await call('/api/auth/me', 'GET', undefined, registered.cookie)).value.user, profile.value.user)
  assert.deepEqual((await call('/api/farm', 'GET', undefined, registered.cookie)).value.records, beforeRestart.records)
  assert.ok(beforeRestart.records.some(row => row.id === record.value.record.id))
  const connected = (await call('/api/management', 'GET', undefined, registered.cookie)).value
  assert.equal(connected.business.orders[0].id, orderId)
  assert.equal(connected.business.orders[0].status, 'confirmed')
  assert.equal(connected.inventory.find(row => row.id === cashStock.value.inventory.id).quantity, 6)
  assert.equal(connected.business.reports.seasons[0].profitMinor, 10200)
  const tools = (await call('/api/tools', 'GET', undefined, registered.cookie)).value
  assert.deepEqual(tools.enterprises, [enterprise.value.enterprise])
  assert.deepEqual(tools.inventory.find(row => row.id === inventory.value.inventory.id), inventory.value.inventory)
  assert.deepEqual(tools.referrals, [referral.value.referral])
  assert.deepEqual(tools.notes, [note.value.note])
  assert.deepEqual((await call('/api/farm-team', 'GET', undefined, registered.cookie)).value, team.value)
  assert.deepEqual((await call('/api/marketplace', 'GET', undefined, registered.cookie)).value, products.value)
  assert.deepEqual((await call('/api/storefront/restart-farm')).value, publicStore.value)
  assert.equal((await fetch(base + photo.imageUrl)).status, 200, 'Uploaded image survives server restart')
  await call('/api/auth/logout', 'POST', undefined, registered.cookie)
  assert.equal((await fetch(base + '/api/auth/me', { headers: { Cookie: registered.cookie } })).status, 401)
  console.log('PASS: built Nitro connected harvest/stock/cash/season reports plus auth/tools/AI/community/marketplace/team routes, private/public boundaries, session and data persistence across restart, logout (no live paid provider calls)')
} finally {
  await stop()
  await rm(directory, { recursive: true, force: true })
}
