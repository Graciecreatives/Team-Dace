import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { ref, computed, watch, nextTick, reactive, effectScope } from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'

const source = readFileSync(new URL('../components/FarmAssistant.vue', import.meta.url), 'utf8')
const compiled = compileScript(parse(source).descriptor, { id: 'chat-flow' })
const flush = async () => { await new Promise(resolve => setImmediate(resolve)) }
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function setup(fetcher, nativeRecording = false) {
  let mounted, unmount
  const props = reactive({ user: { id: 'one', farmType: 'crops' } }), scope = effectScope()
  const revoked = [], calls = [], recording = { callbacks: null, cancelled: 0 }
  class FileReader { readAsDataURL() { this.result = 'data:audio/webm;base64,GkXfowAAAAA='; queueMicrotask(() => this.onload?.()) } }
  const context = vm.createContext({ ref, computed, watch, nextTick, AbortController, Blob,
    Sprout: {}, Plus: {}, Camera: {}, Mic: {}, ArrowUpRight: {}, X: {}, Leaf: {}, Stethoscope: {}, Volume2: {}, MessageCircle: {}, PlugZap: {}, Beef: {}, FarmScan: {}, FarmAnimalScan: {}, createChatRecorder: callbacks => { recording.callbacks = callbacks; return { start() { callbacks.onState('permission'); return Promise.resolve(true) }, stop() { callbacks.onState('processing') }, cancel() { recording.cancelled++ } } },
    FileReader, window: { matchMedia: () => ({ matches: true }), ...(nativeRecording ? { MediaRecorder: class {} } : {}) }, navigator: nativeRecording ? { mediaDevices: { getUserMedia() {} } } : {},
    URL: { createObjectURL: () => 'blob:answer', revokeObjectURL: value => revoked.push(value) },
    setTimeout, clearTimeout, setInterval, clearInterval,
    onMounted: callback => { mounted = callback }, onBeforeUnmount: callback => { unmount = callback },
    $fetch: (path, options = {}) => { calls.push({ path, options }); return path.endsWith('/status') ? Promise.resolve({ chat: true, photo: false, voice: true, transcription: true }) : fetcher(path, options) }
  })
  vm.runInContext(compiled.content.replace(/^import .*$/gm, '').replace('export default', 'globalThis.component ='), context)
  const state = scope.run(() => context.component.setup(props, { expose() {}, emit() {} }))
  scope.run(() => mounted())
  return { state, props, calls, revoked, recording, browser: context.window, stop() { unmount(); scope.stop() } }
}

test('phone keyboard contracts the chat viewport without changing or sending the draft', async () => {
  const app = setup(async () => { throw new Error('must not send') }); await flush()
  app.browser.innerHeight = 842
  app.browser.visualViewport = { height: 420, removeEventListener() {} }
  app.state.question.value = 'Keep this draft'
  app.state.updateChatViewport()
  assert.equal(app.state.viewportHeight.value, 420)
  assert.equal(app.state.keyboardOpen.value, true)
  app.browser.visualViewport.height = 842
  app.state.updateChatViewport()
  assert.equal(app.state.keyboardOpen.value, false)
  assert.equal(app.state.question.value, 'Keep this draft')
  assert.equal(app.calls.filter(call => call.path.endsWith('/chat')).length, 0)
  app.stop()
})

test('actual chat sends bounded conversation, retains failure draft, then renders reply and scoped reduced-motion scroll', async () => {
  let fail = true
  const app = setup(async () => { if (fail) throw new Error('offline'); return { text: 'Check the soil first.', model: '@cf/test/model', sources: [], contextUsed: false } })
  await flush()
  const scrolls = []
  app.state.historyPanel.value = { scrollHeight: 900, clientHeight: 200, scrollTop: 700, scrollTo: options => scrolls.push(options) }
  app.state.question.value = 'How should I water my maize?'
  await app.state.send()
  assert.match(app.state.error.value, /Unable to get an answer/)
  assert.equal(app.state.question.value, 'How should I water my maize?')
  assert.equal(app.state.messages.value.length, 0)
  fail = false
  await app.state.send()
  assert.equal(app.state.messages.value.length, 2)
  assert.equal(app.state.messages.value[1].content, 'Check the soil first.')
  assert.equal(app.state.question.value, '')
  assert.equal(scrolls[0].behavior, 'auto')
  const call = app.calls.find(call => call.path.endsWith('/chat'))
  assert.equal(call.options.retry, 0)
  assert.equal(call.options.timeout, 65000)
  assert.equal(call.options.body.messages.at(-1).content, 'How should I water my maize?')
  app.stop()
})

test('scan handoff is an editable draft, photo routes to specialist scanner, never auto sends', async () => {
  const app = setup(async () => { throw new Error('must not send') }); await flush()
  await app.state.choosePhotoMode()
  assert.equal(app.state.workspace.value, 'scan')
  await app.state.askAboutPlant('Pl@ntNet suggests hibiscus. Not a diagnosis. What should I check?')
  assert.equal(app.state.workspace.value, 'chat')
  assert.equal(app.state.task.value, 'plant-health')
  assert.match(app.state.question.value, /hibiscus/)
  assert.equal(app.state.messages.value.length, 0)
  assert.equal(app.calls.filter(call => !call.path.endsWith('/status')).length, 0)
  app.stop()
})

test('duplicate sends are blocked and account switch aborts and ignores late replies', async () => {
  const pending = deferred(), app = setup(() => pending.promise); await flush()
  app.state.question.value = 'My tomato leaves changed.'
  const sending = app.state.send(); await app.state.send()
  assert.equal(app.calls.filter(call => call.path.endsWith('/chat')).length, 1)
  const signal = app.calls.find(call => call.path.endsWith('/chat')).options.signal
  app.props.user = { id: 'two', farmType: 'mixed' }; await nextTick()
  assert.equal(signal.aborted, true)
  pending.resolve({ text: 'Old account answer', model: 'test' }); await sending
  assert.equal(app.state.messages.value.length, 0)
  assert.equal(app.state.question.value, '')
  assert.equal(app.state.busy.value, false)
  app.stop()
})

test('read aloud uses bounded server synthesis, handles failure and releases prior audio', async () => {
  let failed = false
  const app = setup(async () => { if (failed) throw new Error('voice offline'); return new Blob(['test audio'], { type: 'audio/mpeg' }) }); await flush()
  await app.state.speak({ content: 'Farm advice' })
  assert.equal(app.state.audioUrl.value, 'blob:answer')
  const call = app.calls.find(call => call.path.endsWith('/speak'))
  assert.equal(call.options.timeout, 50000)
  assert.equal(call.options.body.text, 'Farm advice')
  failed = true
  await app.state.speak({ content: 'More advice' })
  assert.deepEqual(app.revoked, ['blob:answer'])
  assert.match(app.state.error.value, /Voice is unavailable/)
  assert.equal(app.state.speaking.value, false)
  app.stop()
})

test('native dictation shows capture, transcribes only stopped audio and leaves editable words unsent', async () => {
  const app = setup(async () => ({ text: 'Water the maize tomorrow.' }), true); await flush()
  assert.equal(app.state.dictationSupported.value, true)
  app.state.startDictation()
  assert.equal(app.state.dictationPending.value, true)
  assert.equal(app.calls.filter(call => call.path.endsWith('/transcribe')).length, 0)
  app.recording.callbacks.onState('recording')
  assert.equal(app.state.listening.value, true)
  app.state.stopDictation()
  assert.equal(app.state.dictationStopping.value, true)
  await app.recording.callbacks.onAudio(new Blob(['audio'], { type: 'audio/webm;codecs=opus' }))
  assert.equal(app.state.question.value, 'Water the maize tomorrow.')
  assert.equal(app.state.dictationActive.value, false)
  assert.equal(app.state.messages.value.length, 0)
  const call = app.calls.find(call => call.path.endsWith('/transcribe'))
  assert.equal(call.options.body.language, 'en')
  assert.equal(call.options.retry, 0)
  assert.equal(app.calls.filter(call => call.path.endsWith('/chat')).length, 0)
  app.stop()
})

test('account switch aborts in-flight transcription and cannot append old speech to a new draft', async () => {
  const pending = deferred(), app = setup(() => pending.promise, true); await flush()
  app.state.startDictation()
  app.recording.callbacks.onState('recording')
  app.state.stopDictation()
  const transcription = app.recording.callbacks.onAudio(new Blob(['audio'], { type: 'audio/ogg' }))
  await flush()
  const signal = app.calls.find(call => call.path.endsWith('/transcribe')).options.signal
  app.props.user = { id: 'different', farmType: 'mixed' }; await nextTick()
  assert.equal(signal.aborted, true)
  pending.resolve({ text: 'Old speech' }); await transcription
  assert.equal(app.state.question.value, '')
  assert.equal(app.state.dictationActive.value, false)
  app.stop()
})
