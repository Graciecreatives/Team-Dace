import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { createApp, toNodeListener, getRequestURL } from 'h3'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { changeOperations, acceptInvitation, operationsView } from '../server/utils/farm-operations.js'
import * as operationHelpers from '../app/utils/operations-board.js'
import { emptyWorkspace, workspaceContext } from '../server/utils/farm-workspace.js'

function fixture() {
  const users = [{ id: 'owner', email: 'owner@example.test', name: 'Owner' }, { id: 'worker', email: 'worker@example.test', name: 'Worker' }, { id: 'other', email: 'other@example.test' }]
  const workspace = emptyWorkspace('owner')
  const data = { users, farmWorkspaces: [workspace], inventory: [{ id: 'feed', userId: 'owner', quantity: 20 }, { id: 'foreign', userId: 'other', quantity: 100 }] }
  const owner = workspaceContext(data, users[0], 'owner')
  return { data, workspace, users, owner }
}
const rejects = (fn, status) => assert.throws(fn, e => e.statusCode === status)

test('invitations hash single-use tokens and require the signed account email', () => {
  const { data, workspace, users, owner } = fixture()
  const { token } = changeOperations(data, owner, { action: 'team.invite', email: users[1].email, role: 'worker' })
  assert.match(token, /^[a-f0-9]{64}$/)
  assert.equal(workspace.invitations[0].tokenHash, createHash('sha256').update(token).digest('hex'))
  assert.ok(!JSON.stringify(data).includes(token))
  assert.ok(!JSON.stringify(operationsView(data, owner)).includes('tokenHash'))
  const before = JSON.stringify(data)
  rejects(() => acceptInvitation(data, users[2], { token }), 403)
  rejects(() => acceptInvitation(data, { ...users[1], email: 'wrong@example.test' }, { token }), 403)
  assert.equal(JSON.stringify(data), before)
  assert.deepEqual(acceptInvitation(data, { ...users[1], email: 'Worker@Example.Test' }, { token }), { farmId: 'owner' })
  assert.equal(workspaceContext(data, users[1], 'owner').role, 'worker')
  rejects(() => acceptInvitation(data, users[1], { token }), 404)
  assert.ok(!JSON.stringify(operationsView(data, workspaceContext(data, users[1], 'owner'))).includes(users[1].email))
  changeOperations(data, owner, { action: 'team.remove', userId: 'worker' })
  rejects(() => workspaceContext(data, users[1], 'owner'), 403)
  rejects(() => changeOperations(data, owner, { action: 'team.remove', userId: 'owner' }), 400)
})

test('expired invitations and role escalation cannot mutate membership', () => {
  const { data, workspace, users, owner } = fixture()
  rejects(() => changeOperations(data, owner, { action: 'team.invite', email: users[1].email, role: 'owner' }), 400)
  const { token } = changeOperations(data, owner, { action: 'team.invite', email: users[1].email, role: 'viewer' })
  workspace.invitations[0].expiresAt = '2000-01-01T00:00:00.000Z'
  rejects(() => acceptInvitation(data, users[1], { token }), 410)
  assert.equal(workspace.members.length, 0)
  rejects(() => changeOperations(data, { ...owner, role: 'manager' }, { action: 'team.invite', email: users[1].email, role: 'worker' }), 403)
})

test('tasks enforce active assignee accounts, season ownership and atomic stock use', () => {
  const { data, workspace, users, owner } = fixture()
  workspace.members.push({ userId: 'worker', role: 'worker', status: 'active' })
  workspace.seasons.push({ id: 'season' })
  const worker = workspaceContext(data, users[1], 'owner')
  const create = { action: 'tasks.create', title: 'Feed flock', dueOn: '2026-10-25', assigneeId: 'worker', seasonId: 'season' }
  for (const fields of [{ assigneeId: 'other' }, { seasonId: 'foreign' }, { dueOn: '2026-02-30' }]) rejects(() => changeOperations(data, owner, { ...create, ...fields }), fields.seasonId ? 404 : 400)
  rejects(() => changeOperations(data, worker, create), 403)
  const { taskId: id } = changeOperations(data, owner, create)
  const consume = { action: 'tasks.consume', id, inventoryId: 'feed', quantity: 5 }
  for (const fields of [{ quantity: 21 }, { quantity: 0 }, { quantity: 0.0000001 }, { quantity: 1.1234567 }, { quantity: '2' }, { inventoryId: 'foreign' }]) {
    const before = JSON.stringify(data)
    assert.throws(() => changeOperations(data, worker, { ...consume, ...fields }))
    assert.equal(JSON.stringify(data), before)
  }
  rejects(() => changeOperations(data, { ...worker, user: users[2] }, consume), 403)
  rejects(() => changeOperations(data, { ...worker, role: 'viewer' }, consume), 403)
  changeOperations(data, worker, consume)
  assert.equal(data.inventory[0].quantity, 15)
  assert.ok(Number.isFinite(Date.parse(data.inventory[0].updatedAt)))
  assert.equal(workspace.movements[0].actorId, 'worker')
  assert.equal(workspace.movements[0].taskId, id)
  assert.equal(workspace.movements[0].seasonId, 'season')
  rejects(() => changeOperations(data, worker, { action: 'tasks.complete', id, completed: 'true' }), 400)
  changeOperations(data, worker, { action: 'tasks.complete', id, completed: true })
  rejects(() => changeOperations(data, worker, consume), 409)
  changeOperations(data, owner, { action: 'team.remove', userId: 'worker' })
  rejects(() => changeOperations(data, worker, { action: 'tasks.complete', id, completed: false }), 403)
  rejects(() => changeOperations(data, owner, create), 400)
})

test('HTTP signed accounts accept invitations, replay safely and lose access on revocation', async () => {
  const directory = await mkdtemp(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'farm-operations-'))
  process.env.FARMBUDDY_DATA_FILE = join(directory, 'store.json')
  process.env.NODE_ENV = 'production'
  const { default: auth } = await import('../server/api/[...].js')
  const { default: management } = await import('../server/api/management.js')
  const server = createServer(toNodeListener(createApp().use(event => getRequestURL(event).pathname === '/api/management' ? management(event) : auth(event))))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  async function request(path, cookie, input, status = 200, origin = base.replace('http:', 'https:')) {
    const response = await fetch(base + path, { method: input ? 'POST' : 'GET', headers: { ...(cookie ? { Cookie: cookie } : {}), ...(input ? { Origin: origin, 'Content-Type': 'application/json' } : {}) }, body: input ? JSON.stringify(input) : undefined })
    const payload = await response.json()
    assert.equal(response.status, status, JSON.stringify(payload))
    return { payload, cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  const command = (action, fields = {}) => ({ commandId: randomUUID(), action, ...fields })
  try {
    await request('/api/management', undefined, undefined, 401)
    const register = email => request('/api/auth/register', undefined, { name: 'Account', email, password: 'operations-secure-password' })
    const owner = (await register('owner@example.test')).cookie
    const worker = (await register('worker@example.test')).cookie
    const other = (await register('other@example.test')).cookie
    const farmId = (await request('/api/management', owner)).payload.farm.id
    const pendingInvite = (await request('/api/management', owner, command('team.invite', { email: 'OTHER@EXAMPLE.TEST', role: 'viewer' }))).payload
    const pendingId = pendingInvite.operations.invitations[0].id
    await request('/api/management', other, command('team.revoke', { farmId, id: pendingId }), 403)
    await request('/api/management', owner, command('team.revoke', { id: pendingId }))
    await request('/api/management', other, command('team.accept', { token: pendingInvite.result.token }), 404)
    const inviteInput = command('team.invite', { email: 'worker@example.test', role: 'worker' })
    await request('/api/management', owner, inviteInput, 403, 'https://evil.example')
    const invite = (await request('/api/management', owner, inviteInput)).payload
    assert.match(invite.result.token, /^[a-f0-9]{64}$/)
    assert.equal((await request('/api/management', owner, inviteInput)).payload.result.token, undefined)
    assert.equal((await request('/api/management', owner)).payload.result, undefined)
    const acceptance = command('team.accept', { token: invite.result.token })
    await request('/api/management', other, acceptance, 403)
    const joined = (await request('/api/management', worker, acceptance)).payload
    assert.equal(joined.farm.id, farmId)
    assert.equal(joined.farm.role, 'worker')
    assert.equal((await request('/api/management', worker, acceptance)).payload.result.alreadyApplied, true)
    await request('/api/management', worker, command('team.invite', { farmId, email: 'other@example.test', role: 'manager' }), 403)
    const workerId = joined.currentUserId
    const created = (await request('/api/management', owner, command('tasks.create', { title: 'Water seedlings', dueOn: '2026-10-25', assigneeId: workerId }))).payload
    const id = created.operations.tasks[0].id
    const { store } = await import('../server/utils/store.js')
    await store(data => data.inventory.push({ id: 'http-feed', userId: farmId, name: 'Feed', quantity: 10, unit: 'kg' }), true)
    const useStock = () => command('tasks.consume', { farmId, id, inventoryId: 'http-feed', quantity: 7 })
    const concurrent = await Promise.all([useStock(), useStock()].map(input => fetch(base + '/api/management', { method: 'POST', headers: { Cookie: worker, Origin: base.replace('http:', 'https:'), 'Content-Type': 'application/json' }, body: JSON.stringify(input) })))
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409])
    const afterUse = (await request(`/api/management?farmId=${farmId}`, worker)).payload
    assert.equal(afterUse.inventory.find(s => s.id === 'http-feed').quantity, 3)
    assert.equal(afterUse.operations.movements.length, 1)
    await request('/api/management', worker, command('tasks.complete', { farmId, id, completed: true }))
    await request('/api/management', owner, command('team.remove', { userId: workerId }))
    await request(`/api/management?farmId=${farmId}`, worker, undefined, 403)
    await request('/api/management', worker, command('tasks.complete', { farmId, id, completed: false }), 403)
  } finally {
    await new Promise(resolve => server.close(resolve))
    await rm(directory, { recursive: true, force: true })
  }
})

test('owners revoke pending invitations and viewers cannot receive tasks', () => {
  const { data, workspace, users, owner } = fixture()
  const { token } = changeOperations(data, owner, { action: 'team.invite', email: 'WORKER@Example.Test', role: 'viewer' })
  assert.equal(workspace.invitations[0].email, users[1].email)
  const id = workspace.invitations[0].id
  rejects(() => changeOperations(data, { ...owner, role: 'manager' }, { action: 'team.revoke', id }), 403)
  changeOperations(data, owner, { action: 'team.revoke', id })
  rejects(() => acceptInvitation(data, users[1], { token }), 404)
  assert.ok(workspace.invitations[0].revokedAt)
  assert.equal(workspace.invitations[0].tokenHash, undefined)
  workspace.members.push({ userId: 'worker', role: 'viewer', status: 'active' })
  rejects(() => changeOperations(data, owner, { action: 'tasks.create', title: 'Work', dueOn: '2026-10-25', assigneeId: 'worker' }), 400)
  const { taskId } = changeOperations(data, owner, { action: 'tasks.create', title: 'Work', dueOn: '2026-10-25', assigneeId: 'owner' })
  data.inventory[0].quantity = 0.3
  changeOperations(data, owner, { action: 'tasks.consume', id: taskId, inventoryId: 'feed', quantity: 0.1 })
  assert.equal(data.inventory[0].quantity, 0.2)
})

test('operations drafts reset only after a matching confirmed command', async () => {
  const vue = await import('vue')
  const source = await readFile('app/components/FarmOperations.vue', 'utf8')
  const { descriptor } = parse(source)
  const props = vue.reactive({ state: { farm: { id: 'farm', role: 'owner' }, currentUserId: 'owner', operations: { tasks: [{ id: 'task', completed: false }] }, inventory: [{ id: 'stock', quantity: 5 }], lastCommandId: 'before', result: null }, busy: false })
  const confirm = (id, result) => { props.state = { ...props.state, lastCommandId: id, result } }
  const emitted = []
  const setup = new Function(...Object.keys(operationHelpers), 'nextTick', 'computed', 'reactive', 'ref', 'watch', 'defineProps', 'defineEmits', descriptor.scriptSetup.content.replace(/^import .*$/gm, '') + '\nreturn { invite, accept, task, consume, submit }')
  const forms = setup(...Object.values(operationHelpers), vue.nextTick, vue.computed, vue.reactive, vue.ref, vue.watch, () => props, () => (...args) => emitted.push(args))
  forms.task.title = 'Retain until confirmed'
  forms.submit('tasks.create', forms.task)
  await vue.nextTick()
  assert.equal(forms.task.title, 'Retain until confirmed')
  confirm('unrelated', { action: 'team.invite' })
  await vue.nextTick()
  assert.equal(forms.task.title, 'Retain until confirmed')
  confirm('confirmed', { action: 'tasks.create', taskId: 'created' })
  await vue.nextTick()
  assert.equal(forms.task.title, '')
  forms.consume.task = { inventoryId: 'stock', quantity: 2 }
  forms.submit('tasks.consume', { id: 'task' })
  confirm('consumed', { action: 'tasks.consume', taskId: 'task' })
  await vue.nextTick()
  assert.equal(forms.consume.task, undefined)
  forms.accept.token = 'private-token'
  forms.submit('team.accept', forms.accept)
  confirm('joined', { action: 'team.accept', farmId: 'farm' })
  await vue.nextTick()
  assert.equal(forms.accept.token, '')
  forms.invite.email = 'person@example.test'
  forms.submit('team.invite', forms.invite)
  confirm('invited', { action: 'team.invite', token: 'one-time' })
  await vue.nextTick()
  assert.equal(forms.invite.email, '')
  assert.equal(props.state.result.token, 'one-time')
})

test('operations Vue compiles and interpolates one-time result token safely', async () => {
  const filename = 'app/components/FarmOperations.vue'
  const source = await readFile(filename, 'utf8')
  const { descriptor, errors } = parse(source, { filename })
  assert.deepEqual(errors, [])
  const script = compileScript(descriptor, { id: 'operations' })
  const result = compileTemplate({ source: descriptor.template.content, filename, id: 'operations', compilerOptions: { bindingMetadata: script.bindings } })
  assert.deepEqual(result.errors, [])
  assert.match(source, /\{\{ state\.result\.token \}\}/)
  assert.ok(!source.includes('v-html'))
})
