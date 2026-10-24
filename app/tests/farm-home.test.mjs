import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import { computed, reactive } from 'vue'
import * as icons from 'lucide-vue-next'
const source = await readFile(new URL('../components/FarmHome.vue', import.meta.url), 'utf8')
const descriptor = parse(source).descriptor

test('farm home compiles with visual navigation and no permanent data-entry forms', () => {
  const script = compileScript(descriptor, { id: 'home' })
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'FarmHome.vue', id: 'home', compilerOptions: { bindingMetadata: script.bindings } }).errors, [])
  assert.deepEqual(compileStyle({ source: descriptor.styles[0].content, filename: 'FarmHome.vue', id: 'home', scoped: true }).errors, [])
  assert.doesNotMatch(descriptor.template.content, /<form\b|<input\b|<select\b/)
  assert.match(source, /aria-label="Choose a farm job"/)
  assert.match(source, /prefers-reduced-motion/)
  assert.match(source, /min-height:44px/)
})

test('private farm profile compiles and labels publishing boundaries honestly', async () => {
  const source = await readFile(new URL('../components/FarmProfile.vue', import.meta.url), 'utf8')
  const { descriptor } = parse(source)
  const script = compileScript(descriptor, { id: 'profile' })
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'FarmProfile.vue', id: 'profile', compilerOptions: { bindingMetadata: script.bindings } }).errors, [])
  assert.deepEqual(compileStyle({ source: descriptor.styles[0].content, filename: 'FarmProfile.vue', id: 'profile', scoped: true }).errors, [])
  assert.match(source, /This page is not a public listing/)
  assert.match(source, /Farm passport verification is not available/)
  assert.match(source, /emit\('edit'\)/)
})

function setup(input) {
  const props = reactive({ user: { id: 'one', farmName: 'Our farm' }, records: [], reminders: [], busy: false, ...input })
  const dependencies = { computed, defineProps: () => props, defineEmits: () => () => {}, ...Object.fromEntries(Object.entries(icons).filter(([key]) => /^[A-Z]\w*$/.test(key))), MoneyOut: icons.ArrowUpRight }
  const code = descriptor.scriptSetup.content.replace(/^import .*$/gm, '')
  const state = new Function(...Object.keys(dependencies), `${code};return {shortcuts,pending,recent,income,expenses,dateLabel,money}`)(...Object.values(dependencies))
  return { props, state }
}

test('home reflects only actual records, orders reminders, never mutates input, and follows account data changes', () => {
  const { props, state } = setup({ records: [{id:'a',title:'A',category:'income',amount:125.25,createdAt:'2026-10-24T09:00:00Z'}, {id:'b',title:'B',category:'expense',amount:30,createdAt:'2026-10-24T10:00:00Z'}], reminders: [{id:'late',date:'2026-11-01'}, {id:'done',date:'2026-10-23',completed:true}, {id:'early',date:'2026-10-24'}] })
  assert.equal(state.income.value, 125.25)
  assert.equal(state.expenses.value, 30)
  assert.deepEqual(state.pending.value.map(row => row.id), ['early','late'])
  assert.equal(state.recent.value[0].id, 'b')
  assert.equal(props.records[0].id, 'a')
  assert.equal(props.reminders[0].id, 'late')
  props.records = []; props.reminders = []
  assert.equal(state.income.value, 0)
  assert.deepEqual(state.recent.value, [])
  assert.deepEqual(state.pending.value, [])
  assert.equal(state.dateLabel('not-a-date'), 'Date unavailable')
  assert.equal(state.shortcuts.length, 4)
  assert.deepEqual(state.shortcuts.map(job => job.id), ['planning','operations','business','bookkeeping'])
})
