import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import * as Reka from 'reka-ui'
import { renderToString } from 'vue/server-renderer'
const directory = new URL('../components/ui/', import.meta.url)
async function component(name) {
  const source = await readFile(new URL(name, directory), 'utf8')
  const { descriptor, errors } = parse(source)
  assert.deepEqual(errors, [])
  const compiled = compileScript(descriptor, { id: name, inlineTemplate: true })
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: name, id: name, compilerOptions: { bindingMetadata: compiled.bindings } }).errors, [])
  if (descriptor.styles.length) for (const style of descriptor.styles) assert.deepEqual(compileStyle({ source: style.content, id: name }).errors, [])
  const imports = {}
  const code = compiled.content.replace(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];?/g, (_, fields, module) => {
    for (const field of fields.split(',')) {
      const [original, alias] = field.trim().split(/\s+as\s+/)
      imports[alias || original] = (module === 'vue' ? Vue : Reka)[original]
    }
    return ''
  }).replace('export default', 'return')
  return new Function(...Object.keys(imports), code)(...Object.values(imports))
}
test('all FarmBuddy UI components compile and server render with real Vue and Reka', async () => {
  for (const name of (await readdir(directory)).filter(name => name.endsWith('.vue'))) {
    const C = await component(name)
    const props = name === 'FbBoard.vue' ? { columns: [{ id: 'open', title: 'Open', items: [] }] } : name === 'FbTabs.vue' ? { modelValue: 'open', items: [{ value: 'open', label: 'Open' }] } : { title: 'Farm tools', label: 'Name', busy: false, open: false }
    const html = await renderToString(Vue.createSSRApp({ render: () => Vue.h(C, props, { default: () => 'Farm content', open: () => 'Open tasks' }) }))
    assert.equal(typeof html, 'string', name)
    if (name === 'FbTabs.vue') assert.match(html, /role="tablist"/)
    if (name === 'FbBoard.vue') assert.match(html, /No tasks here/)
  }
})
test('shared button forwards native attributes and disables duplicate submission while busy', async () => {
  const C = await component('FbButton.vue')
  const html = await renderToString(Vue.createSSRApp({ render: () => Vue.h(C, { busy: true, type: 'submit', 'aria-label': 'Save stock' }, () => 'Save') }))
  assert.match(html, /disabled/)
  assert.match(html, /aria-busy="true"/)
  assert.match(html, /type="submit"/)
  assert.match(html, /aria-label="Save stock"/)
})
