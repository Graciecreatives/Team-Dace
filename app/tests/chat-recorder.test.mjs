import test from 'node:test'
import assert from 'node:assert/strict'
import { createChatRecorder } from '../utils/chat-recorder.js'

function harness({ pending = false, supported = 'audio/webm;codecs=opus', broken = '' } = {}) {
  const states = [], audio = [], errors = [], timers = new Map(), instances = []
  let calls = 0, id = 0, resolve, reject
  const track = { stops: 0, stop() { this.stops++ } }
  const stream = { getTracks: () => [track] }
  class Recorder {
    static isTypeSupported(type) { return type === supported }
    constructor(input, options) {
      if (broken === 'constructor') throw new Error('constructor')
      this.mimeType = options.mimeType
      this.state = 'inactive'
      instances.push(this)
    }
    start(interval) {
      if (broken === 'start') throw new Error('start')
      this.interval = interval
      this.state = 'recording'
    }
    stop() { this.state = 'inactive'; if (broken === 'stop') throw new Error('stop') }
    data(value = 'hello') { this.ondataavailable?.({ data: new Blob([value]) }) }
    finish() { this.state = 'inactive'; this.onstop?.() }
  }
  const api = createChatRecorder({
    mediaDevices: { getUserMedia(options) {
      calls++
      assert.deepEqual(options, { audio: true })
      return pending ? new Promise((yes, no) => { resolve = yes; reject = no }) : Promise.resolve(stream)
    } },
    MediaRecorder: Recorder,
    onState: state => states.push(state), onAudio: blob => audio.push(blob), onError: error => errors.push(error),
    setTimeout: (fn, delay) => { timers.set(++id, { fn, delay }); return id },
    clearTimeout: key => timers.delete(key),
  })
  return { api, states, audio, errors, timers, instances, track, get calls() { return calls },
    resolve: () => resolve(stream), reject: () => reject(new Error('denied')),
    fire(delay) {
      const entry = [...timers].find(([, timer]) => timer.delay === delay)
      assert.ok(entry, `expected ${delay}ms timer`)
      timers.delete(entry[0]); entry[1].fn()
    },
    clean() {
      assert.equal(timers.size, 0)
      for (const recorder of instances) {
        assert.equal(recorder.ondataavailable, null)
        assert.equal(recorder.onstop, null)
        assert.equal(recorder.onerror, null)
      }
    },
  }
}

test('lazy permission, duplicate starts, final chunk and explicit stop', async () => {
  const h = harness()
  assert.equal(h.calls, 0)
  assert.equal(await h.api.start(), true)
  assert.equal(await h.api.start(), false)
  assert.equal(h.calls, 1)
  const r = h.instances[0]
  assert.equal(r.interval, 250)
  r.data('first')
  assert.equal(h.audio.length, 0)
  h.api.stop(); h.api.stop()
  assert.equal(h.track.stops, 1)
  r.data('last'); r.finish()
  assert.deepEqual(h.states, ['permission', 'recording', 'processing', 'idle'])
  assert.equal(await h.audio[0].text(), 'firstlast')
  assert.equal(h.audio[0].type, 'audio/webm;codecs=opus')
  h.clean()
})

for (const supported of ['audio/ogg;codecs=opus', 'audio/mp4']) {
  test(`uses supported fallback ${supported} and auto-stops at 60s`, async () => {
    const h = harness({ supported })
    await h.api.start()
    h.instances[0].data()
    h.fire(60000)
    h.instances[0].finish()
    assert.equal(h.audio[0].type, supported)
    assert.equal(h.track.stops, 1)
    h.clean()
  })
}

for (const action of ['cancel', 'stop', 'timeout']) {
  test(`${action} during permission releases late stream without recording`, async () => {
    const h = harness({ pending: true })
    const starting = h.api.start()
    if (action === 'timeout') h.fire(15000)
    else h.api[action]()
    h.resolve()
    assert.equal(await starting, false)
    assert.equal(h.track.stops, 1)
    assert.equal(h.instances.length, 0)
    assert.equal(h.audio.length, 0)
    h.clean()
  })
}

test('cancel discards chunks and stale callbacks, allows restart', async () => {
  const h = harness()
  await h.api.start()
  const r = h.instances[0], stale = r.onstop
  r.data(); h.api.stop(); h.api.cancel(); stale()
  assert.equal(h.audio.length, 0)
  h.clean()
  assert.equal(await h.api.start(), true)
  h.api.cancel()
  h.clean()
})

test('size bound accepts exactly 2 MB and rejects overflow without audio', async () => {
  const h = harness()
  await h.api.start()
  h.instances[0].data(new Uint8Array(2000000))
  assert.equal(h.errors.length, 0)
  h.instances[0].data('x')
  assert.match(h.errors[0].message, /2 MB/)
  assert.equal(h.audio.length, 0)
  assert.equal(h.track.stops, 1)
  h.clean()
})

for (const broken of ['constructor', 'start', 'stop']) {
  test(`cleans up after ${broken} exception`, async () => {
    const h = harness({ broken })
    await h.api.start()
    if (broken === 'stop') h.api.stop()
    assert.equal(h.errors.length, 1)
    assert.equal(h.track.stops, 1)
    h.clean()
  })
}

test('missing stop event has bounded finalization and releases handlers', async () => {
  const h = harness()
  await h.api.start()
  h.api.stop(); h.fire(3000)
  assert.match(h.errors[0].message, /finalization timed out/)
  assert.equal(h.audio.length, 0)
  h.clean()
})

test('recorder errors and unexpected stops never deliver audio', async () => {
  for (const event of ['error', 'stop']) {
    const h = harness()
    await h.api.start()
    const r = h.instances[0]
    r.data()
    if (event === 'error') r.onerror({ error: new Error('device lost') })
    else r.finish()
    assert.equal(h.errors.length, 1)
    assert.equal(h.audio.length, 0)
    assert.equal(h.track.stops, 1)
    h.clean()
  }
})

test('denied permission, empty audio and unsupported formats report errors', async () => {
  const denied = harness({ pending: true })
  const starting = denied.api.start()
  denied.reject(); assert.equal(await starting, false)
  assert.match(denied.errors[0].message, /denied/); denied.clean()
  const empty = harness()
  await empty.api.start(); empty.api.stop(); empty.instances[0].finish()
  assert.match(empty.errors[0].message, /No audio/); empty.clean()
  const unsupported = harness({ supported: '' })
  assert.equal(await unsupported.api.start(), false)
  assert.equal(unsupported.calls, 0)
  assert.equal(unsupported.errors.length, 1); unsupported.clean()
})
