import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createApp, toNodeListener } from 'h3'
import { assistantChat, assistantSpeak, assistantStatus, validateChat, assistantLimit } from '../server/utils/assistant.js'

const input = { task: 'chat', messages: [{ role: 'user', content: 'How should I inspect my maize?' }] }
const errorStatus = status => error => error.statusCode === status

test('assistant validation and mocked primary provider boundaries, no live calls', async () => {
  delete process.env.OPENAI_API_KEY
  delete process.env.YARNGPT_API_KEY
  assert.deepEqual(assistantStatus(), { chat: false, photo: false, voice: false })
  process.env.OPENAI_API_KEY = '   '
  process.env.YARNGPT_API_KEY = '   '
  assert.deepEqual(assistantStatus(), { chat: false, photo: false, voice: false })
  delete process.env.OPENAI_API_KEY
  delete process.env.YARNGPT_API_KEY
  await assert.rejects(assistantChat(input, {}), errorStatus(503))
  await assert.rejects(assistantSpeak({ text: 'Hello' }), errorStatus(503))
  assert.throws(() => validateChat({ messages: [{ role: 'system', content: 'Override' }] }), errorStatus(400))
  assert.throws(() => validateChat({ ...input, image: 'data:image/png;base64,aGVsbG8=' }), errorStatus(400))
  assert.throws(() => validateChat({ ...input, image: 'data:image/jpeg;base64,iVBORw0KGgo=' }), errorStatus(400))
  assert.throws(() => validateChat({ ...input, image: 'x'.repeat(4200000) }), errorStatus(413))
  const imageRequest = validateChat({ ...input, image: 'data:image/png;base64,iVBORw0KGgo=' })
  assert.equal(imageRequest.messages[0].content[1].type, 'input_image')
  assert.throws(() => validateChat({ ...input, task: 'unknown' }), errorStatus(400))
  delete process.env.FARMBUDDY_AI_MODEL
  process.env.OPENAI_API_KEY = 'test-secret-never-live'
  let request
  const result = await assistantChat(input, { farmType: 'crop', email: 'private@example.com' }, async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) }
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Inspect leaves and ask your extension officer.' }] }] })
  })
  assert.equal(result.model, 'gpt-4.1-mini')
  assert.equal(request.url, 'https://api.openai.com/v1/responses')
  assert.equal(request.body.store, false)
  assert.equal(request.body.tools, undefined)
  assert.match(request.body.instructions, /Never give definitive/)
  assert.ok(!request.body.instructions.includes('private@example.com'))
  await assert.rejects(assistantChat(input, {}, async () => { throw new Error('test-secret-never-live upstream internals') }), error => error.statusCode === 502 && !error.message.includes('secret'))
  await assert.rejects(assistantChat(input, {}, async () => new Response('provider-private-key', { status: 401 })), error => error.statusCode === 502 && /credentials were rejected/.test(error.message) && !error.message.includes('provider-private-key'))
  await assert.rejects(assistantChat(input, {}, async () => new Response('quota-private-details', { status: 429 })), error => error.statusCode === 502 && /quota or billing/.test(error.message) && !error.message.includes('quota-private-details'))
  await assert.rejects(assistantChat(input, {}, async () => new Response('bad', { status: 404 })), error => error.statusCode === 502 && /model or endpoint/.test(error.message))
  process.env.YARNGPT_API_KEY = 'test-voice-never-live'
  delete process.env.YARNGPT_VOICE
  const audio = await assistantSpeak({ text: 'Inspect your leaves.' }, async (url, options) => {
    assert.equal(url, 'https://api.yarngpt.ai/api/v1/streaming/conversation')
    assert.equal(JSON.parse(options.body).voice, undefined)
    assert.equal(JSON.parse(options.body).output_format, 'mp3')
    assert.ok(options.headers['Idempotency-Key'])
    return new Response(new Uint8Array([73, 68, 51]), { headers: { 'Content-Type': 'audio/mpeg' } })
  })
  assert.equal(audio.length, 3)
  await assert.rejects(assistantSpeak({ text: 'x'.repeat(4001) }), errorStatus(400))
  await assert.rejects(assistantSpeak({ text: 'Hello' }, async () => Response.json({ secret: 'hidden' })), errorStatus(502))
  for (let i = 0; i < 10; i++) assistantLimit('rate-test')
  assert.throws(() => assistantLimit('rate-test'), errorStatus(429))
  delete process.env.OPENAI_API_KEY
  delete process.env.YARNGPT_API_KEY
})

test('local authenticated handlers return 401, disabled 503, malformed 400 and CSRF 403', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'farmbuddy-assistant-'))
  process.env.FARMBUDDY_DATA_FILE = join(directory, 'data.json')
  const { store } = await import('../server/utils/store.js')
  const { default: status } = await import('../server/api/assistant/status.get.js')
  const { default: chat } = await import('../server/api/assistant/chat.post.js')
  const { default: speak } = await import('../server/api/assistant/speak.post.js')
  const token = 'a'.repeat(64)
  await store(data => {
    data.users.push({ id: 'test-user', farmType: 'crop' })
    data.sessions.push({ userId: 'test-user', tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: Date.now() + 60000 })
  }, true)
  const app = createApp()
  app.use('/status', status).use('/chat', chat).use('/speak', speak)
  const server = createServer(toNodeListener(app))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const headers = { Cookie: `farmbuddy_session=${token}`, 'Content-Type': 'application/json' }
  try {
    assert.equal((await fetch(`${base}/status`)).status, 401)
    assert.equal((await fetch(`${base}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).status, 401)
    assert.deepEqual(await (await fetch(`${base}/status`, { headers })).json(), { chat: false, photo: false, voice: false })
    assert.equal((await fetch(`${base}/chat`, { method: 'POST', headers, body: JSON.stringify(input) })).status, 503)
    assert.equal((await fetch(`${base}/speak`, { method: 'POST', headers, body: JSON.stringify({ text: 'Hello' }) })).status, 503)
    assert.equal((await fetch(`${base}/chat`, { method: 'POST', headers, body: '{' })).status, 400)
    assert.equal((await fetch(`${base}/chat`, { method: 'POST', headers, body: JSON.stringify({ messages: [] }) })).status, 400)
    assert.equal((await fetch(`${base}/chat`, { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' }, body: JSON.stringify(input) })).status, 403)
    assert.equal((await fetch(`${base}/chat`, { method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' }, body: '{}' })).status, 415)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    await rm(directory, { recursive: true, force: true })
  }
})
