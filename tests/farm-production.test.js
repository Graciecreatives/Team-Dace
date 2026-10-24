import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import * as Vue from 'vue'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'

const filename = 'app/components/FarmProduction.vue'
const source = await readFile(filename, 'utf8')
const { descriptor, errors } = parse(source, { filename })
const script = compileScript(descriptor, { id: 'production' })
const ui = ['FbTabs', 'FbDialog', 'FbPageHeader', 'FbPanel', 'FbButton', 'FbBadge', 'FbEmptyState']
function fixture(role = 'owner') {
  return { currentUserId: 'user', farm: { id: 'farm', role }, enterprises: [{ id: 'register', name: 'Herd' }], planning: {
    plots: [{ id: 'plot', name: 'North', coordinates: [[7,3],[8,3],[8,4]] }],
    seasons: [{ id: 'crop', name: 'Maize', kind: 'crops', startsOn: '2026-01-01', endsOn: '2026-12-31', schedule: [{ id: 'b', title: 'Harvest', date: '2026-11-20' }, { id: 'a', title: 'Plant', date: '2026-03-01' }] }, { id: 'herd', name: 'Dairy', kind: 'livestock', startsOn: '2026-01-01', endsOn: '2026-12-31', schedule: [] }],
    events: [{ id: 'h', seasonId: 'crop', type: 'harvest', date: '2026-10-23', quantity: 20, unit: 'kg', note: 'Actual stock harvest' }, { id: 'p', seasonId: 'crop', type: 'planting', date: '2026-03-01', note: 'North field' }, { id: 'f', seasonId: 'herd', type: 'feeding', date: '2026-10-24', note: 'Hay' }]
  } }
}
function mount(role) {
  const compiled = script.content.replace(/^import \{([^}]+)\} from 'vue'\n/m, 'const {$1} = Vue\n').replace(/^import .* from .*\n/gm, '').replace('export default', 'return')
  const component = new Function('Vue', ...ui, compiled)(Vue, ...ui.map(() => ({})))
  const props = Vue.reactive({ state: fixture(role), busy: false })
  const commands = []
  let vm
  const setup = component.setup
  component.setup = (props, context) => { vm = setup(props, context); return vm }
  component.render = () => null
  const renderer = Vue.createRenderer({ createComment: () => ({}), createText: () => ({}), createElement: () => ({}), insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {}, parentNode: () => null, nextSibling: () => null })
  const app = renderer.createApp({ setup: () => () => Vue.h(component, { state: props.state, busy: props.busy, onCommand: command => commands.push(command) }) })
  app.mount({})
  return { vm, props, commands, close: () => app.unmount(), receipt: async (id, action) => { props.state = { ...props.state, lastCommandId: id, result: { action } }; await Vue.nextTick() } }
}
function validSeason(vm) { Object.assign(vm.season, { name: 'New dairy', kind: 'livestock', startsOn: '2026-01-01', endsOn: '2026-12-31', enterpriseId: 'register', plotId: 'plot' }) }
function validEvent(vm) { Object.assign(vm.event, { type: 'health', date: '2026-10-24', quantity: '2', unit: 'head', note: 'Checked' }) }

test('production SFC compiles script, template and scoped styles with shared UI', () => {
  assert.deepEqual(errors, [])
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename, id: 'production', compilerOptions: { bindingMetadata: script.bindings } }).errors, [])
  for (const style of descriptor.styles) assert.deepEqual(compileStyle({ source: style.content, filename, id: 'production', scoped: true }).errors, [])
  for (const name of ui) assert.ok(source.includes(`<${name}`))
  assert.match(source, /ClientOnly v-if="showMap"/)
  assert.ok(!source.includes('<option value="harvest">') || !source.slice(source.indexOf('Event type')).includes('<option value="harvest">'))
})

test('mounted lifecycle guards owner, manager, worker, viewer and busy commands', async () => {
  for (const role of ['owner', 'manager', 'worker', 'viewer', undefined]) {
    const f = mount(role)
    try {
      if (role === undefined) { f.props.state.farm.role = undefined; await Vue.nextTick() }
      validSeason(f.vm); f.vm.saveSeason()
      assert.equal(f.commands.length, ['owner', 'manager'].includes(role) ? 1 : 0)
      validEvent(f.vm); f.vm.saveEvent()
      assert.equal(f.commands.filter(row => row.action === 'event.create').length, ['owner','manager','worker'].includes(role) ? 1 : 0)
      f.props.busy = true; await Vue.nextTick()
      const count = f.commands.length
      f.vm.saveEvent(); f.vm.saveSeason(); f.vm.saveSchedule(); f.vm.savePlot()
      assert.equal(f.commands.length, count)
    } finally { f.close() }
  }
})

test('actual confirmation watchers preserve edited drafts, unrelated forms and queued snapshots', async () => {
  const f = mount()
  try {
    validSeason(f.vm); f.vm.editor.value = 'season.create'; f.vm.saveSeason()
    f.vm.plot.name = 'Unsubmitted plot'
    f.props.state = { ...f.props.state, error: 'Rejected' }; await Vue.nextTick()
    assert.equal(f.vm.season.name, 'New dairy')
    f.vm.season.name = 'Edited in flight'
    await f.receipt('one', 'season.create')
    assert.equal(f.vm.season.name, 'Edited in flight')
    assert.equal(f.vm.plot.name, 'Unsubmitted plot')
    assert.equal(f.vm.editor.value, 'season.create')
    f.vm.saveSeason(); await f.receipt('two', 'season.create')
    assert.equal(f.vm.season.name, '')
    assert.equal(f.vm.editor.value, '')
    f.vm.season.name = 'Fresh draft'; await f.receipt('two', 'season.create')
    assert.equal(f.vm.season.name, 'Fresh draft')
    validEvent(f.vm); f.vm.saveEvent()
    f.vm.event.note = 'Second queued event'; f.vm.saveEvent()
    await f.receipt('event-one', 'event.create')
    assert.equal(f.vm.event.note, 'Second queued event')
    await f.receipt('event-two', 'event.create')
    assert.equal(f.vm.event.note, '')
    assert.equal(f.commands.find(row => row.action === 'event.create').quantity, 2)
  } finally { f.close() }
})

test('farm and authenticated account changes clear drafts, pending receipts and map consent', async () => {
  const f = mount()
  try {
    validSeason(f.vm); f.vm.saveSeason(); f.vm.showMap.value = true
    f.vm.search.value = 'private'; f.vm.filter.value = 'health'; f.vm.editor.value = 'plot.create'
    f.props.state = { ...f.props.state, currentUserId: 'other-user' }; await Vue.nextTick()
    assert.equal(f.vm.showMap.value, false)
    assert.equal(f.vm.search.value, '')
    assert.equal(f.vm.filter.value, '')
    assert.equal(f.vm.editor.value, '')
    assert.equal(f.vm.season.name, '')
    f.vm.season.name = 'Other account draft'
    await f.receipt('late', 'season.create')
    assert.equal(f.vm.season.name, 'Other account draft')
    f.vm.showMap.value = true
    f.props.state = { ...f.props.state, farm: { id: 'other-farm', role: 'owner' } }; await Vue.nextTick()
    assert.equal(f.vm.showMap.value, false)
    assert.equal(f.vm.season.name, '')
  } finally { f.close() }
})

test('plot and schedule confirmations clear only unchanged submitted editors', async () => {
  const f = mount()
  try {
    Object.assign(f.vm.plot, { name: 'South', coordinates: '7,3\n8,3\n8,4', areaHa: '3' })
    f.vm.editor.value = 'plot.create'
    await Vue.nextTick()
    assert.equal(f.vm.tab.value, 'plots')
    f.vm.savePlot()
    Object.assign(f.vm.schedule, { title: 'Inspect field', date: '2026-10-24' })
    f.vm.editor.value = 'schedule.create'
    await Vue.nextTick()
    assert.equal(f.vm.tab.value, 'seasons')
    f.vm.saveSchedule()
    await f.receipt('plot-saved', 'plot.create')
    assert.equal(f.vm.plot.name, '')
    assert.equal(f.vm.schedule.title, 'Inspect field')
    assert.equal(f.vm.editor.value, 'schedule.create')
    f.vm.schedule.title = 'Edited during save'
    await f.receipt('schedule-saved', 'schedule.create')
    assert.equal(f.vm.schedule.title, 'Edited during save')
    f.vm.saveSchedule()
    await f.receipt('schedule-edited-saved', 'schedule.create')
    assert.equal(f.vm.schedule.title, '')
    assert.equal(f.vm.editor.value, '')
  } finally { f.close() }
})

test('persisted receipts match the correct retry payload, including optional blank values', async () => {
  const f = mount()
  try {
    validEvent(f.vm)
    f.vm.event.quantity = ''; f.vm.event.unit = ''; f.vm.event.note = 'First rejected draft'
    f.vm.saveEvent()
    f.vm.event.note = '  Retried observation  '
    f.vm.saveEvent()
    f.props.state = { ...f.props.state, planning: { ...f.props.state.planning, events: [...f.props.state.planning.events, { id: 'saved', seasonId: 'crop', type: 'health', date: '2026-10-24', note: 'Retried observation' }] }, lastCommandId: 'retry', result: { action: 'event.create', eventId: 'saved' } }
    await Vue.nextTick()
    assert.equal(f.vm.event.note, '')
    validEvent(f.vm); f.vm.event.note = 'Unconfirmed draft'; f.vm.saveEvent()
    f.props.state = { ...f.props.state, lastCommandId: 'unrelated', result: { action: 'event.create', eventId: 'h' } }
    await Vue.nextTick()
    assert.equal(f.vm.event.note, 'Unconfirmed draft')
  } finally { f.close() }
})

test('reactive filters and timeline use real selected-season data including harvest', async () => {
  const f = mount()
  try {
    assert.equal(f.vm.selected.value, 'crop')
    assert.deepEqual(f.vm.agenda.value.map(row => row.id), ['a','b'])
    assert.deepEqual(f.vm.visibleAgenda.value.map(row => row.id), f.vm.agenda.value.filter(row => row.date >= f.vm.today).map(row => row.id))
    f.vm.scheduleView.value = 'all'
    assert.equal(f.vm.visibleAgenda.value.length, 2)
    assert.deepEqual(f.vm.history.value.map(row => row.id), ['h','p'])
    f.vm.filter.value = 'harvest'
    assert.equal(f.vm.history.value[0].quantity, 20)
    f.vm.search.value = 'missing'; assert.equal(f.vm.history.value.length, 0)
    f.vm.search.value = 'DAIRY'; assert.equal(f.vm.visibleSeasons.value.length, 1)
    f.vm.kind.value = 'crops'; assert.equal(f.vm.visibleSeasons.value.length, 0)
    f.vm.search.value = ''; f.vm.kind.value = 'livestock'; assert.equal(f.vm.visibleSeasons.value[0].id, 'herd')
    f.vm.selected.value = 'herd'; f.vm.filter.value = ''
    assert.equal(f.vm.history.value[0].type, 'feeding')
    f.props.state.planning.seasons = []; await Vue.nextTick()
    assert.equal(f.vm.active.value, undefined)
    assert.equal(f.vm.selected.value, '')
  } finally { f.close() }
})

test('validation blocks invalid dates, links, numeric values and unsafe boundaries before emission', () => {
  const f = mount()
  try {
    const rejected = action => { const count = f.commands.length; action(); assert.equal(f.commands.length, count); assert.ok(f.vm.error.value) }
    validSeason(f.vm)
    for (const change of [{ name: ' ' }, { startsOn: '2026-02-30' }, { endsOn: '2025-01-01' }, { plotId: 'foreign' }, { enterpriseId: 'foreign' }, { kind: 'invented' }]) {
      validSeason(f.vm); Object.assign(f.vm.season, change); rejected(() => f.vm.saveSeason())
    }
    validSeason(f.vm); f.vm.saveSeason(); assert.equal(f.commands.length, 1)
    validEvent(f.vm)
    for (const change of [{ type: 'harvest' }, { quantity: '-1' }, { quantity: 'NaN' }, { unit: ' ' }, { date: '2027-01-01' }, { date: '2026-02-30' }, { date: '0000-01-01' }, { note: '<script>' }, { note: 'line\nbreak' }, { note: 'x'.repeat(4001) }]) {
      validEvent(f.vm); Object.assign(f.vm.event, change); rejected(() => f.vm.saveEvent())
    }
    Object.assign(f.vm.schedule, { title: ' ', date: '2026-10-24' }); rejected(() => f.vm.saveSchedule())
    Object.assign(f.vm.schedule, { title: 'Check herd', date: '2027-01-01' }); rejected(() => f.vm.saveSchedule())
    f.vm.schedule.date = '2026-10-24'; f.vm.saveSchedule(); assert.equal(f.commands.at(-1).seasonId, 'crop')
    f.vm.plot.name = 'North'
    for (const coordinates of ['7,3\n7,3\n8,4', '7,3\n8,4\n9,5', '91,3\n8,3\n8,4', '0,0\n1,1\n0,1\n1,0', '7,3,4\n8,3\n8,4']) {
      f.vm.plot.coordinates = coordinates; rejected(() => f.vm.savePlot())
    }
    f.vm.plot.coordinates = '7,3\n8,3\n8,4\n7,3'; f.vm.plot.areaHa = 'Infinity'; rejected(() => f.vm.savePlot())
    f.vm.plot.areaHa = '2'; f.vm.savePlot()
    assert.deepEqual(f.commands.at(-1).coordinates, [[7,3],[8,3],[8,4],[7,3]])
    assert.equal(f.commands.at(-1).areaHa, 2)
  } finally { f.close() }
})
