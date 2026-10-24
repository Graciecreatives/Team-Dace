import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { webcrypto } from 'node:crypto'
import { ref, computed, watch, effectScope, nextTick } from 'vue'
import * as offline from '../utils/offline-workspace.js'
const source = (await readFile(new URL('../composables/useFarmWorkspace.js', import.meta.url), 'utf8')).replace(/^import .*\n/, '').replace('export function', 'function')
const tick = async () => { await nextTick(); await new Promise(resolve => setImmediate(resolve)) }
function harness(fetcher) {
  const scope = effectScope(), mounted = [], unmounted = [], listeners = new Map(), values = new Map()
  const navigator = { onLine: true }
  const window = { localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) }
  const deps = { ...offline, ref, computed, watch: (...args) => scope.run(() => watch(...args)), onMounted: fn => mounted.push(fn), onUnmounted: fn => unmounted.push(fn), window, navigator, crypto: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) }, AbortController, $fetch: fetcher }
  const user = ref({ id: 'owner' })
  const controller = scope.run(() => new Function(...Object.keys(deps), `${source};return useFarmWorkspace`)(...Object.values(deps))(user))
  mounted.forEach(fn => fn())
  return { controller, user, navigator, values, storage: window.localStorage, offline: () => { navigator.onLine = false; listeners.get('offline')() }, online: () => { navigator.onLine = true; listeners.get('online')() }, stop: () => { unmounted.forEach(fn => fn()); scope.stop() } }
}
const view = id => ({ farm: { id, role: 'owner' }, farms: [{ id, name: id, role: 'owner' }], planning: { seasons: [], plots: [], events: [] }, operations: { tasks: [] }, inventory: [] })
test('paid sale preserves the editor command ID through the successful receipt', async () => {
  const id = webcrypto.randomUUID(), sent = []
  const h = harness(async (url, options) => {
    if (options.method === 'POST') { sent.push(options.body); return { ...view('owner'), lastCommandId: options.body.commandId, result: { action: 'orders.record', id: 'sale' } } }
    return view('owner')
  })
  try {
    await tick()
    await h.controller.command({ action: 'orders.record', commandId: id, quantity: 2, unitPrice: 100 })
    assert.equal(sent[0].commandId, id)
    assert.equal(h.controller.state.value.lastCommandId, id)
    assert.equal(h.controller.state.value.result.action, 'orders.record')
  } finally { h.stop() }
})
test('quota failures never announce an offline draft as saved or silently discard it', async () => {
  const h = harness(async () => view('owner'))
  try {
    await tick()
    const set = h.storage.setItem
    h.storage.setItem = () => { throw Error('Storage full') }
    h.controller.enableDevice(true)
    assert.equal(h.controller.enabled.value, false)
    assert.match(h.controller.error.value, /Storage full/)
    h.storage.setItem = set
    h.controller.enableDevice(true); h.offline()
    await h.controller.command({ action: 'harvest.create', quantity: 5 })
    const id = h.controller.queue.value[0].commandId
    h.storage.setItem = () => { throw Error('Storage full') }
    await h.controller.command({ action: 'harvest.create', quantity: 8 })
    assert.equal(h.controller.queue.value.length, 1)
    assert.equal(h.controller.message.value, '')
    h.controller.discard(id)
    assert.equal(h.controller.queue.value[0].commandId, id)
    h.storage.setItem = set
    h.controller.discard(id)
    h.storage.removeItem = () => { throw Error('Blocked') }
    h.controller.enableDevice(false)
    assert.equal(h.controller.enabled.value, true)
    assert.match(h.controller.error.value, /could not be cleared/)
  } finally { h.stop() }
})
test('actual workspace composable keeps offline commands pending and syncs with unchanged IDs', async () => {
  const sent = []
  const h = harness(async (url, options) => { if (options.method === 'POST') sent.push(options.body); return view('owner') })
  try {
    await tick(); h.controller.enableDevice(true); h.offline()
    await h.controller.command({ action: 'harvest.create', quantity: 5 })
    assert.equal(sent.length, 0); assert.equal(h.controller.queue.value.length, 1)
    const id = h.controller.queue.value[0].commandId
    assert.match(id, /^[0-9a-f-]{36}$/)
    h.online(); await h.controller.sync()
    assert.equal(sent[0].commandId, id); assert.equal(h.controller.queue.value.length, 0)
    assert.equal(h.controller.error.value, '')
    assert.ok([...h.values.keys()].every(key => key.includes('owner:owner')))
  } finally { h.stop() }
})
test('late write responses cannot populate a different account workspace', async () => {
  let resolveWrite
  const h = harness(async (url, options) => options.method === 'POST' ? new Promise(resolve => { resolveWrite = resolve }) : view(options.query.farmId))
  try {
    await tick()
    const request = h.controller.command({ action: 'expense.create', amount: 1 })
    h.user.value = { id: 'other' }; await tick()
    resolveWrite(view('owner')); await request
    assert.equal(h.controller.state.value.farm.id, 'other')
    assert.equal(h.controller.queue.value.length, 0)
  } finally { h.stop() }
})
test('unknown online outcomes retain a retry command rather than silently duplicating a cash sale', async () => {
  let fail = true
  const calls = []
  const h = harness(async (url, options) => {
    if (options.method === 'POST') { calls.push(options.body); if (fail) throw Error('Connection lost') }
    return view('owner')
  })
  try {
    await tick(); await h.controller.command({ action: 'orders.confirm', id: 'order' })
    assert.ok(h.controller.uncertain.value)
    await h.controller.command({ action: 'orders.confirm', id: 'order' })
    assert.equal(calls.length, 1)
    fail = false; await h.controller.sync()
    assert.equal(calls[1].commandId, calls[0].commandId)
    assert.equal(h.controller.uncertain.value, null)
  } finally { h.stop() }
})
