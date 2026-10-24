import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import { ref, computed, reactive, watch, effectScope, nextTick } from 'vue'
const source = readFileSync(new URL('../components/FarmServiceStatus.vue', import.meta.url), 'utf8')
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function harness() {
  const props = reactive({ userId: 'owner' }), calls = [], mounted = [], unmounted = [], scope = effectScope()
  const deps = { ref, computed, watch, AbortController, defineProps: () => props, onMounted: fn => mounted.push(fn), onUnmounted: fn => unmounted.push(fn), Bot: {}, Camera: {}, Volume2: {}, CloudSun: {}, RefreshCw: {}, $fetch: (path, options) => { const task = deferred(); calls.push({ path, options, ...task }); return task.promise } }
  const script = parse(source).descriptor.scriptSetup.content.replace(/^import .*$/gm, '')
  const state = scope.run(() => new Function(...Object.keys(deps), script + '\nreturn { load, status, loading, error }')(...Object.values(deps)))
  return { state, props, calls, mount: () => mounted.forEach(fn => fn()), stop: () => { unmounted.forEach(fn => fn()); scope.stop() } }
}
const result = { configurationOnly: true, services: { text: true, photos: false, voice: true, weather: false } }
test('service UI compiles and avoids credential inputs or automatic polling', () => {
  const { descriptor, errors } = parse(source)
  assert.deepEqual(errors, [])
  const script = compileScript(descriptor, { id: 'services' })
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'FarmServiceStatus.vue', id: 'services', compilerOptions: { bindingMetadata: script.bindings } }).errors, [])
  assert.deepEqual(compileStyle({ source: descriptor.styles[0].content, id: 'services', scoped: true }).errors, [])
  assert.doesNotMatch(source, /<input|setInterval|setTimeout/)
  assert.match(source, /not that a live provider request has passed/)
})
test('real service controller loads once on mount, rejects duplicates and isolates account changes', async () => {
  const h = harness(), s = h.state
  assert.equal(h.calls.length, 0)
  h.mount(); s.load()
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].options.timeout, 15000)
  assert.equal(h.calls[0].options.retry, 0)
  h.props.userId = 'next-owner'
  assert.equal(h.calls[0].options.signal.aborted, true)
  assert.equal(h.calls.length, 2)
  h.calls[0].resolve(result); await nextTick()
  assert.equal(s.status.value, null)
  assert.equal(s.loading.value, true)
  h.calls[1].resolve(result); await nextTick()
  assert.deepEqual(s.status.value, result.services)
  assert.equal(s.loading.value, false)
  h.props.userId = ''
  assert.equal(s.status.value, null)
  assert.equal(h.calls.length, 2)
  h.stop()
})
test('failed and malformed checks stay unknown and unmount ignores late results', async () => {
  const h = harness(), s = h.state
  h.mount(); h.calls[0].reject(new Error('offline')); await nextTick()
  assert.match(s.error.value, /Could not check/)
  assert.equal(s.status.value, null)
  s.load(); h.calls[1].resolve({ configurationOnly: true, services: { text: 'yes' } }); await nextTick()
  assert.match(s.error.value, /Could not check/)
  assert.equal(s.status.value, null)
  s.load(); h.stop(); h.calls[2].resolve(result); await nextTick()
  assert.equal(h.calls[2].options.signal.aborted, true)
  assert.equal(s.status.value, null)
})
