import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import * as vue from 'vue'
import * as helpers from '../utils/farm-journal.js'
const source = readFileSync(new URL('../components/FarmJournal.vue', import.meta.url), 'utf8')
function harness(initial = {}) {
  const props = vue.reactive({ userId: 'a', mode: 'records', records: [], reminders: [], busy: false, deleting: '', pendingReminder: '', ...initial })
  const emitted = [], scope = vue.effectScope()
  const dependencies = { ...helpers, computed: vue.computed, reactive: vue.reactive, ref: vue.ref, watch: vue.watch, nextTick: vue.nextTick, onMounted() {}, onUnmounted() {}, defineProps: () => props, defineEmits: () => (...args) => emitted.push(args) }
  const script = parse(source).descriptor.scriptSetup.content.replace(/^import .*$/gm, '')
  const state = scope.run(() => new Function(...Object.keys(dependencies), script + '\nreturn { filters, records, reminders, counts, act, clearFilters, month, view, cells, selectDay, moveMonth, goToday, today, dayKey, calendar, dayCounts }')(...Object.values(dependencies)))
  return { props, state, emitted, stop: () => scope.stop() }
}
test('actual SFC script, template and responsive scoped CSS compile', () => {
  const { descriptor, errors } = parse(source)
  assert.deepEqual(errors, [])
  const script = compileScript(descriptor, { id: 'journal' })
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'FarmJournal.vue', id: 'journal', compilerOptions: { bindingMetadata: script.bindings } }).errors, [])
  assert.deepEqual(compileStyle({ source: descriptor.styles[0].content, id: 'journal', scoped: true }).errors, [])
  assert.doesNotMatch(source, /\$fetch|localStorage|sessionStorage|v-html|<form/)
  for (const name of ['PageHeader', 'Button', 'Panel', 'Badge', 'EmptyState', 'Tabs']) assert.ok(readFileSync(new URL(`../components/ui/Fb${name}.vue`, import.meta.url), 'utf8'))
})
test('civil dates, leap years, month rollover and grids remain correct across timezones', () => {
  const original = process.env.TZ
  try {
    for (const zone of ['America/Los_Angeles', 'Pacific/Kiritimati', 'Europe/London']) {
      process.env.TZ = zone
      assert.equal(helpers.localDay(helpers.parseDay('2028-02-29')), '2028-02-29')
      assert.equal(helpers.parseDay('2026-02-29'), null)
      assert.equal(helpers.parseDay('2026-13-01'), null)
      assert.equal(helpers.parseDay('2026-1-01'), null)
      assert.equal(helpers.shiftDay('2026-03-08', 1), '2026-03-09')
      assert.equal(helpers.shiftMonth('2026-12', 1), '2027-01')
      assert.equal(helpers.shiftMonth('2026-01', -1), '2025-12')
      const grid = helpers.monthGrid('2028-02')
      assert.equal(grid.length, 42)
      assert.equal(grid[0].date, '2028-01-30')
      assert.equal(grid.filter(day => day.inMonth).length, 29)
      assert.equal(new Set(grid.map(day => day.date)).size, 42)
      assert.match(helpers.displayDay('2026-10-24'), /24/)
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original }
  assert.deepEqual(helpers.monthGrid('bad'), [])
})
const records = [{ id: 'r1', title: 'Harvest', note: 'Maize', category: 'income', date: '2026-10-22' }, { id: 'r2', title: 'Water', category: 'activity', date: '2026-10-24', sourceId: 'task' }]
const reminders = [{ id: 'm1', title: 'Water', date: '2026-10-23', completed: false }, { id: 'm2', title: 'Feed', date: '2026-10-24', completed: false }, { id: 'm3', title: 'Water old', date: '2026-10-24', completed: true }, { id: 'm4', title: 'Invalid date', date: 'bad', completed: false }]
test('filters combine and counts use actual completion and due dates without mutation', () => {
  assert.deepEqual(helpers.filterRecords(records, { search: ' MAIZE ', category: 'income', from: '2026-10-21', to: '2026-10-23' }), [records[0]])
  assert.deepEqual(helpers.filterRecords(records, { from: '2026-10-25' }), [])
  assert.deepEqual(helpers.reminderCounts(reminders, '2026-10-24'), { open: 3, completed: 1, overdue: 1, today: 2 })
  assert.deepEqual(helpers.filterReminders(reminders, { status: 'overdue' }, '2026-10-24'), [reminders[0]])
  assert.deepEqual(helpers.filterReminders(reminders, { status: 'completed', search: 'water', date: '2026-10-24' }, '2026-10-24'), [reminders[2]])
  assert.equal(records[0].id, 'r1')
})
test('actual controller emits exact parent events and refuses busy, pending and linked mutations', () => {
  const h = harness({ records, reminders }), s = h.state
  for (const event of ['add-record', 'add-reminder']) s.act(event)
  for (const event of ['edit-record', 'delete-record']) s.act(event, records[0])
  for (const event of ['edit-reminder', 'delete-reminder', 'toggle-reminder']) s.act(event, reminders[0])
  assert.deepEqual(h.emitted.map(row => row[0]), ['add-record', 'add-reminder', 'edit-record', 'delete-record', 'edit-reminder', 'delete-reminder', 'toggle-reminder'])
  assert.equal(h.emitted[2][1].id, 'r1')
  s.act('edit-record', records[1]); s.act('delete-record', records[1]); s.act('edit-record', { id: 'foreign', userId: 'other' })
  h.props.busy = true; s.act('add-record'); s.act('toggle-reminder', reminders[0])
  h.props.busy = false; h.props.pendingReminder = 'm1'; s.act('toggle-reminder', reminders[0])
  h.props.deleting = 'r1'; s.act('edit-record', records[0])
  assert.equal(h.emitted.length, 7)
  assert.equal(s.reminders.value[0].completed, false)
  h.stop()
})
test('account change synchronously clears filters, calendar selection and private UI', async () => {
  const h = harness({ records: [...records, { id: 'foreign', userId: 'other' }], reminders }), s = h.state
  Object.assign(s.filters, { search: 'Water', category: 'activity', from: '2026-10-01', to: '2026-11-01', status: 'open', date: '2026-10-24' })
  s.month.value = '2020-01'; s.view.value = 'list'
  h.props.userId = ''
  assert.deepEqual({ ...s.filters }, { search: '', category: '', from: '', to: '', status: 'all', date: '' })
  assert.equal(s.view.value, 'calendar')
  assert.equal(s.month.value, helpers.localDay().slice(0, 7))
  assert.deepEqual(s.records.value, []); assert.deepEqual(s.reminders.value, [])
  s.act('add-record'); assert.equal(h.emitted.length, 0)
  h.props.userId = 'a'
  assert.equal(s.records.value.length, 2)
  s.filters.search = 'harvest'; assert.equal(s.records.value.length, 1)
  h.props.mode = 'reminders'; await vue.nextTick(); assert.equal(s.filters.search, '')
  h.stop()
})
test('calendar selection filters list, navigation crosses months, keyboard focuses real target', async () => {
  const h = harness({ reminders }), s = h.state
  s.selectDay('2026-10-24'); assert.equal(s.reminders.value.length, 2)
  s.selectDay('2026-10-24'); assert.equal(s.filters.date, '')
  s.moveMonth(1); assert.equal(s.month.value, '2026-11')
  let focused = '', prevented = false
  s.calendar.value = { querySelector(selector) { focused = selector; return { focus() {} } } }
  await s.dayKey({ key: 'ArrowRight', preventDefault() { prevented = true } }, '2026-12-31')
  assert.equal(s.month.value, '2027-01'); assert.equal(focused, '[data-day="2027-01-01"]'); assert.equal(prevented, true)
  s.goToday(); assert.equal(s.filters.date, helpers.localDay())
  h.props.busy = true; s.selectDay('2020-01-01'); s.moveMonth(1)
  assert.equal(s.filters.date, helpers.localDay())
  assert.equal(s.month.value, helpers.localDay().slice(0, 7))
  h.stop()
})
