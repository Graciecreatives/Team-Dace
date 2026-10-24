import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import * as vue from 'vue'
import * as helpers from '../utils/operations-board.js'
const source = readFileSync(new URL('../components/FarmOperations.vue', import.meta.url), 'utf8')
export function operationsHarness(initial = {}) {
  const props = vue.reactive({ state: { farm: { id: 'farm', role: 'owner' }, currentUserId: 'owner', operations: { tasks: [{ id: 'task', title: 'Water', assigneeId: 'worker', completed: false }] }, inventory: [{ id: 'stock', quantity: 5 }], ...initial }, busy: false })
  const emitted = []
  const names = [...Object.keys(helpers), 'computed', 'reactive', 'ref', 'watch', 'nextTick', 'defineProps', 'defineEmits']
  const values = [...Object.values(helpers), vue.computed, vue.reactive, vue.ref, vue.watch, vue.nextTick, () => props, () => (...args) => emitted.push(args)]
  const script = parse(source).descriptor.scriptSetup.content.replace(/^import .*$/gm, '')
  const scope = vue.effectScope()
  const forms = scope.run(() => new Function(...names, script + '\nreturn { invite, accept, task, consume, submit, filters, visibleTasks, columns, counts, pending, editorOpen, confirmation, ask, copyToken, copyMessage }')(...values))
  const receipt = async (action, result = {}, id = Math.random().toString()) => { props.state = { ...props.state, lastCommandId: id, result: { action, ...result } }; await vue.nextTick() }
  return { props, emitted, forms, receipt, stop: () => scope.stop() }
}
test('real SFC script, template and scoped styles compile', () => {
  const { descriptor, errors } = parse(source)
  assert.deepEqual(errors, [])
  const script = compileScript(descriptor, { id: 'operations' })
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'FarmOperations.vue', id: 'operations', compilerOptions: { bindingMetadata: script.bindings } }).errors, [])
  assert.deepEqual(compileStyle({ source: descriptor.styles[0].content, id: 'operations', scoped: true }).errors, [])
  assert.match(source, /:max="stockLimit/)
  assert.doesNotMatch(source, /localStorage|sessionStorage|v-html|in.progress/i)
})
test('filters combine actual assignee and season with case-insensitive search', () => {
  const tasks = [{ id: 'one', title: 'Water', assigneeId: 'w', seasonId: 's', completed: false, dueOn: '2026-10-23' }, { id: 'two', title: 'Feed', completed: true }]
  assert.deepEqual(helpers.filterTasks(tasks, { search: ' ALICE ', assignee: 'w', season: 's' }, [{ userId: 'w', name: 'Alice' }]), [tasks[0]])
  assert.deepEqual(helpers.filterTasks(tasks, { search: '', assignee: 'unassigned', season: 'none' }), [tasks[1]])
  assert.equal(helpers.isOverdue(tasks[0], '2026-10-24'), true)
  assert.equal(helpers.isOverdue({ ...tasks[0], completed: true }, '2026-10-24'), false)
  assert.deepEqual(helpers.taskColumns(tasks).map(c => [c.id, c.items.length]), [['open', 1], ['completed', 1]])
})
test('draft receipt requires matching action and task, preserves edits in flight', async () => {
  const h = operationsHarness(), f = h.forms
  f.task.title = 'Submitted'; f.submit('tasks.create', f.task)
  assert.equal(h.emitted[0][1].title, 'Submitted')
  f.task.title = 'Edited in flight'
  await h.receipt('tasks.create', { taskId: 'new' })
  assert.equal(f.task.title, 'Edited in flight')
  f.submit('tasks.create', f.task)
  await h.receipt('team.invite', { token: 'unrelated' })
  assert.equal(f.task.title, 'Edited in flight')
  await h.receipt('tasks.create', { taskId: 'newer' })
  assert.equal(f.task.title, '')
  f.consume.task = { inventoryId: 'stock', quantity: '2' }
  f.submit('tasks.consume', { id: 'task', inventoryId: 'stock', quantity: 2 })
  await h.receipt('tasks.consume', { taskId: 'wrong' })
  assert.equal(f.consume.task.quantity, '2')
  await h.receipt('tasks.consume', { taskId: 'task' })
  assert.equal(f.consume.task, undefined)
  h.stop()
})
test('failed consumption preserves input, edited quantities survive confirmation, stock limits enforced', async () => {
  const h = operationsHarness(), f = h.forms
  f.consume.task = { inventoryId: 'stock', quantity: '6' }
  f.submit('tasks.consume', { id: 'task', inventoryId: 'stock', quantity: 6 })
  assert.equal(h.emitted.length, 0)
  f.consume.task.quantity = '2'
  f.submit('tasks.consume', { id: 'task', inventoryId: 'stock', quantity: 2 })
  h.props.busy = true; await vue.nextTick(); h.props.busy = false; await vue.nextTick()
  assert.equal(f.consume.task.quantity, '2')
  f.consume.task.quantity = '3'
  await h.receipt('tasks.consume', { taskId: 'task' })
  assert.equal(f.consume.task.quantity, '3')
  assert.equal(helpers.validConsumption([{ id: 'stock', quantity: 1 }], f.consume.task), false)
  assert.equal(helpers.validConsumption([{ id: 'stock', quantity: 5 }], { inventoryId: 'stock', quantity: '0.0000001' }), false)
  h.stop()
})
test('role and busy guards preserve server authority and board moves only on actual state', async () => {
  const h = operationsHarness(), f = h.forms
  h.props.state.farm.role = 'viewer'
  f.submit('tasks.complete', { id: 'task', completed: true }); assert.equal(h.emitted.length, 0)
  h.props.state.farm.role = 'worker'
  f.submit('tasks.complete', { id: 'task', completed: true }); assert.equal(h.emitted.length, 0)
  h.props.state.currentUserId = 'worker'
  f.submit('tasks.complete', { id: 'task', completed: true })
  f.submit('tasks.complete', { id: 'task', completed: true }); assert.equal(h.emitted.length, 1)
  assert.equal(f.columns.value[0].items.length, 1)
  h.props.state.operations.tasks[0].completed = true
  await h.receipt('tasks.complete', { taskId: 'task' })
  assert.equal(f.columns.value[1].items.length, 1)
  assert.equal(f.counts.value.completed, 1)
  f.submit('tasks.complete', { id: 'task', completed: false })
  h.props.state.operations.tasks[0].completed = false
  await h.receipt('tasks.complete', { taskId: 'task' })
  assert.equal(f.columns.value[0].items.length, 1)
  h.stop()
})
test('team revocation requires explicit inline confirmation and context switches clear sensitive drafts', async () => {
  const h = operationsHarness(), f = h.forms
  f.submit('team.remove', { userId: 'worker' }); assert.equal(h.emitted.length, 0)
  f.ask('team.remove', 'worker'); f.submit('team.remove', { userId: 'worker' }); assert.equal(h.emitted.length, 1)
  await h.receipt('team.remove', { removed: 'worker' })
  assert.equal(f.confirmation.value, null)
  f.invite.email = 'x@example.test'; f.accept.token = 'secret'; f.task.title = 'Draft'; f.consume.task = { quantity: 2 }; f.filters.search = 'water'
  h.props.state = { ...h.props.state, farm: { id: 'another', role: 'owner' } }
  assert.equal(f.accept.token, ''); assert.equal(f.task.title, ''); assert.equal(f.invite.email, ''); assert.deepEqual(Object.keys(f.consume), [])
  assert.equal(f.filters.search, ''); assert.equal(f.pending.value, null)
  await f.copyToken(); assert.match(f.copyMessage.value, /Could not copy/)
  h.stop()
})
