import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { rollup } from 'rollup'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
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
    window: { SpeechRecognition: Recognition }, navigator: {}, status: ref({ transcription: false }), question: ref(''), busy: ref(false), speaking: ref(false),
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
  const keys = ['FARMBUDDY_AI_MODEL', 'YARNGPT_API_KEY', 'YARNGPT_VOICE']
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  t.after(() => { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] } })
  delete process.env.FARMBUDDY_AI_MODEL
  delete process.env.YARNGPT_API_KEY
  assert.deepEqual(await assistantStatus(), { chat: false, photo: false, voice: false, transcription: false })
  process.env.YARNGPT_API_KEY = '   '
  assert.deepEqual(await assistantStatus(), { chat: false, photo: false, voice: false, transcription: false })
  delete process.env.FARMBUDDY_AI_MODEL
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
  let request
  const native = run => ({ AI: { run } })
  const reply = content => ({ choices: [{ message: { content } }] })
  const env = native(async (model, options) => {
    request = { model, options }
    return { object: 'response', status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Inspect leaves and ask your extension officer.' }] }] }
  })
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => assert.fail('Chat must never make outbound HTTP calls')
  t.after(() => { globalThis.fetch = originalFetch })
  const result = await assistantChat(input, { farmType: 'crop', email: 'private@example.com' }, env)
  assert.equal(result.text, 'Inspect leaves and ask your extension officer.')
  const event = { context: { cloudflare: { env } } }
  assert.deepEqual(await assistantStatus(event), { chat: true, photo: false, voice: false, transcription: true })
  assert.deepEqual(await assistantStatus({ context: { cloudflare: { env: { AI: {} } } } }), { chat: false, photo: false, voice: false, transcription: false })
  assert.deepEqual(await assistantStatus(), { chat: false, photo: false, voice: false, transcription: false })
  await assert.rejects(assistantChat(input, {}), errorStatus(503))
  await assert.rejects(assistantChat({ ...input, image: 'data:image/png;base64,iVBORw0KGgo=' }, {}, native(() => assert.fail('No native vision contract'))), errorStatus(503))
  for (const model of ['https://evil.example/model', 'vendor/not-a-native-model']) {
    process.env.FARMBUDDY_AI_MODEL = model
    assert.equal((await assistantStatus(event)).chat, false)
    assert.equal((await assistantStatus(event)).transcription, true)
    await assert.rejects(assistantChat(input, {}, env), errorStatus(503))
  }
  process.env.FARMBUDDY_AI_MODEL = '@cf/test/text-model'
  assert.equal((await assistantChat(input, {}, env)).model, '@cf/test/text-model')
  assert.equal((await assistantChat(input, {}, { ...env, FARMBUDDY_AI_MODEL: '@cf/test/binding-model' })).model, '@cf/test/binding-model')
  delete process.env.FARMBUDDY_AI_MODEL
  for (const status of [400, 401, 402, 403, 404, 422, 429, 500]) {
    await assert.rejects(assistantChat(input, {}, native(async () => { throw Object.assign(new Error('raw-provider-secret'), { statusCode: status }) })), error => error.statusCode === 502 && !error.message.includes('raw-provider-secret'))
  }
  for (const payload of [{}, { response: 'legacy response' }, { choices: [] }, reply({}), { error: { code: 402, message: 'raw-provider-secret' } }, reply('x'.repeat(128001)), reply('<think>unfinished'), reply('private</think>answer'), reply('<think>secret</think>'), { choices: [{ message: { reasoning_content: 'private' } }] }]) {
    await assert.rejects(assistantChat(input, {}, native(async () => payload)), error => error.statusCode === 502 && !error.message.includes('secret'))
  }
  await assert.rejects(assistantChat(input, {}, native(async () => { throw new DOMException('secret', 'TimeoutError') })), errorStatus(502))
  await assert.rejects(assistantChat(input, {}, native(async () => reply('<think>outer<think>inner</think>private'))), errorStatus(502))
  await t.test('native inference wait is bounded to 45 seconds', async clock => {
    clock.mock.timers.enable({ apis: ['setTimeout'] })
    const pending = assistantChat(input, {}, native(() => new Promise(() => {})))
    const rejected = assert.rejects(pending, errorStatus(502))
    clock.mock.timers.tick(44999)
    let settled = false
    pending.catch(() => { settled = true })
    await Promise.resolve()
    assert.equal(settled, false)
    clock.mock.timers.tick(1)
    await rejected
    clock.mock.timers.reset()
  })
  const cleaned = await assistantChat(input, {}, native(async () => ({ choices: [{ message: { content: '<think>private reasoning</think>Inspect\u0000 leaves.', reasoning_content: 'never expose' } }] })))
  assert.equal(cleaned.text, 'Inspect leaves.')
  const long = await assistantChat(input, {}, native(async () => reply('x'.repeat(7000))))
  assert.equal(long.text.length, 6000)
  await assistantChat(input, {}, env)
  assert.equal(result.model, '@cf/openai/gpt-oss-120b')
  assert.equal(request.model, result.model)
  assert.equal(request.options.stream, false)
  assert.equal(request.options.max_tokens, 1000)
  assert.equal(request.options.messages[0].role, 'system')
  assert.equal(request.options.tools, undefined)
  assert.ok(!request.options.messages[0].content.includes('/no_think'))
  assert.match(request.options.messages[0].content, /Never give definitive/)
  assert.ok(!request.options.messages[0].content.includes('private@example.com'))
  process.env.YARNGPT_API_KEY = 'test-voice-never-live'
  delete process.env.YARNGPT_VOICE
  const audio = await assistantSpeak({ text: 'Inspect your leaves.' }, async (url, options) => {
    assert.equal(url, 'https://api.yarngpt.ai/api/v1/streaming/conversation')
    assert.equal(options.redirect, 'manual')
    assert.ok(options.signal instanceof AbortSignal)
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
  for (const code of [301, 302, 303, 307, 308, 400, 401, 402, 403, 404, 422, 429, 500]) {
    let calls = 0
    await assert.rejects(assistantSpeak({ text: 'Hello' }, async (_url, options) => {
      calls++
      assert.equal(options.redirect, 'manual')
      return new Response('raw-provider-secret', { status: code, headers: { Location: 'https://untrusted.invalid/audio' } })
    }), error => error.statusCode === 502 && !error.message.includes('raw-provider-secret'))
    assert.equal(calls, 1)
  }
  for (const response of [
    new Response(null, { headers: { 'content-type': 'audio/mpeg' } }),
    new Response('', { headers: { 'content-type': 'audio/mpeg' } }),
    new Response('malformed', { headers: { 'content-type': 'application/json' } }),
    new Response(new Uint8Array(8 * 1024 * 1024 + 1), { headers: { 'content-type': 'audio/mpeg' } }),
    new Response(new ReadableStream({ start(controller) { controller.error(new Error('private stream error')) } }), { headers: { 'content-type': 'audio/mpeg' } }),
  ]) await assert.rejects(assistantSpeak({ text: 'Hello' }, async () => response), error => error.statusCode === 502 && !error.message.includes('private'))
  await t.test('speech passes a 45-second cancellation signal and handles timeout privately', async clock => {
    const timeout = AbortSignal.timeout
    const controller = new AbortController()
    clock.mock.method(AbortSignal, 'timeout', milliseconds => {
      assert.equal(milliseconds, 45000)
      return controller.signal
    })
    const pending = assistantSpeak({ text: 'Hello' }, async (_url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
    }))
    const rejected = assert.rejects(pending, error => error.statusCode === 502 && !error.message.includes('private'))
    controller.abort(new DOMException('private timeout', 'TimeoutError'))
    await rejected
    clock.mock.restoreAll()
    assert.equal(AbortSignal.timeout, timeout)
  })
  for (let i = 0; i < 10; i++) assistantLimit('rate-test')
  assert.throws(() => assistantLimit('rate-test'), errorStatus(429))
  delete process.env.FARMBUDDY_AI_MODEL
  delete process.env.YARNGPT_API_KEY
})

test('GPT-OSS Responses output exposes only completed assistant final text and retains Qwen overrides', async () => {
  const message = content => ({ type: 'message', role: 'assistant', status: 'completed', content })
  const text = value => ({ type: 'output_text', text: value })
  const answer = message([text('Inspect leaves.'), text('Ask an extension officer.')])
  const response = output => ({ object: 'response', status: 'completed', output })
  const run = payload => assistantChat(input, {}, { FARMBUDDY_AI_MODEL: '@cf/openai/gpt-oss-120b', AI: { run: async () => payload } })
  const result = await run(response([
    { type: 'reasoning', summary: [{ type: 'summary_text', text: 'private reasoning' }], content: [text('private analysis')] },
    { type: 'function_call', arguments: 'private tool data' },
    { ...message([text('private commentary')]), phase: 'commentary' },
    { ...message([text('private user text')]), role: 'user' },
    answer,
  ]))
  assert.equal(result.text, 'Inspect leaves.\nAsk an extension officer.')
  assert.equal(result.model, '@cf/openai/gpt-oss-120b')
  assert.ok(!JSON.stringify(result).includes('private'))
  for (const payload of [
    response([]), response([{ type: 'reasoning', summary: [text('secret')] }]),
    response([message([])]), response([message([text('  ')])]),
    response([message([text({ secret: true })])]), response([message([null])]),
    response([message([{ type: 'reasoning_text', text: 'secret' }])]),
    response([message([{ type: 'refusal', refusal: 'secret' }])]),
    response([{ ...answer, status: 'incomplete' }]),
    { ...response([answer]), status: 'failed' },
    { ...response([answer]), status: 'in_progress' },
    { ...response([answer]), status: 'incomplete' },
    { ...response([answer]), incomplete_details: { reason: 'max_output_tokens' } },
    { ...response([answer]), error: { message: 'secret' } },
    response([message([text('<|channel|>analysis secret')])]),
    response([message([text('<think>unfinished secret')])]),
    response([message([text('x'.repeat(128001))])]),
    { output: null, choices: [{ message: { content: 'Do not fall back' } }] },
    { output_text: 'Do not trust an unstructured shortcut' },
  ]) await assert.rejects(run(payload), error => error.statusCode === 502 && !error.message.includes('secret'))
  assert.equal((await run(response([message([text('<think>secret</think>Safe advice.')])]))).text, 'Safe advice.')
  assert.equal((await run(response([message([text('x'.repeat(7000))])]))).text.length, 6000)
  const qwen = await assistantChat(input, {}, {
    FARMBUDDY_AI_MODEL: '@cf/qwen/qwen3-30b-a3b-fp8',
    AI: { run: async (model, options) => {
      assert.equal(model, '@cf/qwen/qwen3-30b-a3b-fp8')
      assert.match(options.messages[0].content, /\/no_think/)
      return { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Safe Qwen advice.', reasoning_content: 'secret' } }] }
    } },
  })
  assert.equal(qwen.text, 'Safe Qwen advice.')
})

test('production speech succeeds in workerd and refuses redirects without forwarding text or bearer keys', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'farmbuddy-speech-workerd-'))
  let bundle, worker
  try {
    const entry = join(directory, 'entry.js')
    bundle = await rollup({
      input: entry, external: id => id.startsWith('node:') || id === 'cloudflare:workers',
      plugins: [{ name: 'speech-worker', resolveId(id) { if (id === entry) return entry }, load(id) {
        if (id === entry) return `
          import { Buffer } from 'node:buffer'
          import { assistantSpeak } from ${JSON.stringify(resolve('server/utils/assistant.js'))}
          globalThis.Buffer = Buffer
          export default { async fetch(request, env) {
            process.env.YARNGPT_API_KEY = env.YARNGPT_API_KEY
            delete process.env.YARNGPT_VOICE
            try { return new Response(await assistantSpeak(await request.json()), { headers: { 'content-type': 'audio/mpeg' } }) }
            catch (error) { return Response.json({ message: error.statusMessage || error.message }, { status: error.statusCode || 500 }) }
          } }
        `
      } }, nodeResolve({ preferBuiltins: true, exportConditions: ['workerd'] }), commonjs()],
    })
    const { output } = await bundle.generate({ format: 'esm', entryFileNames: 'worker.js' })
    let providerStatus = 200
    let calls = 0
    worker = new Miniflare(convertV4MiniflareOptions({
      compatibilityDate: '2026-10-24', compatibilityFlags: ['nodejs_compat'], modulesRoot: directory,
      modules: output.map(file => ({ type: 'ESModule', path: join(directory, file.fileName), contents: file.code })),
      bindings: { YARNGPT_API_KEY: 'fake-workerd-voice-key' },
      outboundService: async request => {
        calls++
        assert.equal(request.url, 'https://api.yarngpt.ai/api/v1/streaming/conversation')
        assert.equal(request.method, 'POST')
        assert.equal(request.headers.get('authorization'), 'Bearer fake-workerd-voice-key')
        assert.ok(request.headers.get('idempotency-key'))
        assert.deepEqual(await request.json(), { text: 'Inspect leaves.', output_format: 'mp3' })
        if (providerStatus !== 200) return new Response(null, { status: providerStatus, headers: { Location: 'https://untrusted.invalid/audio' } })
        return new Response(new Uint8Array([73, 68, 51]), { headers: { 'content-type': 'audio/mpeg' } })
      },
    }))
    const speak = () => worker.dispatchFetch('https://worker.test/speak', { method: 'POST', body: JSON.stringify({ text: 'Inspect leaves.' }), headers: { 'content-type': 'application/json' } })
    const response = await speak()
    assert.equal(response.status, 200, await response.clone().text())
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from([73, 68, 51]))
    for (const code of [301, 302, 303, 307, 308]) {
      providerStatus = code
      const before = calls
      const rejected = await speak()
      assert.equal(rejected.status, 502, await rejected.clone().text())
      assert.match((await rejected.json()).message, /YarnGPT is temporarily unavailable/)
      assert.equal(calls, before + 1)
    }
  } finally {
    try { await worker?.dispose(); await bundle?.close() } finally { await rm(directory, { recursive: true, force: true }) }
  }
})

test('local authenticated handlers return 401, disabled 503, malformed 400 and CSRF 403', async t => {
  const keys = ['YARNGPT_API_KEY', 'FARMBUDDY_DATA_FILE']
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  t.after(() => { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] } })
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
    assert.deepEqual(await (await fetch(`${base}/status`, { headers })).json(), { chat: false, photo: false, voice: false, transcription: false })
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
