import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ref, computed, reactive, watch, nextTick, effectScope } from 'vue'
const file = await readFile(new URL('../components/FarmAssistant.vue', import.meta.url), 'utf8')
const script = file.split('<script setup>')[1].split('</script>')[0].replace(/^import .*$/gm, '')
function harness(fetcher) {
  const scope = effectScope(), cleanups = []
  const props = reactive({ user: { id: 'owner', farmType: 'crops' } })
  const deps = { ref, computed, nextTick, watch: (...args) => scope.run(() => watch(...args)), defineProps: () => props, defineEmits: () => () => {}, onMounted: () => {}, onBeforeUnmount: fn => cleanups.push(fn), $fetch: fetcher, AbortController, URL, setTimeout, clearTimeout, setInterval, clearInterval, window: {}, Leaf: null, Stethoscope: null, Sprout: null }
  const state = scope.run(() => new Function(...Object.keys(deps), `${script}; return { includeFarmContext, changeFarmContext, safeSources, clearSession, send, messages, status, question, busy }`)(...Object.values(deps)))
  state.status.value = { chat: true }
  return { state, props, stop() { cleanups.forEach(fn => fn()); scope.stop() } }
}
test('actual assistant requires opt-in and clears contextual conversation when sharing changes', async () => {
  const calls = []
  const h = harness(async (url, options) => { calls.push(options.body); return { text: 'Check the field.', model: 'test/model', contextUsed: options.body.includeFarmContext, sources: [{ id: 'fao', title: 'IPM', url: 'https://www.fao.org/example' }, { id: 'bad', title: 'bad', url: 'javascript:alert(1)' }] } })
  try {
    h.state.question.value = 'How should I inspect maize?'
    await h.state.send()
    assert.equal(calls[0].includeFarmContext, false)
    h.state.changeFarmContext({ target: { checked: true } })
    assert.equal(h.state.messages.value.length, 0)
    h.state.question.value = 'Use my saved crop information.'
    await h.state.send()
    assert.equal(calls[1].includeFarmContext, true)
    assert.equal(calls[1].messages.length, 1)
    assert.equal(h.state.messages.value[1].contextUsed, true)
    assert.equal(h.state.messages.value[1].sources.length, 1)
    h.state.changeFarmContext({ target: { checked: false } })
    assert.equal(h.state.messages.value.length, 0)
    assert.equal(h.state.includeFarmContext.value, false)
    assert.deepEqual(h.state.safeSources(null), [])
  } finally { h.stop() }
})
test('account switch clears farm sharing and discards a late contextual AI reply', async () => {
  let resolve
  const h = harness(async (url, options) => url.endsWith('/status') ? { chat: true } : new Promise(done => { resolve = done }))
  try {
    h.state.changeFarmContext({ target: { checked: true } })
    h.state.question.value = 'Plan my crops.'
    const pending = h.state.send()
    h.props.user = { id: 'other', farmType: 'mixed' }
    await nextTick()
    resolve({ text: 'Private old farmer answer', contextUsed: true })
    await pending
    assert.equal(h.state.messages.value.length, 0)
    assert.equal(h.state.includeFarmContext.value, false)
  } finally { h.stop() }
})
