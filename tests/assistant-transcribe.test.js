import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createApp, defineEventHandler, toNodeListener } from 'h3'
import { assistantTranscribe, validateTranscription, MAX_AUDIO_BYTES, MAX_TRANSCRIBE_BODY, TRANSCRIBE_MODEL } from '../server/utils/assistant-transcribe.js'

const dataURL = (type, bytes) => `data:audio/${type};base64,${bytes.toString('base64')}`
const wav = Buffer.alloc(44)
wav.write('RIFF'); wav.writeUInt32LE(36, 4); wav.write('WAVE', 8)
const input = { audio: dataURL('wav', wav) }
const status = expected => error => error.statusCode === expected

test('strict transcription payload limits, canonical base64, signatures and languages', () => {
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x81, 0, 0, 0])
  const ogg = Buffer.alloc(27); ogg.write('OggS')
  const mp4 = Buffer.alloc(16); mp4.writeUInt32BE(16); mp4.write('ftyp', 4); mp4.write('M4A ', 8)
  for (const [type, bytes] of [['wav', wav], ['webm', webm], ['ogg', ogg], ['mp4', mp4]]) {
    assert.equal(validateTranscription({ audio: dataURL(type, bytes) }).audio, bytes.toString('base64'))
    const bad = Buffer.from(bytes); bad[0] ^= 255
    assert.throws(() => validateTranscription({ audio: dataURL(type, bad) }), status(400))
  }
  for (const language of ['en', 'ha', 'yo', 'fr', 'sw']) assert.equal(validateTranscription({ ...input, language }).language, language)
  assert.equal('language' in validateTranscription(input), false)
  for (const value of [null, [], {}, { ...input, language: 'ig' }, { ...input, language: 'de' }, { ...input, language: null }, { ...input, model: 'https://evil.example' }, { audio: 'https://evil.example/audio' }, { audio: 'data:audio/wav;base64,AB==' }, { audio: dataURL('ogg', wav) }, { audio: 'data:audio/webm;codecs=opus;base64,AAAA' }]) assert.throws(() => validateTranscription(value), status(400))
  const max = Buffer.alloc(MAX_AUDIO_BYTES); wav.copy(max)
  assert.ok(validateTranscription({ audio: dataURL('wav', max) }))
  assert.throws(() => validateTranscription({ audio: dataURL('wav', Buffer.concat([max, Buffer.from([0])])) }), status(413))
})

test('native binding uses documented fixed model/base64/language and bounds output', async t => {
  let call
  const env = { AI: { run: async (...args) => { call = args; return { text: '  Bonjour\u0000  ' } } } }
  assert.deepEqual(await assistantTranscribe({ ...input, language: 'fr' }, env), { text: 'Bonjour' })
  assert.deepEqual(call, [TRANSCRIBE_MODEL, { audio: wav.toString('base64'), language: 'fr', task: 'transcribe' }])
  await assistantTranscribe(input, env)
  assert.equal('language' in call[1], false)
  await assert.rejects(assistantTranscribe(input, {}), status(503))
  for (const result of [null, {}, { text: 42 }, { error: 'secret', text: 'hello' }, { text: 'a'.repeat(128001) }]) await assert.rejects(assistantTranscribe(input, { AI: { run: async () => result } }), status(502))
  await assert.rejects(assistantTranscribe(input, { AI: { run: async () => { throw new Error('private audio secret') } } }), error => error.statusCode === 502 && !error.message.includes('secret'))
  assert.equal((await assistantTranscribe(input, { AI: { run: async () => ({ text: 'a'.repeat(5000) }) } })).text.length, 4000)
  assert.deepEqual(await assistantTranscribe(input, { AI: { run: async () => ({ text: '' }) } }), { text: '' })
  await t.test('45 second wait timeout without live inference', async clock => {
    clock.mock.timers.enable({ apis: ['setTimeout'] })
    const pending = assistantTranscribe(input, { AI: { run: () => new Promise(() => {}) } })
    const rejected = assert.rejects(pending, status(502))
    clock.mock.timers.tick(45000)
    await rejected
    clock.mock.timers.reset()
  })
})

test('real HTTP auth, CSRF, bounded JSON and mocked binding integration', async t => {
  const keys = ['FARMBUDDY_DATA_FILE', 'FARMBUDDY_AUTH', 'FARMBUDDY_DATABASE']
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  const directory = await mkdtemp(join(tmpdir(), 'farmbuddy-transcribe-'))
  process.env.FARMBUDDY_DATA_FILE = join(directory, 'data.json')
  process.env.FARMBUDDY_AUTH = 'local'
  process.env.FARMBUDDY_DATABASE = 'local'
  t.after(async () => {
    for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] }
    await rm(directory, { recursive: true, force: true })
  })
  const { store } = await import('../server/utils/store.js')
  const { default: transcribe } = await import('../server/api/assistant/transcribe.post.js')
  const token = 'b'.repeat(64)
  await store(data => {
    data.users.push({ id: 'transcribe-user', farmType: 'crop' })
    data.sessions.push({ userId: 'transcribe-user', tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: Date.now() + 60000 })
  }, true)
  let calls = 0
  let available = true
  const app = createApp()
  app.use(defineEventHandler(event => { event.context.cloudflare = { env: available ? { AI: { run: async () => { calls++; return { text: 'Inspect maize' } } } } : {} } }))
  app.use('/api/assistant/transcribe', transcribe)
  const server = createServer(toNodeListener(app))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
  const base = `http://127.0.0.1:${server.address().port}`
  const url = `${base}/api/assistant/transcribe`
  const headers = { Cookie: `farmbuddy_session=${token}`, 'Content-Type': 'application/json', Origin: base }
  const post = (body, overrides = {}) => fetch(url, { method: 'POST', headers: { ...headers, ...overrides }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  assert.equal((await post(input, { Cookie: '' })).status, 401)
  assert.equal((await post(input, { Origin: 'https://evil.example' })).status, 403)
  assert.equal((await post(input, { 'Sec-Fetch-Site': 'cross-site' })).status, 403)
  assert.equal((await post(input, { 'Content-Type': 'text/plain' })).status, 415)
  assert.equal((await post('{')).status, 400)
  assert.equal((await post({ audio: 'invalid' })).status, 400)
  assert.equal(calls, 0)
  const response = await post(input)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(await response.json(), { text: 'Inspect maize' })
  assert.equal(calls, 1)
  available = false
  assert.equal((await post(input)).status, 503)
  assert.equal((await post(' '.repeat(MAX_TRANSCRIBE_BODY + 1))).status, 413)
  // Chunked upload exercises actual streaming bounds without Content-Length.
  const chunkedStatus = await new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)) })
    req.on('error', reject)
    req.write(' '.repeat(MAX_TRANSCRIBE_BODY)); req.end(' ')
  })
  assert.equal(chunkedStatus, 413)
  assert.equal(calls, 1)
  for (let index = 0; index < 3; index++) assert.equal((await post(input)).status, 503)
  assert.equal((await post(input)).status, 429)
  assert.equal(calls, 1)
})
