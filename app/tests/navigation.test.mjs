import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { ref, reactive, computed, watch, nextTick, effectScope } from 'vue'
import * as icons from 'lucide-vue-next'

const sources = Object.fromEntries(await Promise.all(['SiteHeader', 'FarmDashboard'].map(async name => [name, await readFile(new URL(`../components/${name}.vue`, import.meta.url), 'utf8')])))

test('management boards use dashboard width while reading sections keep a limit', () => {
  assert.match(sources.FarmDashboard, /<main class="mx-auto w-full"/)
  assert.match(sources.FarmDashboard, /\['marketplace', 'planning', 'operations', 'business', 'team', 'inventory', 'enterprises', 'records', 'reminders', 'bookkeeping'\]\.includes\(section\) \? 'max-w-none' : 'max-w-\[1440px\]'/)
})

for (const [name, source] of Object.entries(sources)) {
  test(`${name} script and template compile without a build`, () => {
    const { descriptor, errors } = parse(source)
    assert.deepEqual(errors, [])
    const script = compileScript(descriptor, { id: name })
    const template = compileTemplate({ source: descriptor.template.content, filename: `${name}.vue`, id: name, compilerOptions: { bindingMetadata: script.bindings } })
    assert.deepEqual(template.errors, [])
  })
}

// Run the actual setup logic with Vue reactivity and isolated browser/Nuxt adapters.
// No browser session, real account, API write or application data is touched.
async function setup(name, expose, overrides = {}) {
  const scope = effectScope()
  const mounted = [], unmounted = [], listeners = new Map(), mediaListeners = new Map()
  const body = { style: { overflow: 'auto' } }
  const media = { matches: false, addEventListener: (key, fn) => mediaListeners.set(key, fn), removeEventListener: key => mediaListeners.delete(key) }
  const window = { scrollY: 0, location: { pathname: '/' }, history: { pushState() {} }, matchMedia: () => media, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) }
  const document = { body, hidden: false, getElementById: () => null }
  const dependencies = { ...Object.fromEntries(Object.entries(icons).filter(([key]) => /^[A-Z]\w*$/.test(key))), ref, reactive, computed, watch: (...args) => scope.run(() => watch(...args)), nextTick, window, document, onMounted: fn => mounted.push(fn), onUnmounted: fn => unmounted.push(fn), useHead() {}, useRoute: () => ({ path: '/dashboard' }), useFetch: async path => ({ data: ref(path === '/api/auth/me' ? { user: { name: 'Test Farmer', farmType: 'mixed', onboardingCompleted: true } } : { records: [], reminders: [] }), error: ref(null), refresh: async () => {} }), navigateTo: async () => {}, ...overrides }
  const script = parse(sources[name]).descriptor.scriptSetup.content.replace(/^import .*$/gm, '').replaceAll('import.meta.client', 'true')
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  let promise
  scope.run(() => { promise = new AsyncFunction(...Object.keys(dependencies), `${script}\nreturn { ${expose.join(', ')} }`)(...Object.values(dependencies)) })
  const state = await promise
  mounted.forEach(fn => fn())
  return { state, body, media, listeners, mediaListeners, cleanup() { unmounted.forEach(fn => fn()); scope.stop() } }
}

test('homepage closes on Escape, missing targets, modified links and desktop resize', async () => {
  const h = await setup('SiteHeader', ['menuOpen', 'menuTrigger', 'navigateSection'])
  let focused = false
  h.state.menuTrigger.value = { focus() { focused = true } }
  h.state.menuOpen.value = true
  h.listeners.get('keydown')({ key: 'Escape' })
  await nextTick()
  assert.equal(h.state.menuOpen.value, false)
  assert.equal(focused, true)
  for (const event of [{}, { ctrlKey: true }]) {
    h.state.menuOpen.value = true
    await h.state.navigateSection(event, '/#missing')
    assert.equal(h.state.menuOpen.value, false)
  }
  h.state.menuOpen.value = true
  h.media.matches = true
  h.mediaListeners.get('change')()
  assert.equal(h.state.menuOpen.value, false)
  h.cleanup()
  assert.equal(h.listeners.size, 0)
  assert.equal(h.mediaListeners.size, 0)
})

test('dashboard selection, Escape and resize close drawer and restore scroll ownership', async () => {
  const h = await setup('FarmDashboard', ['mobileMenu', 'dialog', 'section', 'chooseSection', 'closeMenu', 'menuTrigger'])
  const s = h.state
  s.mobileMenu.value = true
  assert.equal(h.body.style.overflow, 'hidden')
  s.chooseSection('settings')
  assert.equal(s.section.value, 'settings')
  assert.equal(s.mobileMenu.value, false)
  assert.equal(h.body.style.overflow, 'auto')
  s.mobileMenu.value = true
  s.dialog.value = 'record'
  s.closeMenu()
  assert.equal(h.body.style.overflow, 'hidden', 'dialog retains scroll lock after menu closes')
  s.dialog.value = null
  assert.equal(h.body.style.overflow, 'auto')
  let focused = false
  s.menuTrigger.value = { focus() { focused = true } }
  s.mobileMenu.value = true
  h.listeners.get('keydown')({ key: 'Escape' })
  await nextTick()
  assert.equal(s.mobileMenu.value, false)
  assert.equal(focused, true)
  s.mobileMenu.value = true
  h.media.matches = true
  h.mediaListeners.get('change')()
  assert.equal(s.mobileMenu.value, false)
  assert.equal(h.body.style.overflow, 'auto')
  s.mobileMenu.value = true
  h.cleanup()
  assert.equal(h.body.style.overflow, 'auto')
  assert.equal(h.listeners.size, 0)
  assert.equal(h.mediaListeners.size, 0)
})

test('menu markup wires accessible controls and removes closed backdrop hit targets', () => {
  assert.match(sources.SiteHeader, /id="site-menu-toggle"[^>]*:aria-expanded="menuOpen"[^>]*aria-controls="mobile-navigation"/)
  assert.match(sources.SiteHeader, /Teleport to="#teleports"/)
  assert.match(sources.FarmDashboard, /id="dashboard-menu-toggle"[^>]*aria-controls="dashboard-navigation"[^>]*:aria-expanded="mobileMenu"/)
  assert.match(sources.FarmDashboard, /v-if="mobileMenu" id="dashboard-menu-backdrop"/)
  assert.match(sources.FarmDashboard, /invisible -translate-x-full pointer-events-none/)
  assert.match(sources.FarmDashboard, /aria-label="Close dashboard navigation"/)
  assert.match(sources.FarmDashboard, /id: 'settings', label: 'Settings'/)
  assert.match(sources.FarmDashboard, /aria-label="Open My farm profile"/)
})

const entryExpose = ['session', 'farm', 'recordForm', 'reminderForm', 'dialog', 'editing', 'deletion', 'saving', 'deleting', 'pendingReminder', 'error', 'feedback', 'saveRecord', 'saveReminder', 'editRecord', 'editReminder', 'deleteRecord', 'deleteReminder', 'confirmDeletion', 'toggleReminder']
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const recordFixture = { id: 'record-1', title: 'Original', category: 'income', amount: 25, note: 'Keep', updatedAt: '2026-10-24T12:00:00.000Z' }

test('record editing captures immutable versioned payload, blocks duplicates, preserves failed draft', async () => {
  const request = deferred(), calls = []
  const h = await setup('FarmDashboard', entryExpose, { $fetch: (url, options) => { calls.push({ url, options }); return request.promise } })
  const s = h.state
  s.editRecord(recordFixture)
  s.recordForm.title = 'Edited'
  const first = s.saveRecord()
  await s.saveRecord()
  s.recordForm.title = 'Still typing'
  assert.equal(calls.length, 1)
  assert.equal(calls[0].options.body.title, 'Edited')
  assert.equal(calls[0].options.body.expectedUpdatedAt, recordFixture.updatedAt)
  assert.equal(calls[0].options.method, 'PATCH')
  assert.equal(calls[0].options.timeout, 15000)
  assert.equal(calls[0].options.retry, 0)
  request.reject({ data: { statusMessage: 'Conflict' } })
  await first
  assert.equal(s.recordForm.title, 'Still typing')
  assert.equal(s.dialog.value, 'record')
  assert.equal(s.error.value, 'Conflict')
  assert.equal(s.saving.value, false)
  h.cleanup()
})

test('confirmed create closes editor and keeps local response when refresh fails', async () => {
  const calls = []
  const saved = { ...recordFixture, title: 'Created' }
  const h = await setup('FarmDashboard', entryExpose, { $fetch: async (url, options) => { calls.push({ url, options }); if (url === '/api/farm') throw Error('offline'); return { record: saved } } })
  const s = h.state
  s.dialog.value = 'record'; s.recordForm.title = 'Created'
  await s.saveRecord()
  assert.equal(s.dialog.value, null)
  assert.equal(s.recordForm.title, '')
  assert.equal(s.farm.value.records[0].title, 'Created')
  assert.match(s.feedback.value, /change is saved/)
  assert.equal(s.error.value, '')
  assert.equal(calls.filter(call => call.options.method === 'POST').length, 1)
  h.cleanup()
})

test('account switches abort requests and stale responses/finally cannot mutate new account', async () => {
  const requests = [], calls = []
  const h = await setup('FarmDashboard', entryExpose, { $fetch: (url, options) => { const request = deferred(); requests.push(request); calls.push(options); return request.promise } })
  const s = h.state
  s.session.value.user.id = 'first'
  s.recordForm.title = 'First'
  const old = s.saveRecord()
  s.session.value.user = { ...s.session.value.user, id: 'second' }
  assert.equal(calls[0].signal.aborted, true)
  s.recordForm.title = 'Second'
  const fresh = s.saveRecord()
  requests[0].resolve({ record: recordFixture })
  await old
  assert.equal(s.saving.value, true)
  assert.equal(s.farm.value.records.length, 0)
  assert.equal(s.recordForm.title, 'Second')
  h.cleanup()
  assert.equal(calls[1].signal.aborted, true)
  requests[1].resolve({ record: recordFixture })
  await fresh
  assert.equal(s.farm.value.records.length, 0)
  assert.equal(s.feedback.value, '')
})

test('reminder edit/delete/toggle use confirmed responses despite failed refresh and linked records stay protected', async () => {
  const calls = []
  const reminder = { id: 'task-1', title: 'Water', date: '2026-10-25', completed: false, updatedAt: recordFixture.updatedAt }
  let result = { ...reminder, title: 'Feed' }
  const h = await setup('FarmDashboard', entryExpose, { $fetch: async (url, options) => { calls.push({ url, options }); if (url === '/api/farm') throw Error('offline'); return options.method === 'DELETE' ? { ok: true } : { reminder: result } } })
  const s = h.state
  s.editRecord({ ...recordFixture, sourceId: 'workflow' })
  s.deleteRecord({ ...recordFixture, sourceId: 'workflow' })
  assert.equal(s.dialog.value, null)
  assert.equal(s.deletion.value, null)
  s.editReminder(reminder)
  s.reminderForm.title = 'Feed'
  await s.saveReminder()
  assert.equal(calls[0].options.body.expectedUpdatedAt, reminder.updatedAt)
  assert.equal(s.farm.value.reminders[0].title, 'Feed')
  assert.equal(s.dialog.value, null)
  result = { ...result, completed: true }
  await s.toggleReminder(s.farm.value.reminders[0])
  assert.equal(s.farm.value.reminders[0].completed, true)
  s.deleteReminder(s.farm.value.reminders[0])
  assert.equal(calls.filter(call => call.options.method === 'DELETE').length, 0, 'confirmation required')
  await s.confirmDeletion()
  assert.equal(s.farm.value.reminders.length, 0)
  assert.equal(s.deletion.value, null)
  assert.equal(calls.find(call => call.options.method === 'DELETE').options.body.expectedUpdatedAt, reminder.updatedAt)
  h.cleanup()
})

test('failed reminder creation and deletion preserve drafts, confirmation and local data without retries', async () => {
  const calls = []
  const h = await setup('FarmDashboard', entryExpose, { $fetch: async (url, options) => { calls.push({ url, options }); throw { data: { message: 'Offline' } } } })
  const s = h.state
  s.dialog.value = 'reminder'
  Object.assign(s.reminderForm, { title: 'Water', date: '2026-10-25' })
  await s.saveReminder()
  assert.deepEqual({ ...s.reminderForm }, { title: 'Water', date: '2026-10-25' })
  assert.equal(s.dialog.value, 'reminder')
  assert.equal(calls.length, 1)
  s.dialog.value = null
  s.farm.value.records = [recordFixture]
  s.deleteRecord(recordFixture)
  await s.confirmDeletion()
  assert.equal(s.farm.value.records.length, 1)
  assert.equal(s.deletion.value.item.id, recordFixture.id)
  assert.equal(s.error.value, 'Offline')
  assert.equal(s.deleting.value, '')
  assert.equal(calls.length, 2)
  h.cleanup()
})

test('late refresh after account switch cannot publish old farm data', async () => {
  const refresh = deferred(), calls = []
  const h = await setup('FarmDashboard', entryExpose, { $fetch: async (url, options) => { calls.push({ url, options }); return url === '/api/farm' ? refresh.promise : { record: recordFixture } } })
  const s = h.state
  s.recordForm.title = 'Save'
  const operation = s.saveRecord()
  await nextTick()
  assert.equal(s.farm.value.records.length, 1)
  assert.equal(s.dialog.value, null)
  s.session.value.user = { ...s.session.value.user, id: 'other-account' }
  assert.equal(calls[1].options.signal.aborted, true)
  refresh.resolve({ records: [recordFixture], reminders: [] })
  await operation
  assert.deepEqual(s.farm.value.records, [])
  assert.equal(s.feedback.value, '')
  h.cleanup()
})
