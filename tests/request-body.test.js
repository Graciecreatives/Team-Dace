import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { readBoundedBytes } from '../server/utils/request-body.js'
import { boundedWorkerRequest } from '../cloudflare/request-guard.js'

const event = req => ({ node: { req: { headers: {}, ...req } } })
test('bounded body reader supports buffered Worker bodies and actual Node streams', async () => {
  const buffered = event({ body: Buffer.from('{"ok":true}'), iterator() { throw new Error('Must not call unsupported iterator') } })
  assert.equal((await readBoundedBytes(buffered, 16)).toString(), '{"ok":true}')
  await assert.rejects(readBoundedBytes(buffered, 2), error => error.statusCode === 413)
  assert.equal((await readBoundedBytes(event({ body: new Uint8Array([1, 2]) }), 2)).length, 2)
  await assert.rejects(readBoundedBytes(event({ body: {} }), 32), error => error.statusCode === 400)
  const stream = Readable.from([Buffer.from('ab'), Buffer.from('cd')])
  stream.headers = {}
  assert.equal((await readBoundedBytes({ node: { req: stream } }, 4)).toString(), 'abcd')
  const large = Readable.from([Buffer.alloc(5)])
  large.headers = {}
  await assert.rejects(readBoundedBytes({ node: { req: large } }, 4), error => error.statusCode === 413)
})
test('Worker guard bounds streamed bodies before Nitro and preserves request origin and headers', async () => {
  const get = new Request('https://farm.example/')
  assert.equal(await boundedWorkerRequest(get), get)
  const request = new Request('https://farm.example:8443/api/auth/login', { method: 'POST', headers: { Origin: 'https://farm.example:8443', 'Content-Type': 'application/json' }, body: '{"ok":true}' })
  const bounded = await boundedWorkerRequest(request)
  assert.ok(bounded instanceof Request)
  assert.equal(bounded.url, request.url)
  assert.equal(bounded.headers.get('origin'), 'https://farm.example:8443')
  assert.equal(await bounded.text(), '{"ok":true}')
  let cancelled = false
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(17000)) }, cancel() { cancelled = true } })
  const oversized = new Request('https://farm.example/api/auth/register', { method: 'POST', body, duplex: 'half' })
  const denied = await boundedWorkerRequest(oversized)
  assert.equal(denied.status, 413)
  assert.equal(cancelled, true)
  const photo = await boundedWorkerRequest(new Request('https://farm.example/api/product-images', { method: 'POST', body: new Uint8Array(17000) }))
  assert.ok(photo instanceof Request)
  const assistant = await boundedWorkerRequest(new Request('https://farm.example/api/assistant/chat', { method: 'POST', body: new Uint8Array(17000) }))
  assert.ok(assistant instanceof Request)
  for (const endpoint of ['plant-scan', 'animal-scan']) {
    const scan = await boundedWorkerRequest(new Request(`https://farm.example/api/${endpoint}`, { method: 'POST', body: new Uint8Array(17000) }))
    assert.ok(scan instanceof Request, 'Image scans must not inherit the 16 KB form limit')
    const fullBudget = await boundedWorkerRequest(new Request(`https://farm.example/api/${endpoint}`, { method: 'POST', body: new Uint8Array(4 * 1024 * 1024 + 4096) }))
    assert.ok(fullBudget instanceof Request)
    const tooLarge = await boundedWorkerRequest(new Request(`https://farm.example/api/${endpoint}`, { method: 'POST', body: new Uint8Array(4 * 1024 * 1024 + 4097) }))
    assert.equal(tooLarge.status, 413)
    assert.equal(tooLarge.headers.get('cache-control'), 'no-store')
  }
  const advertised = await boundedWorkerRequest(new Request('https://farm.example/api/auth/login', { method: 'POST', headers: { 'Content-Length': '20000' }, body: 'small' }))
  assert.equal(advertised.status, 413)
})
