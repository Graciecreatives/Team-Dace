import test from 'node:test'
import assert from 'node:assert/strict'
import { enqueueCommand, readWorkspace, writeWorkspace, replayCommands, workspaceKey } from '../utils/offline-workspace.js'

const storage = () => { const values = new Map(); return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } }
test('workspace drafts are immutable, explicitly scoped and limited to field actions', () => {
  const s = storage(), command = { action: 'harvest.create', farmId: 'farm-a', commandId: 'first', quantity: 5 }
  const queue = enqueueCommand([], command)
  command.quantity = 99
  assert.equal(queue[0].quantity, 5)
  assert.equal(enqueueCommand(queue, queue[0]).length, 1)
  writeWorkspace(s, 'alice', 'farm-a', { queue, cache: { farm: { id: 'farm-a' } } })
  assert.equal(readWorkspace(s, 'alice', 'farm-a').queue.length, 1)
  assert.equal(readWorkspace(s, 'bob', 'farm-a').queue.length, 0)
  assert.equal(readWorkspace(s, 'alice', 'farm-b').queue.length, 0)
  assert.throws(() => enqueueCommand(queue, { action: 'orders.confirm' }))
  s.setItem(workspaceKey('alice', 'farm-a'), JSON.stringify({ queue: [{ ...queue[0], farmId: 'other' }] }))
  assert.throws(() => readWorkspace(s, 'alice', 'farm-a'))
})
test('explicit replay preserves IDs and stops on conflict, outage or account switch', async () => {
  const queue = [{ commandId: 'one', action: 'event.create' }, { commandId: 'two', action: 'tasks.complete' }]
  const sent = [], saved = []
  await assert.rejects(replayCommands(queue, async command => { sent.push(command.commandId); if (command.commandId === 'two') throw Error('403'); return {} }, () => true, id => saved.push(id)))
  assert.deepEqual(sent, ['one', 'two']); assert.deepEqual(saved, ['one']); assert.equal(queue.length, 2)
  let active = true
  const completed = []
  await replayCommands(queue, async () => { active = false; return {} }, () => active, id => completed.push(id))
  assert.deepEqual(completed, [])
})
test('storage errors and oversized queues fail visibly instead of pretending to persist', () => {
  assert.throws(() => writeWorkspace({ setItem() { throw Error('quota') } }, 'u', 'f', { queue: [] }))
  assert.throws(() => enqueueCommand(Array.from({ length: 200 }, (_, i) => ({ commandId: String(i) })), { action: 'event.create', commandId: 'next' }))
})
