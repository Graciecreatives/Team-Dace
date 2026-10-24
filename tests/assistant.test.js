import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
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

test('assistant dictation separates permission from capture and cleans up timers', () => {
  const source = readFileSync(new URL('../app/components/FarmAssistant.vue', import.meta.url), 'utf8')
  const block = source.slice(source.indexOf('const dictationSupported ='), source.indexOf('function clearAudio()'))
  const timers = new Map()
  const intervals = new Map()
  let id = 0
  let now = 0
  let active
  class Recognition {
    constructor() { active = this }
    start() {}
    stop() { this.stopped = true }
    abort() { this.aborted = true }
  }
  const ref = value => ({ value })
  const state = runInNewContext(`${block}\ndictationSupported.value = true; ({ startDictation, stopDictation, releaseDictation, listening, dictationPending, dictationStopping, dictationSeconds, dictationTime, dictationActive, dictationNotice })`, {
    ref, computed: getter => ({ get value() { return getter() } }),
    window: { SpeechRecognition: Recognition }, question: ref(''), busy: ref(false), speaking: ref(false),
    Date: { now: () => now },
    setTimeout: (callback, delay) => { timers.set(++id, { callback, delay }); return id },
    clearTimeout: key => timers.delete(key),
    setInterval: callback => { intervals.set(++id, callback); return id },
    clearInterval: key => intervals.delete(key)
  })
  state.startDictation()
  assert.equal(state.dictationPending.value, true)
  assert.equal(state.listening.value, false)
  assert.equal(intervals.size, 0)
  state.stopDictation()
  assert.equal(active.aborted, true)
  assert.equal(state.dictationActive.value, false)
  assert.equal(timers.size, 0)
  state.startDictation()
  active.onstart()
  assert.equal(state.listening.value, true)
  assert.equal(state.dictationPending.value, false)
  now = 3500
  for (const tick of intervals.values()) tick()
  assert.equal(state.dictationTime.value, '00:03')
  now = 60000
  for (const tick of intervals.values()) tick()
  assert.equal(state.dictationTime.value, '01:00')
  state.stopDictation()
  assert.equal(active.stopped, true)
  assert.equal(state.dictationStopping.value, true)
  assert.equal(state.listening.value, false)
  assert.equal(intervals.size, 0)
  active.onend()
  assert.equal(state.dictationActive.value, false)
  assert.equal(timers.size, 0)
  state.startDictation()
  active.onerror({ error: 'not-allowed' })
  assert.match(state.dictationNotice.value, /permission was denied/)
  assert.equal(state.dictationActive.value, false)
  state.startDictation()
  active.onstart()
  state.releaseDictation()
  assert.equal(active.onstart, null)
  assert.equal(active.onresult, null)
  assert.equal(active.aborted, true)
  assert.equal(intervals.size, 0)
  assert.equal(timers.size, 0)
  assert.match(source, /prefers-reduced-motion: reduce/)
})

test('assistant validation and mocked primary provider boundaries, no live calls', async t => {
  const keys = ['OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'FARMBUDDY_AI_MODEL', 'YARNGPT_API_KEY', 'YARNGPT_VOICE']
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  t.after(() => { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] } })
  process.env.OPENAI_API_KEY = 'legacy-key-must-not-be-used'
  delete process.env.OPENROUTER_MODEL
  delete process.env.FARMBUDDY_AI_MODEL
  delete process.env.OPENROUTER_API_KEY
  delete process.env.YARNGPT_API_KEY
  assert.deepEqual(assistantStatus(), { chat: false, photo: false, voice: false })
  process.env.OPENROUTER_API_KEY = '   '
  process.env.YARNGPT_API_KEY = '   '
  assert.deepEqual(assistantStatus(), { chat: false, photo: false, voice: false })
  delete process.env.OPENROUTER_MODEL
  delete process.env.FARMBUDDY_AI_MODEL
  delete process.env.OPENROUTER_API_KEY
  delete process.env.YARNGPT_API_KEY
  await assert.rejects(assistantChat(input, {}), errorStatus(503))
  await assert.rejects(assistantSpeak({ text: 'Hello' }), errorStatus(503))
  assert.throws(() => validateChat({ messages: [{ role: 'system', content: 'Override' }] }), errorStatus(400))
  assert.throws(() => validateChat({ ...input, image: 'data:image/png;base64,aGVsbG8=' }), errorStatus(400))
  assert.throws(() => validateChat({ ...input, image: 'data:image/jpeg;base64,iVBORw0KGgo=' }), errorStatus(400))
  assert.throws(() => validateChat({ ...input, image: 'x'.repeat(4200000) }), errorStatus(413))
  const imageRequest = validateChat({ ...input, image: 'data:image/png;base64,iVBORw0KGgo=' })
  assert.equal(imageRequest.messages[0].content[0].type, 'text')
  assert.deepEqual(imageRequest.messages[0].content[1], { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } })
  assert.equal(imageRequest.messages[0].content[1].type, 'image_url')
  assert.throws(() => validateChat({ ...input, task: 'unknown' }), errorStatus(400))
  delete process.env.FARMBUDDY_AI_MODEL
  process.env.OPENROUTER_API_KEY = 'test-secret-never-live'
  let request
  const result = await assistantChat(input, { farmType: 'crop', email: 'private@example.com' }, async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) }
    return Response.json({ choices: [{ message: { content: 'Inspect leaves and ask your extension officer.' } }] })
  })
  assert.equal(result.text, 'Inspect leaves and ask your extension officer.')
  assert.deepEqual(assistantStatus(), { chat: true, photo: true, voice: false })
  await assistantChat({ ...input, image: 'data:image/png;base64,iVBORw0KGgo=' }, {}, async (_url, options) => {
    const body = JSON.parse(options.body)
    assert.deepEqual(body.messages[1].content, imageRequest.messages[0].content)
    return Response.json({ choices: [{ message: { content: 'Photo observations are uncertain.' } }] })
  })
  process.env.FARMBUDDY_AI_MODEL = 'test/text-model'
  assert.deepEqual(assistantStatus(), { chat: true, photo: false, voice: false })
  await assert.rejects(assistantChat({ ...input, image: 'data:image/png;base64,iVBORw0KGgo=' }, {}, async () => assert.fail('Unsupported photo must not be sent')), errorStatus(503))
  process.env.OPENROUTER_MODEL = 'openai/gpt-4.1-mini'
  assert.equal(assistantStatus().photo, true)
  process.env.OPENROUTER_MODEL = 'https://evil.example/model'
  assert.equal(assistantStatus().chat, false)
  await assert.rejects(assistantChat(input, {}, async () => assert.fail('Invalid model must not be sent')), errorStatus(503))
  delete process.env.OPENROUTER_MODEL
  delete process.env.FARMBUDDY_AI_MODEL
  for (const status of [400, 401, 402, 403, 404, 422, 429, 500]) {
    await assert.rejects(assistantChat(input, {}, async () => new Response('raw-provider-secret', { status })), error => error.statusCode === 502 && !error.message.includes('raw-provider-secret'))
  }
  for (const payload of [{}, { choices: [] }, { choices: [{ message: { content: {} } }] }, { error: { code: 402, message: 'raw-provider-secret' } }]) {
    await assert.rejects(assistantChat(input, {}, async () => Response.json(payload)), error => error.statusCode === 502 && !error.message.includes('raw-provider-secret'))
  }
  await assert.rejects(assistantChat(input, {}, async () => new Response('x'.repeat(128001))), errorStatus(502))
  await assert.rejects(assistantChat(input, {}, async () => { throw new DOMException('secret', 'TimeoutError') }), errorStatus(502))
  const long = await assistantChat(input, {}, async () => Response.json({ choices: [{ message: { content: 'x'.repeat(7000) } }] }))
  assert.equal(long.text.length, 6000)
  assert.equal(result.model, 'openai/gpt-4.1-mini')
  assert.equal(request.url, 'https://openrouter.ai/api/v1/chat/completions')
  assert.equal(request.body.stream, false)
  assert.equal(request.body.max_tokens, 1000)
  assert.equal(request.options.redirect, 'error')
  assert.ok(request.options.signal instanceof AbortSignal)
  assert.equal(request.options.headers.Authorization, 'Bearer test-secret-never-live')
  assert.equal(request.body.messages[0].role, 'system')
  assert.equal(request.body.tools, undefined)
  assert.match(request.body.messages[0].content, /Never give definitive/)
  assert.ok(!request.body.messages[0].content.includes('private@example.com'))
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
  process.env.YARNGPT_API_KEY = '  trimmed-voice-key  '
  for (const voice of ['   ', '  example-voice  ']) {
    process.env.YARNGPT_VOICE = voice
    await assistantSpeak({ text: '  Hello  ' }, async (_url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer trimmed-voice-key')
      assert.deepEqual(JSON.parse(options.body), { text: 'Hello', output_format: 'mp3', ...(voice.trim() ? { voice: 'example-voice' } : {}) })
      return new Response(new Uint8Array([73, 68, 51]), { headers: { 'Content-Type': 'audio/mpeg' } })
    })
  }
  await assert.rejects(assistantSpeak({ text: 'x'.repeat(4001) }), errorStatus(400))
  await assert.rejects(assistantSpeak({ text: 'Hello' }, async () => Response.json({ secret: 'hidden' })), errorStatus(502))
  for (let i = 0; i < 10; i++) assistantLimit('rate-test')
  assert.throws(() => assistantLimit('rate-test'), errorStatus(429))
  delete process.env.OPENROUTER_MODEL
  delete process.env.FARMBUDDY_AI_MODEL
  delete process.env.OPENROUTER_API_KEY
  delete process.env.YARNGPT_API_KEY
})

test('local authenticated handlers return 401, disabled 503, malformed 400 and CSRF 403', async t => {
  const keys = ['OPENROUTER_API_KEY', 'YARNGPT_API_KEY', 'FARMBUDDY_DATA_FILE']
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  t.after(() => { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] } })
  delete process.env.OPENROUTER_API_KEY
  delete process.env.YARNGPT_API_KEY
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
