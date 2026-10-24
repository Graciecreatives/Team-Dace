import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as Vue from 'vue'
import * as helpers from '../app/utils/operations-board.js'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'

const filename = 'app/components/FarmOperations.vue'
const source = await readFile(filename, 'utf8')
const { descriptor, errors } = parse(source, { filename })

test('production and business expose in-place choices, finite motion and native large-list fallbacks', async () => {
  for (const component of ['FarmProduction', 'FarmBusiness']) {
    const text = await readFile(`app/components/${component}.vue`, 'utf8')
    assert.doesNotMatch(text, /FbDialog|role="dialog"/)
    assert.match(text, /class="inline-editor"/)
    assert.match(text, /Close, keep draft/)
    assert.match(text, /:aria-pressed=/)
    assert.match(text, /tabindex="-1"/)
    assert.match(text, /focus-visible/)
    assert.match(text, /prefers-reduced-motion:reduce/)
    assert.match(text, /transition:opacity 200ms/)
    assert.doesNotMatch(text, /animation:[^;}]*infinite/)
    assert.match(text, /min\(100%,180px\)/)
  }
  const business = await readFile('app/components/FarmBusiness.vue', 'utf8')
  assert.match(business, /seasons.length <= 6/)
  assert.match(business, /stock.length <= 6/)
  assert.match(business, /<label v-else-if="activeTab !== 'sale' && seasons.length > 6">Season<select/)
  assert.match(business, /<label v-else>Stock item<select/)
  assert.match(business, /v-if="!detailsOpen\[activeTab\]"/)
})

function mount() {
  const props = Vue.reactive({ state: {
    farm: { id: 'farm', role: 'owner' }, currentUserId: 'owner',
    operations: { members: [{ userId: 'worker', name: 'Ada Bello' }], tasks: [
      { id: 'a', title: 'Water beds', dueOn: '2099-01-01', completed: false, assigneeId: 'worker' },
      { id: 'b', title: 'Check herd', dueOn: '2099-01-02', completed: true }
    ] }
  }, busy: false })
  const emitted = []
  const scope = Vue.effectScope()
  const bindings = { computed: Vue.computed, reactive: Vue.reactive, ref: Vue.ref, watch: Vue.watch, nextTick: Vue.nextTick, ...helpers, defineProps: () => props, defineEmits: () => (...args) => emitted.push(args) }
  const setup = new Function(...Object.keys(bindings), descriptor.scriptSetup.content.replace(/^import .*$/gm, '') + '\nreturn { completion, counts, initials, memberName, filters, visibleTasks, submit, task }')
  const vm = scope.run(() => setup(...Object.values(bindings)))
  return { vm, props, emitted, close: () => scope.stop() }
}

test('task completion derives from all confirmed records, never filtered or optimistic state', async () => {
  const f = mount()
  try {
    assert.equal(f.vm.completion.value, 50)
    f.vm.filters.search = 'Water'
    assert.equal(f.vm.visibleTasks.value.length, 1)
    assert.equal(f.vm.completion.value, 50)
    f.vm.submit('tasks.complete', { id: 'a', completed: true })
    assert.equal(f.emitted.length, 1)
    assert.equal(f.vm.completion.value, 50)
    f.props.state.operations.tasks[0].completed = true
    assert.equal(f.vm.completion.value, 100)
    f.props.state.operations.tasks = []
    assert.equal(f.vm.completion.value, 0)
    assert.equal(f.vm.counts.value.open, 0)
  } finally { f.close() }
})

test('assignee identity uses actual members with honest unavailable and unassigned fallbacks', () => {
  const f = mount()
  try {
    assert.equal(f.vm.initials('worker'), 'AB')
    assert.equal(f.vm.memberName('worker'), 'Ada Bello')
    assert.equal(f.vm.memberName('removed'), 'Former member')
    assert.equal(f.vm.memberName(''), 'Unassigned')
    assert.equal(f.vm.initials(''), '?')
  } finally { f.close() }
})

test('action board compiles script, template and scoped CSS with accessible progressive controls', () => {
  assert.deepEqual(errors, [])
  const script = compileScript(descriptor, { id: 'operations-design' })
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename, id: 'operations-design', compilerOptions: { bindingMetadata: script.bindings } }).errors, [])
  for (const style of descriptor.styles) assert.deepEqual(compileStyle({ source: style.content, filename, id: 'operations-design', scoped: true }).errors, [])
  assert.match(source, /aria-label="Confirmed task completion"/)
  assert.match(source, /:value="counts.completed"/)
  assert.match(source, /:aria-expanded="editorOpen"/)
  assert.match(source, /<summary><PackageOpen[^>]+aria-hidden="true"[^>]*\/>Record input use/)
  assert.match(source, /min-height:44px/)
  assert.match(source, /prefers-reduced-motion:reduce/)
  assert.match(source, /focus-visible/)
  assert.doesNotMatch(source, /draggable|@drop|Math.random/)
})
