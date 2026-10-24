import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { createApp, toNodeListener, getRequestURL } from 'h3'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { changeProduction, planningView } from '../server/utils/farm-production.js'
import { emptyWorkspace } from '../server/utils/farm-workspace.js'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import * as Vue from 'vue'

test('production UI preserves failed drafts, resets only confirmed actions, and opts into map tiles', async () => {
  const filename = 'app/components/FarmProduction.vue'
  const source = readFileSync(filename, 'utf8')
  const { descriptor } = parse(source, { filename })
  const script = compileScript(descriptor, { id: 'production-test' })
  const template = compileTemplate({ source: descriptor.template.content, filename, id: 'production-test', compilerOptions: { bindingMetadata: script.bindings } })
  assert.deepEqual(template.errors, [])
  const code = script.content.replace(/import \{([^}]+)\} from 'vue'/g, (_, names) => `const {${names}} = Vue`).replace(/^import .* from .*\n/gm, '').replace('export default', 'return')
  const ui = ['FbTabs', 'FbDialog', 'FbPageHeader', 'FbPanel', 'FbButton', 'FbBadge', 'FbEmptyState']
  const component = new Function('Vue', ...ui, code)(Vue, ...ui.map(() => ({})))
  const props = Vue.reactive({ busy: false, state: { currentUserId: 'user', farm: { id: 'farm', role: 'owner' }, planning: { plots: [], seasons: [{ id: 'season', name: 'Existing season', kind: 'crops', startsOn: '2026-01-01', endsOn: '2026-12-31', schedule: [] }], events: [] } } })
  const emitted = []
  // Exercise watchers within a real mounted component, including their disposal.
  let vm
  const setup = component.setup
  component.setup = (props, context) => { vm = setup(props, context); return vm }
  component.render = () => null
  const renderer = Vue.createRenderer({ createComment: () => ({}), createText: () => ({}), createElement: () => ({}), insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {}, parentNode: () => null, nextSibling: () => null })
  const app = renderer.createApp({ setup: () => () => Vue.h(component, { ...props, onCommand: payload => emitted.push(['command', payload]) }) })
  app.mount({})
  try {
  assert.equal(vm.showMap.value, false)
  assert.match(descriptor.template.content, /ClientOnly v-if="showMap"/)
  Object.assign(vm.season, { name: 'New herd', kind: 'livestock', startsOn: '2026-01-01', endsOn: '2026-12-31' })
  vm.saveSeason()
  assert.equal(emitted[0][1].action, 'season.create')
  props.busy = true
  await Vue.nextTick()
  props.busy = false
  await Vue.nextTick()
  assert.equal(vm.season.name, 'New herd', 'busy completion without success must preserve draft')
  props.state = { ...props.state, lastCommandId: 'confirmed', result: { action: 'season.create' } }
  await Vue.nextTick()
  assert.equal(vm.season.name, '')
  for (const [action, draft, key, fields, save] of [
    ['plot.create', vm.plot, 'name', { name: 'Submitted plot', coordinates: '7,3\n8,3\n8,4' }, vm.savePlot],
    ['schedule.create', vm.schedule, 'title', { title: 'Submitted work', date: '2026-10-24' }, vm.saveSchedule],
    ['event.create', vm.event, 'note', { type: 'observation', date: '2026-10-24', note: 'Submitted observation' }, vm.saveEvent]
  ]) {
    Object.assign(draft, fields)
    const before = emitted.length
    save()
    assert.equal(emitted.length, before + 1, `${action} emits a valid command`)
    props.state = { ...props.state, lastCommandId: action, result: { action } }
    await Vue.nextTick()
    assert.equal(draft[key], '', `${action} clears after its confirmation`)
  }
  Object.assign(vm.event, { date: '2026-10-24', note: 'Original' })
  vm.saveEvent()
  vm.event.note = 'Newer unsent edit'
  props.state = { ...props.state, lastCommandId: 'event-confirmed', result: { action: 'event.create' } }
  await Vue.nextTick()
  assert.equal(vm.event.note, 'Newer unsent edit')
  vm.showMap.value = true
  props.state = { ...props.state, farm: { id: 'another', role: 'owner' } }
  await Vue.nextTick()
  assert.equal(vm.showMap.value, false)
  assert.equal(vm.event.note, '')
  const map = readFileSync('app/components/FarmPlotMap.vue', 'utf8')
  assert.match(map, /config.public.mapTileUrl/)
  assert.match(map, /config.public.mapAttribution/)
  assert.match(map, /safeTileUrl\(tileUrl\)/)
  } finally { app.unmount() }
})

function fixture(role = 'owner') {
  const data = { enterprises: [{ id: 'herd', userId: 'owner' }, { id: 'foreign', userId: 'other' }], inventory: [{ quantity: 12 }], records: [] }
  const ctx = { farmId: 'owner', user: { id: role }, role, workspace: emptyWorkspace('owner') }
  const apply = input => changeProduction(data, ctx, input)
  return { data, ctx, apply }
}
const seasonInput = { action: 'season.create', name: 'Dairy herd', kind: 'livestock', startsOn: '2026-01-01', endsOn: '2026-12-31' }
test('production links plots and register, stores schedules and animal history without stock mutations', () => {
  const { data, ctx, apply } = fixture()
  const plot = apply({ action: 'plot.create', name: 'North', coordinates: [[7, 3], [7.1, 3], [7.1, 3.1]], areaHa: 5 })
  const { seasonId } = apply({ ...seasonInput, plotId: plot.plotId, enterpriseId: 'herd' })
  apply({ action: 'schedule.create', seasonId, date: '2026-03-02', title: 'Check herd' })
  ctx.role = 'worker'
  for (const type of ['health', 'breeding', 'feeding', 'production', 'observation', 'planting']) apply({ action: 'event.create', seasonId, type, date: '2026-03-02', quantity: 2, unit: 'head', note: 'Group A' })
  const view = planningView(data, ctx)
  assert.equal(view.plots.length, 1)
  assert.equal(view.seasons[0].schedule[0].title, 'Check herd')
  assert.equal(view.events.length, 6)
  assert.equal(data.inventory[0].quantity, 12)
  assert.deepEqual(data.records, [])
  view.plots[0].coordinates[0][0] = 80
  assert.equal(ctx.workspace.plots[0].coordinates[0][0], 7)
  assert.equal(view.commands, undefined)
})
test('invalid input and cross-farm references never mutate the workspace', () => {
  const { ctx, apply } = fixture()
  const { seasonId } = apply(seasonInput)
  const before = JSON.stringify(ctx.workspace)
  const invalid = [
    { action: 'plot.create', name: 'Crossing', coordinates: [[0, 0], [3, 3], [0, 3], [2, 0]] },
    { action: 'plot.create', name: 'Repeated', coordinates: [[0, 0], [0, 1], [1, 1], [0, 1], [1, 0]] },
    { ...seasonInput, enterpriseId: 'foreign' }, { ...seasonInput, plotId: 'missing' },
    { ...seasonInput, startsOn: '2026-02-30' }, { ...seasonInput, endsOn: '2025-01-01' }, { ...seasonInput, kind: 'unknown' },
    ...[[[7, 3], [7, 3], [8, 4]], [[0, 0], [1, 1], [2, 2]], [[91, 0], [0, 1], [0, 0]], [['7', 3], [8, 3], [8, 4]], Array(101).fill([0, 0])].map(coordinates => ({ action: 'plot.create', name: 'Bad', coordinates })),
    { action: 'schedule.create', seasonId, date: '2027-01-01', title: 'Outside' },
    { action: 'schedule.create', seasonId: 'foreign', date: '2026-03-01', title: 'Foreign' },
    ...[{ quantity: 0 }, { quantity: -1 }, { quantity: '2' }, { quantity: Infinity }, { quantity: 1, unit: '' }, { type: 'harvest' }, { note: '<script>' }].map(fields => ({ action: 'event.create', seasonId, date: '2026-03-01', type: 'health', unit: 'head', ...fields })),
    { action: 'harvest.create', seasonId, quantity: 3 }
  ]
  for (const input of invalid) {
    assert.throws(() => apply(input), error => [400, 404].includes(error.statusCode), JSON.stringify(input))
    assert.equal(JSON.stringify(ctx.workspace), before)
  }
})
test('production enforces role permissions and bounded lists', () => {
  for (const role of ['worker', 'viewer', 'unknown']) {
    const { apply } = fixture(role)
    assert.throws(() => apply(seasonInput), { statusCode: 403 })
  }
  const { ctx, apply } = fixture('manager')
  const { seasonId } = apply(seasonInput)
  ctx.role = 'viewer'
  assert.throws(() => apply({ action: 'event.create', seasonId, type: 'health', date: '2026-02-01' }), { statusCode: 403 })
  ctx.role = 'owner'
  ctx.workspace.seasons = Array(1000).fill({})
  assert.throws(() => apply(seasonInput), { statusCode: 409 })
})
test('management HTTP uses real auth, persists planning, rejects cross-farm access and deduplicates commands', async () => {
  const dir = await mkdtemp(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'production-http-'))
  process.env.FARMBUDDY_DATA_FILE = join(dir, 'store.json')
  process.env.NODE_ENV = 'production'
  const { default: auth } = await import('../server/api/[...].js')
  const { default: management } = await import('../server/api/management.js')
  const app = createApp().use(event => getRequestURL(event).pathname === '/api/management' ? management(event) : auth(event))
  const server = createServer(toNodeListener(app))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const post = (path, input, cookie) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base.replace('http:', 'https:'), ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(input) })
  try {
    assert.equal((await fetch(base + '/api/management')).status, 401)
    const register = await post('/api/auth/register', { name: 'Production Test', email: 'production@example.test', password: 'production-test-password-long' })
    assert.equal(register.status, 200)
    const cookie = register.headers.get('set-cookie').split(';')[0]
    const input = { ...seasonInput, commandId: randomUUID() }
    const saved = await post('/api/management', input, cookie)
    assert.equal(saved.status, 200)
    const snapshot = await saved.json()
    assert.equal(snapshot.lastCommandId, input.commandId)
    assert.equal(snapshot.result.action, 'season.create')
    const seasonId = snapshot.planning.seasons[0].id
    assert.equal((await post('/api/management', input, cookie)).status, 200)
    assert.equal((await post('/api/management', { ...input, name: 'Changed' }, cookie)).status, 409)
    const invalid = await post('/api/management', { action: 'schedule.create', commandId: randomUUID(), seasonId, title: 'Invalid', date: '2027-01-01' }, cookie)
    assert.equal(invalid.status, 400)
    const event = await post('/api/management', { action: 'event.create', commandId: randomUUID(), seasonId, type: 'health', date: '2026-03-01', note: 'Herd check' }, cookie)
    assert.equal(event.status, 200)
    const current = await (await fetch(base + '/api/management', { headers: { Cookie: cookie } })).json()
    assert.equal(current.planning.seasons.length, 1)
    assert.equal(current.planning.events.length, 1)
    assert.equal(current.planning.seasons[0].schedule.length, 0)
    const second = await post('/api/auth/register', { name: 'Other Farmer', email: 'production-other@example.test', password: 'production-test-password-long' })
    const otherCookie = second.headers.get('set-cookie').split(';')[0]
    assert.equal((await fetch(base + `/api/management?farmId=${snapshot.farm.id}`, { headers: { Cookie: otherCookie } })).status, 403)
  } finally {
    await new Promise(resolve => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
  }
})
