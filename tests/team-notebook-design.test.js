import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import * as icons from 'lucide-vue-next'
import * as offline from '../app/utils/offline-notes.js'

async function component(name, fetcher) {
  const source = await readFile(new URL(`../app/components/${name}.vue`, import.meta.url), 'utf8')
  const { descriptor, errors } = parse(source)
  assert.deepEqual(errors, [])
  const script = compileScript(descriptor, { id: name })
  const template = compileTemplate({ source: descriptor.template.content, filename: name, id: name, compilerOptions: { bindingMetadata: script.bindings } })
  assert.deepEqual(template.errors, [])
  for (const style of descriptor.styles) assert.deepEqual(compileStyle({ source: style.content, filename: name, id: name, scoped: true }).errors, [])
  const code = script.content
    .replace(/^import \{([^}]+)\} from 'lucide-vue-next'/m, 'const {$1} = icons')
    .replace(/^import \{([^}]+)\} from '\.\.\/utils\/offline-notes.js'/m, 'const {$1} = offline')
    .replace('export default', 'return')
  const result = new Function('Vue', 'icons', 'offline', '$fetch', `const {ref, reactive, computed, watch, onMounted, onUnmounted, nextTick} = Vue\n${code}`)(Vue, icons, offline, fetcher)
  return { result, source }
}
function mount(component, props) {
  const renderer = Vue.createRenderer({ createComment: () => ({}), createText: () => ({}), createElement: () => ({}), insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {}, parentNode: () => null, nextSibling: () => null })
  let state
  const setup = component.setup
  component.setup = (p, context) => { state = setup(p, context); return state }
  component.render = () => null
  const app = renderer.createApp({ setup: () => () => Vue.h(component, props) })
  app.mount({})
  return { app, get state() { return state } }
}

test('team compiles, focuses on people and resets editor across account generations', async () => {
  let resolve
  const { result, source } = await component('FarmTeam', () => new Promise(r => { resolve = r }))
  assert.match(source, /Roster only · No account access granted/)
  assert.match(source, /Their account access is not affected/)
  const props = Vue.reactive({ user: { id: 'a' } })
  const view = mount(result, props)
  try {
    assert.equal(view.state.composing.value, false)
    view.state.editMember({ id: 'person', name: 'Ada Okeke', role: 'Field lead', contact: '', responsibilities: '', status: 'active' })
    assert.equal(view.state.composing.value, true)
    assert.equal(view.state.initials('Ada Okeke'), 'AO')
    const stale = resolve
    props.user = { id: 'b' }
    await Vue.nextTick()
    assert.equal(view.state.composing.value, false)
    assert.equal(view.state.draft.name, '')
    stale({ members: [{ id: 'private' }] })
    await Vue.nextTick()
    assert.deepEqual(view.state.members.value, [])
    assert.equal(view.state.busy.value, true)
    resolve({ members: [] })
    await Vue.nextTick()
  } finally { view.app.unmount() }
})

test('notebook compiles and retains offline, deletion and voice review safeguards', async () => {
  const { source } = await component('FarmNotes', () => {})
  assert.match(source, /Device only · Not synced/)
  assert.match(source, /Saved to account/)
  assert.match(source, /v-if="composing" id="note-editor"/)
  assert.match(source, /!reviewed.value \|\| !online.value \|\| !owner.value/)
  assert.match(source, /window.confirm\('Delete this note/)
  assert.match(source, /generation\+\+; controller\?\.abort\(\); stopListening\(\)/)
  assert.match(source, /watch\(record, .*reviewed.value = false/)
  assert.match(source, /Signing out does not erase saved notes/)
  assert.match(source, /prefers-reduced-motion:reduce/)
})

test('offline capture stays pending and account changes clear unsaved notebook and voice state', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const saved = new Map()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    localStorage: { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) },
    addEventListener() {}, removeEventListener() {}, confirm: () => true
  } })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } })
  let calls = 0
  let view
  try {
    const { result } = await component('FarmNotes', () => { calls++; return Promise.resolve({}) })
    const props = Vue.reactive({ user: { id: 'a' }, mode: 'notes' })
    view = mount(result, props)
    const state = view.state
    state.composing.value = true
    state.title.value = 'Seedlings'
    state.body.value = 'Check the north bed tomorrow.'
    state.saveNote()
    assert.equal(state.notes.value.length, 1)
    assert.equal(state.pendingCount.value, 1)
    assert.equal(state.composing.value, false)
    assert.equal(calls, 0)
    await state.deleteNote(state.notes.value[0])
    assert.equal(state.notes.value.length, 1, 'offline deletion must keep the note')
    state.composing.value = true
    state.title.value = 'Private unsaved draft'
    state.transcript.value = 'Private transcript'
    state.record.title = 'Reviewed record'
    state.reviewed.value = true
    await state.saveRecord()
    assert.equal(calls, 0, 'review does not bypass offline guard')
    props.user = { id: 'b' }
    await Vue.nextTick()
    assert.equal(state.title.value, '')
    assert.equal(state.transcript.value, '')
    assert.equal(state.reviewed.value, false)
    assert.equal(state.composing.value, false)
    assert.equal(state.notes.value.length, 0)
    props.user = { id: 'a' }
    await Vue.nextTick()
    assert.equal(state.notes.value.length, 1, 'saved device notes remain scoped to their owner')
  } finally {
    view?.app.unmount()
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else delete globalThis.window
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator)
    else delete globalThis.navigator
  }
})
