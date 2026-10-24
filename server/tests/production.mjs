import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'

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
    env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), FARMBUDDY_DATA_FILE: join(directory, 'store.json'), OPENAI_API_KEY: '', YARNGPT_API_KEY: '' },
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
  const products = await call('/api/marketplace', 'POST', { action: 'saveProduct', name: 'Fresh eggs', description: 'Farm fresh eggs', price: 5000, quantity: 10, unit: 'tray', currency: 'NGN', published: true, imageUrl: '' }, registered.cookie)
  const publicStore = await call('/api/storefront/restart-farm')
  assert.equal(publicStore.value.products[0].name, 'Fresh eggs')
  assert.ok(!JSON.stringify(publicStore.value).includes('ownerId'))
  assert.ok(!JSON.stringify(publicStore.value).includes('nitro@example.test'))
  assert.ok(!JSON.stringify(publicStore.value).includes('Private roster contact'))
  assert.equal((await fetch(base + '/restart-farm/products')).status, 200, 'Public storefront page is packaged')
  assert.equal((await fetch(base + '/api/farm-team')).status, 401)
  assert.equal((await fetch(base + '/api/marketplace')).status, 401)
  assert.deepEqual((await call('/api/assistant/status', 'GET', undefined, registered.cookie)).value, { chat: false, photo: false, voice: false })
  assert.equal((await call('/api/community', 'GET', undefined, registered.cookie)).value.profile.visible, false)
  assert.equal((await call('/api/community', 'POST', { action: 'search', latitude: 7.4, longitude: 3.9 }, registered.cookie)).value.farmers.length, 0)
  const noAI = await fetch(base + '/api/assistant/chat', { method: 'POST', headers: { Origin: `https://127.0.0.1:${port}`, 'Content-Type': 'application/json', Cookie: registered.cookie }, body: JSON.stringify({ messages: [{ role: 'user', content: 'How can I inspect my maize?' }] }) })
  assert.equal(noAI.status, 503)
  await stop()
  await start()
  assert.equal((await call('/api/auth/me', 'GET', undefined, registered.cookie)).value.user.id, registered.value.user.id)
  assert.deepEqual((await call('/api/auth/me', 'GET', undefined, registered.cookie)).value.user, profile.value.user)
  assert.deepEqual((await call('/api/farm', 'GET', undefined, registered.cookie)).value.records, [record.value.record])
  const tools = (await call('/api/tools', 'GET', undefined, registered.cookie)).value
  assert.deepEqual(tools.enterprises, [enterprise.value.enterprise])
  assert.deepEqual(tools.inventory, [inventory.value.inventory])
  assert.deepEqual(tools.referrals, [referral.value.referral])
  assert.deepEqual(tools.notes, [note.value.note])
  assert.deepEqual((await call('/api/farm-team', 'GET', undefined, registered.cookie)).value, team.value)
  assert.deepEqual((await call('/api/marketplace', 'GET', undefined, registered.cookie)).value, products.value)
  assert.deepEqual((await call('/api/storefront/restart-farm')).value, publicStore.value)
  await call('/api/auth/logout', 'POST', undefined, registered.cookie)
  assert.equal((await fetch(base + '/api/auth/me', { headers: { Cookie: registered.cookie } })).status, 401)
  console.log('PASS: built Nitro auth/tools/AI/community/marketplace/team routes, private/public boundaries, session and data persistence across restart, logout (no live paid provider calls)')
} finally {
  await stop()
  await rm(directory, { recursive: true, force: true })
}
