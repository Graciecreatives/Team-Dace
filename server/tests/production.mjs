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
    env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), FARMBUDDY_DATA_FILE: join(directory, 'store.json') },
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
  const registered = await call('/api/auth/register', 'POST', { name: 'Nitro test', email: 'nitro@example.test', password: 'temporary-password' })
  const record = await call('/api/farm/records', 'POST', { title: 'Restart test', category: 'activity' }, registered.cookie)
  await stop()
  await start()
  assert.equal((await call('/api/auth/me', 'GET', undefined, registered.cookie)).value.user.id, registered.value.user.id)
  assert.deepEqual((await call('/api/farm', 'GET', undefined, registered.cookie)).value.records, [record.value.record])
  await call('/api/auth/logout', 'POST', undefined, registered.cookie)
  assert.equal((await fetch(base + '/api/auth/me', { headers: { Cookie: registered.cookie } })).status, 401)
  console.log('PASS: built Nitro routing, registration, record creation, session and data persistence across process restart, logout')
} finally {
  await stop()
  await rm(directory, { recursive: true, force: true })
}
