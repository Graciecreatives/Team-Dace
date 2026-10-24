import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { ref, reactive, computed, watch, nextTick, effectScope } from 'vue'
import * as icons from 'lucide-vue-next'

const sources = Object.fromEntries(await Promise.all(['SiteHeader', 'FarmDashboard'].map(async name => [name, await readFile(new URL(`../components/${name}.vue`, import.meta.url), 'utf8')])))

test('marketplace uses the dashboard width while other sections retain their reading limit', () => {
  assert.match(sources.FarmDashboard, /<main class="mx-auto w-full"/)
  assert.match(sources.FarmDashboard, /section === 'marketplace' \? 'max-w-none' : 'max-w-\[1440px\]'/)
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
async function setup(name, expose) {
  const scope = effectScope()
  const mounted = [], unmounted = [], listeners = new Map(), mediaListeners = new Map()
  const body = { style: { overflow: 'auto' } }
  const media = { matches: false, addEventListener: (key, fn) => mediaListeners.set(key, fn), removeEventListener: key => mediaListeners.delete(key) }
  const window = { scrollY: 0, location: { pathname: '/' }, history: { pushState() {} }, matchMedia: () => media, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) }
  const document = { body, hidden: false, getElementById: () => null }
  const dependencies = { ...Object.fromEntries(Object.entries(icons).filter(([key]) => /^[A-Z]\w*$/.test(key))), ref, reactive, computed, watch: (...args) => scope.run(() => watch(...args)), nextTick, window, document, onMounted: fn => mounted.push(fn), onUnmounted: fn => unmounted.push(fn), useHead() {}, useRoute: () => ({ path: '/dashboard' }), useFetch: async path => ({ data: ref(path === '/api/auth/me' ? { user: { name: 'Test Farmer', farmType: 'mixed', onboardingCompleted: true } } : { records: [], reminders: [] }), error: ref(null), refresh: async () => {} }), navigateTo: async () => {} }
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
