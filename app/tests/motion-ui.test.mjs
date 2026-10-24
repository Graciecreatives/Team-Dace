import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { ref } from 'vue'

const source = name => readFileSync(new URL(`../components/ui/${name}.vue`, import.meta.url), 'utf8')
const css = readFileSync(new URL('../assets/css/components.css', import.meta.url), 'utf8')

for (const name of ['FbButton', 'FbTabs', 'FbBoard']) {
  test(`${name} script and template compile with their actual bindings`, () => {
    const { descriptor, errors } = parse(source(name))
    assert.deepEqual(errors, [])
    const script = compileScript(descriptor, { id: name })
    const template = compileTemplate({ source: descriptor.template.content, filename: `${name}.vue`, id: name, compilerOptions: { bindingMetadata: script.bindings } })
    assert.deepEqual(template.errors, [])
  })
}

test('board pointer feedback is opt-in, disabled by typing/navigation, and cleaned up', () => {
  const listeners = new Map()
  let mount, unmount
  const window = {
    addEventListener(type, callback, capture) { assert.equal(capture, true); listeners.set(type, callback) },
    removeEventListener(type, callback, capture) { assert.equal(capture, true); assert.equal(listeners.get(type), callback); listeners.delete(type) },
  }
  const script = parse(source('FbBoard')).descriptor.scriptSetup.content.replace(/^import .*$/gm, '')
  const motion = new Function('ref', 'defineProps', 'onMounted', 'onBeforeUnmount', 'window', `${script}; return pointerMotion`)(ref, () => {}, fn => { mount = fn }, fn => { unmount = fn }, window)
  assert.equal(motion.value, false)
  assert.equal(listeners.size, 0)
  mount()
  listeners.get('pointerdown')()
  assert.equal(motion.value, true)
  listeners.get('keydown')()
  assert.equal(motion.value, false)
  listeners.get('pointerdown')()
  listeners.get('input')()
  assert.equal(motion.value, false)
  unmount()
  assert.equal(listeners.size, 0)
})

test('motion uses short explicit properties and honors reduced motion', () => {
  assert.match(css, /--fb-motion-press: 140ms/)
  assert.match(css, /--fb-motion-state: 220ms/)
  assert.doesNotMatch(css, /transition:\s*all\b/)
  assert.doesNotMatch(css, /transition:[^;}]*\b(?:height|width|margin|padding)\b/)
  assert.match(css, /prefers-reduced-motion: no-preference/)
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*fb-board-change-enter-from\s*\{ opacity: 1; transform: none/)
  assert.match(css, /:active:not\(:disabled\):not\(:focus-visible\)/)
  assert.match(css, /:focus-visible\s*\{ transition: none; transform: none/)
})

test('existing component events, labels and Reka navigation remain intact', () => {
  const tabs = source('FbTabs')
  assert.match(tabs, /@update:model-value="\$emit\('update:modelValue', \$event\)"/)
  assert.match(tabs, /:disabled="item.disabled"/)
  assert.match(tabs, /@keydown.capture="pointerMotion = false"/)
  assert.doesNotMatch(tabs, /\.prevent|\.stop|activation-mode|orientation=/)
  const button = source('FbButton')
  assert.match(button, /:disabled="disabled \|\| busy"/)
  assert.match(button, /:aria-busy="busy \|\| undefined"/)
  assert.match(button, /@keydown="pointerMotion = false"/)
  const board = source('FbBoard')
  assert.match(board, /:css="pointerMotion"/)
  assert.match(board, /:key="item.id"/)
  assert.match(board, /<slot name="item" :item="item" :column="column"/)
  assert.doesNotMatch(board, /\bappear(?:=|\s|>)/)
})
