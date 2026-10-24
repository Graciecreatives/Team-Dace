import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as Vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'
import * as notes from '../app/utils/offline-notes.js'
import { createChatRecorder } from '../app/utils/chat-recorder.js'

const { descriptor } = parse(await readFile('app/components/FarmNotes.vue', 'utf8'))
const aliases = { ...Object.fromEntries(Object.entries(Vue).filter(([name]) => /^[A-Za-z_$][\w$]*$/.test(name))), ...notes, createChatRecorder }
const code = compileScript(descriptor, { id: 'voice-test', inlineTemplate: true, genDefaultAs: 'Component' }).content
  .replace(/import \{([^}]+)\} from ["']vue["'];?/g, (_, names) => {
    for (const name of names.split(',')) { const [original, alias] = name.trim().split(/\s+as\s+/); aliases[alias || original] = Vue[original] }
    return ''
  }).replace(/^import .*$/gm, '')
for (const name of ['NotebookPen', 'Plus', 'CloudCheck', 'CloudOff', 'RefreshCw', 'Copy', 'Trash2', 'Mic', 'FileCheck']) aliases[name] = { render: () => null }
const Component = new Function(...Object.keys(aliases), `${code}\nreturn Component`)(...Object.values(aliases))
const node = (type, text = '') => ({ type, tagName: type.toUpperCase(), text, options: [], children: [], props: {}, parent: null, getRootNode() { return globalThis.document }, addEventListener() {}, removeEventListener() {} })
const renderer = Vue.createRenderer({
  insertStaticContent(content, parent, anchor) { const n = node('static', content); n.parent = parent; const i = parent.children.indexOf(anchor); parent.children.splice(i < 0 ? parent.children.length : i, 0, n); return [n, n] },
  createElement: type => node(type), createText: text => node('text', text), createComment: text => node('comment', text),
  setText(n, text) { n.text = text }, setElementText(n, text) { n.text = text; n.children = [] },
  parentNode: n => n.parent, nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1],
  insert(n, parent, anchor) { if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1); n.parent = parent; const i = parent.children.indexOf(anchor); parent.children.splice(i < 0 ? parent.children.length : i, 0, n) },
  remove(n) { if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1) }, patchProp(n, key, _, value) { n.props[key] = value }
})
const all = n => [n, ...n.children.flatMap(all)]
const text = n => n.text + n.children.map(text).join('')
const flush = async () => { for (let i = 0; i < 8; i++) await Vue.nextTick() }
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function mount(t, { native = true, browser = false, permission = Promise.resolve({ getTracks: () => [{ stop() { tracksStopped++ } }] }), statusFailure = false } = {}) {
  tracksStopped = 0
  const requests = [], transcription = deferred(), recorders = [], recognizers = []
  class Recorder {
    static isTypeSupported() { return true }
    constructor(_, options) { this.mimeType = options.mimeType; this.state = 'inactive'; recorders.push(this) }
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['audio']) }); this.onstop?.() }
  }
  class Recognition {
    constructor() { recognizers.push(this); this.aborted = false; this.stopped = false }
    start() {}
    stop() { this.stopped = true }
    abort() { this.aborted = true }
  }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true, mediaDevices: { getUserMedia: () => permission } } })
  globalThis.window = { MediaRecorder: Recorder, SpeechRecognition: browser ? Recognition : undefined, localStorage: { getItem: () => null, setItem() {} }, addEventListener() {}, removeEventListener() {} }
  globalThis.document = {}; globalThis.Document = class {}; globalThis.ShadowRoot = class {}
  globalThis.FileReader = class { readAsDataURL() { this.result = 'data:audio/webm;base64,YXVkaW8='; this.onload() } }
  globalThis.$fetch = async (url, options) => {
    requests.push({ url, ...options })
    if (url.endsWith('/status')) { if (statusFailure) throw new Error('offline'); return { transcription: native } }
    if (url.endsWith('/transcribe')) return transcription.promise
    return {}
  }
  const user = Vue.ref({ id: 'first' }), mode = Vue.ref('voice'), root = node('root')
  const app = renderer.createApp({ setup: () => () => Vue.h(Component, { user: user.value, mode: mode.value }) })
  app.mount(root); t.after(() => app.unmount())
  const button = label => all(root).find(n => n.type === 'button' && text(n).includes(label))
  const click = async label => { button(label).props.onClick(); await flush() }
  const transcript = () => all(root).find(n => n.type === 'textarea')
  return { root, app, user, mode, requests, transcription, recorders, recognizers, button, click, transcript }
}
let tracksStopped = 0

test('Firefox native path releases mic, locks editing, transcribes and requires explicit prepare/review/save', async t => {
  const f = mount(t); await flush()
  assert.equal(f.recorders.length, 0)
  await f.click('Enable microphone')
  assert.match(text(f.root), /Listening. Speak now/)
  assert.equal(f.transcript().props.disabled, true)
  assert.equal(f.button('Prepare record').props.disabled, true)
  assert.equal(all(f.root).find(n => n.type === 'fieldset').props.disabled, true)
  await f.click('Stop dictation')
  assert.ok(tracksStopped > 0)
  assert.equal(f.requests.filter(r => r.url.endsWith('/transcribe')).length, 1)
  assert.equal(f.requests.at(-1).body.language, 'en')
  assert.match(text(f.root), /transcribing audio/)
  f.transcription.resolve({ text: 'We planted maize' }); await flush()
  assert.equal(f.transcript().value, 'We planted maize')
  assert.equal(f.transcript().props.disabled, false)
  assert.equal(f.button('Confirm and save').props.disabled, true)
  await f.click('Prepare record')
  assert.equal(f.requests.filter(r => r.url === '/api/farm/records').length, 0)
  const checkbox = all(f.root).find(n => n.props.type === 'checkbox')
  checkbox.props['onUpdate:modelValue'](true); await flush()
  const form = all(f.root).find(n => n.type === 'form')
  await form.props.onSubmit({ preventDefault() {} }); await flush()
  assert.equal(f.requests.filter(r => r.url === '/api/farm/records').length, 1)
})

for (const language of ['ig-NG', 'yo-NG', 'ha-NG', 'en-GB']) test(`native language payload ${language}`, async t => {
  const f = mount(t); await flush()
  all(f.root).find(n => n.type === 'select').props['onUpdate:modelValue'](language)
  await f.click('Enable microphone'); await f.click('Stop dictation')
  assert.equal(f.requests.at(-1).body.language, language === 'ig-NG' ? undefined : language.split('-')[0])
  f.transcription.resolve({ text: '' }); await flush()
  assert.match(text(f.root), /No words heard/)
})

for (const change of ['account', 'mode', 'unmount']) test(`late transcription ignored and aborted after ${change}`, async t => {
  const f = mount(t); await flush(); await f.click('Enable microphone'); await f.click('Stop dictation')
  const request = f.requests.at(-1)
  if (change === 'account') f.user.value = { id: 'second' }
  if (change === 'mode') f.mode.value = 'notes'
  if (change === 'unmount') f.app.unmount()
  await flush(); assert.equal(request.signal.aborted, true)
  f.transcription.resolve({ text: 'Stale secret' }); await flush()
  assert.doesNotMatch(text(f.root), /Stale secret/)
  if (change === 'account') assert.equal(f.transcript().value, '')
})

test('cancelled permission releases late stream and never uploads', async t => {
  const pending = deferred(), f = mount(t, { permission: pending.promise }); await flush()
  await f.click('Enable microphone'); assert.match(text(f.root), /Waiting for microphone permission/)
  await f.click('Cancel microphone request')
  pending.resolve({ getTracks: () => [{ stop() { tracksStopped++ } }] }); await flush()
  assert.equal(tracksStopped, 1); assert.equal(f.recorders.length, 0)
  assert.equal(f.requests.some(r => r.url.endsWith('/transcribe')), false)
})

test('browser fallback graceful stop preserves final words and locks until end', async t => {
  const f = mount(t, { native: false, browser: true }); await flush(); await f.click('Enable microphone')
  const active = f.recognizers[0]; active.onstart(); await flush()
  await f.click('Stop dictation'); assert.equal(active.stopped, true); assert.equal(active.aborted, false)
  assert.equal(f.transcript().props.disabled, true)
  active.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'Final words' }], { isFinal: true })] })
  active.onend(); await flush()
  assert.equal(f.transcript().value, 'Final words'); assert.equal(f.transcript().props.disabled, false)
  assert.equal(f.requests.some(r => r.url.endsWith('/transcribe')), false)
})

test('typed fallback survives status failure without microphone support', async t => {
  const f = mount(t, { statusFailure: true }); await flush()
  assert.match(text(f.root), /Microphone transcription is unavailable/)
  f.transcript().props['onUpdate:modelValue']('Typed farm update'); await flush(); await f.click('Prepare record')
  assert.equal(all(f.root).find(n => n.type === 'input' && n.props.maxlength === '160').value, 'Typed farm update')
})

test('native permission and transcription errors recover without saving', async t => {
  const pending = deferred(), f = mount(t, { permission: pending.promise }); await flush(); await f.click('Enable microphone')
  pending.reject(new Error('Permission denied')); await flush()
  assert.match(text(f.root), /Permission denied/); assert.equal(f.transcript().props.disabled, false)
})

test('native auto stop at 60 seconds and transcription failure unlock typed fallback', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const f = mount(t); await flush(); await f.click('Enable microphone')
  t.mock.timers.tick(60000); await flush()
  assert.ok(tracksStopped > 0); assert.equal(f.requests.at(-1).url, '/api/assistant/transcribe')
  f.transcription.reject(new Error('unavailable')); await flush()
  assert.match(text(f.root), /Could not transcribe audio/); assert.equal(f.transcript().props.disabled, false)
})

test('browser permission times out and late callbacks cannot alter transcript', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const f = mount(t, { native: false, browser: true }); await flush(); await f.click('Enable microphone')
  const late = f.recognizers[0].onresult
  t.mock.timers.tick(15000); await flush()
  assert.match(text(f.root), /permission timed out/)
  late({ results: [Object.assign([{ transcript: 'late' }], { isFinal: true })] }); await flush()
  assert.equal(f.transcript().value, '')
})

test('browser 60-second stop waits for final results then finalization watchdog releases state', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const f = mount(t, { native: false, browser: true }); await flush(); await f.click('Enable microphone')
  const active = f.recognizers[0]; active.onstart(); await flush()
  t.mock.timers.tick(60000); await flush()
  assert.equal(active.stopped, true); assert.equal(active.aborted, false)
  assert.equal(f.transcript().props.disabled, true)
  t.mock.timers.tick(3000); await flush()
  assert.equal(active.aborted, true); assert.equal(f.transcript().props.disabled, false)
  assert.match(text(f.root), /finalization timed out/)
})

test('prepare and save handlers refuse calls during recording or transcription even if invoked directly', async t => {
  const f = mount(t); await flush()
  f.transcript().props['onUpdate:modelValue']('Original reviewed draft'); await flush(); await f.click('Prepare record')
  const checkbox = all(f.root).find(n => n.props.type === 'checkbox')
  checkbox.props['onUpdate:modelValue'](true); await flush()
  await f.click('Enable microphone')
  for (const stage of ['recording', 'transcription']) {
    if (stage === 'transcription') await f.click('Stop dictation')
    checkbox.props['onUpdate:modelValue'](true)
    await f.click('Prepare record')
    await all(f.root).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
    assert.equal(f.requests.some(r => r.url === '/api/farm/records'), false)
  }
  f.transcription.resolve({ text: 'Additional words' }); await flush()
})

test('account switch during permission invalidates late permission without audio upload', async t => {
  const pending = deferred(), f = mount(t, { permission: pending.promise }); await flush(); await f.click('Enable microphone')
  f.user.value = { id: 'replacement' }; await flush()
  pending.resolve({ getTracks: () => [{ stop() { tracksStopped++ } }] }); await flush()
  assert.equal(tracksStopped, 1); assert.equal(f.recorders.length, 0)
  assert.equal(f.requests.some(r => r.url.endsWith('/transcribe')), false)
  assert.equal(f.transcript().props.disabled, false)
})
