import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import { createRenderer, nextTick } from 'vue'

const source = await readFile(new URL('../components/FarmAssistant.vue', import.meta.url), 'utf8')
const { descriptor, errors } = parse(source)
const css = descriptor.styles[0].content

test('assistant SFC compiles script, template and scoped styles', () => {
  assert.deepEqual(errors, [])
  const script = compileScript(descriptor, { id: 'chat-layout' })
  const template = compileTemplate({ source: descriptor.template.content, filename: 'FarmAssistant.vue', id: 'chat-layout', compilerOptions: { bindingMetadata: script.bindings } })
  assert.deepEqual(template.errors, [])
  assert.deepEqual(compileStyle({ source: css, id: 'chat-layout', scoped: true }).errors, [])
})

test('dashboard owns scrolling, conversation has no nested height cap or forced scrolling', () => {
  const rules = [...css.matchAll(/\.conversation\s*\{([^}]+)\}/g)].map(match => match[1]).join('\n')
  assert.match(rules, /flex:\s*1/)
  assert.doesNotMatch(rules, /(?:max-height|overflow|overscroll-behavior|height):/)
  assert.doesNotMatch(source, /45dvh|scrollTop|scrollIntoView/)
  assert.match(css, /overflow:\s*clip/)
  assert.match(css, /\.composer-actions, \.input-tools \{ flex-wrap:wrap/)
  assert.match(css, /box-sizing:border-box/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /animation: none !important; transition: none !important/)
})

test('actual compiled template mounts empty and long-thread layout with accessible composer navigation', async () => {
  // Vue custom renderer verifies the actual template tree, not browser geometry.
  const node = (type, text = '') => ({ type, text, props: {}, children: [], parent: null })
  const renderer = createRenderer({
    createElement: type => node(type), createText: text => node('#text', text), createComment: text => node('#comment', text),
    setText: (el, text) => { el.text = text }, setElementText: (el, text) => { el.text = text; el.children = [] },
    parentNode: el => el.parent, nextSibling: el => el.parent?.children[el.parent.children.indexOf(el) + 1] || null,
    patchProp: (el, key, previous, value) => { el.props[key] = value },
    insert(el, parent, anchor = null) { if (el.parent) { const siblings = el.parent.children; siblings.splice(siblings.indexOf(el), 1) }; el.parent = parent; const index = parent.children.indexOf(anchor); parent.children.splice(index < 0 ? parent.children.length : index, 0, el) },
    remove(el) { const list = el.parent?.children; if (list) list.splice(list.indexOf(el), 1); el.parent = null }
  })
  const compiled = compileTemplate({ source: descriptor.template.content, filename: 'FarmAssistant.vue', id: 'chat-layout' })
  const vue = await import('vue')
  const code = compiled.code.replace(/import \{([^}]+)\} from "vue"/g, (_, imports) => `const {${imports.replace(/ as /g, ': ')}} = Vue`).replace('export function render', 'function render')
  // DOM-only directives are inert here. Form behavior is covered by assistant tests.
  const directive = {}
  const render = new Function('Vue', `${code}; return render`)({ ...vue, vModelText: directive, vModelSelect: directive, vModelCheckbox: directive, vShow: directive })
  const context = {
    messages: [], workspace: 'chat', photoMode: false, status: { chat: false, photo: false, voice: false }, statusError: '', checkingStatus: false,
    farmLabel: 'Crop farm', starters: [], includeFarmContext: false, busy: false, speaking: false, task: 'chat', question: '', image: null,
    dictationSupported: false, dictationActive: false, listening: false, dictationNotice: '', error: '', audioUrl: '',
    changeWorkspace() {}, choosePhotoMode() {}, clearSession() {}, refreshStatus() {}, changeFarmContext() {}, send() {}, chooseImage() {}, stopDictation() {}, startDictation() {}
  }
  const root = node('root')
  const app = renderer.createApp({ data: () => context, render })
  for (const name of ['Sprout', 'Plus', 'Camera', 'Mic', 'ArrowUpRight', 'X', 'Leaf', 'Stethoscope', 'Volume2', 'MessageCircle', 'PlugZap', 'Beef', 'FarmNotes', 'FarmScan', 'FarmAnimalScan']) app.component(name, { render: () => null })
  const vm = app.mount(root)
  const all = el => [el, ...el.children.flatMap(all)]
  const hasClass = (el, name) => String(el.props.class || '').split(' ').includes(name)
  assert.ok(all(root).some(el => hasClass(el, 'welcome')))
  vm.messages = Array.from({ length: 16 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: 'Long farming guidance. '.repeat(300), model: 'test/model' }))
  await nextTick()
  const elements = all(root)
  assert.equal(elements.filter(el => hasClass(el, 'message')).length, 16)
  assert.ok(!elements.some(el => hasClass(el, 'welcome')))
  const conversation = elements.find(el => hasClass(el, 'conversation'))
  const composer = elements.find(el => hasClass(el, 'composer-area'))
  assert.equal(conversation.parent, composer.parent)
  assert.ok(conversation.parent.children.indexOf(conversation) < conversation.parent.children.indexOf(composer))
  assert.ok(elements.some(el => el.type === 'a' && el.props.href === '#assistant-question'))
  assert.ok(elements.some(el => el.type === 'textarea' && el.props.id === 'assistant-question'))
  assert.equal(conversation.props.tabindex, undefined)
  app.unmount()
})
