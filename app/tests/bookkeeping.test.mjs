import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as Vue from 'vue'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import * as helpers from '../utils/bookkeeping.js'
import { amountToCents, entryMonth, filterEntries, summarizeEntries, monthlySummary, csvCell, exportEntriesCsv } from '../utils/bookkeeping.js'
const records = [
  { id: '1', title: 'Egg sales', category: 'income', amount: '10.075', note: 'Market', createdAt: '2026-10-01T00:00:00Z' },
  { id: '2', title: 'Feed', category: 'expense', amount: 0.1, note: 'Maize', createdAt: '2026-09-30T23:00:00Z' },
  { id: '3', title: 'Watered', category: 'activity', amount: 999, createdAt: '2026-10-02T00:00:00Z' },
  { id: '4', title: 'More eggs', category: 'income', amount: 0.2, createdAt: '2026-10-03T00:00:00Z' },
]
test('rounds decimal amounts in cents without binary rounding drift', () => {
  assert.equal(amountToCents('1.005'), 101)
  assert.equal(amountToCents(10.075), 1008)
  assert.equal(amountToCents('0'), 0)
  for (const value of ['', null, undefined, Infinity, NaN, '-1', 'oops', '1e9']) assert.equal(amountToCents(value), null)
  assert.deepEqual(summarizeEntries(records), { incomeCents: 1028, expenseCents: 10, netCents: 1018, invalidCount: 0 })
  assert.equal(summarizeEntries([{ category: 'expense', amount: 10 }]).netCents, -1000)
  assert.equal(summarizeEntries([{ category: 'income', amount: 'bad' }]).invalidCount, 1)
})
test('filters cash only, searches notes and titles, sorts without mutation', () => {
  assert.deepEqual(filterEntries(records).map(r => r.id), ['4', '1', '2'])
  assert.deepEqual(filterEntries(records, { month: '2026-10', category: 'income', search: ' MARKET ' }).map(r => r.id), ['1'])
  assert.deepEqual(filterEntries(records, { search: 'maize' }).map(r => r.id), ['2'])
  assert.equal(records[0].id, '1')
  assert.deepEqual(filterEntries(records, { month: '2025-01' }), [])
})
test('monthly summary uses UTC and excludes activities and invalid dates', () => {
  const summary = monthlySummary([...records, { category: 'income', amount: 2, createdAt: 'bad' }])
  assert.deepEqual(summary.map(r => [r.month, r.netCents]), [['2026-10', 1028], ['2026-09', -10]])
  assert.deepEqual(monthlySummary([]), [])
})
test('CSV escapes quotes, commas, newlines and spreadsheet formulas', () => {
  assert.equal(csvCell('a,"b"\nc'), '"a,""b""\nc"')
  for (const value of ['=1+1', '+SUM(A1)', '-1+1', '@SUM(A1)', '  =1', '\t=1', '\rhello', '\nhello']) assert.equal(csvCell(value), `"'${value}"`)
  const csv = exportEntriesCsv(filterEntries(records, { month: '2026-10' }))
  assert.ok(csv.includes('"10.08"'))
  assert.ok(!csv.includes('Feed'))
  assert.ok(!exportEntriesCsv(records).includes('Watered'))
  assert.equal(exportEntriesCsv([]).split('\r\n').length, 1)
})

test('missing and invalid calendar dates never become January 1970 or roll into another month', () => {
  for (const createdAt of [null, undefined, '', 'bad', '2026-02-30', '2026-02-30T00:00:00Z']) {
    assert.equal(entryMonth({ createdAt }), '')
    assert.deepEqual(monthlySummary([{ category: 'income', amount: 1, createdAt }]), [])
    assert.ok(exportEntriesCsv([{ category: 'income', amount: 1, createdAt }]).split('\r\n')[1].startsWith('"",'))
  }
  assert.equal(entryMonth({ createdAt: '2026-10-01T00:30:00+02:00' }), '2026-09')
  assert.equal(amountToCents('9007199254740992'), null)
  assert.equal(amountToCents('90071992547409.91'), Number.MAX_SAFE_INTEGER)
  assert.equal(amountToCents('90071992547409.915'), null)
  assert.ok(exportEntriesCsv([{ category: 'income', amount: '90071992547409.91' }]).includes('"90071992547409.91"'))
  assert.equal(amountToCents('0.009'), 1)
  assert.equal(csvCell('\u0000  =SUM(A1)'), '"\'\u0000  =SUM(A1)"')
})

const source = readFileSync(new URL('../components/FarmBookkeeping.vue', import.meta.url), 'utf8')
const descriptor = parse(source).descriptor
const script = descriptor.scriptSetup.content.replace(/^import .*$/gm, '')
const createState = new Function('Vue', 'helpers', 'defineProps', 'defineEmits', 'document', 'URL', 'setTimeout', `
  const { computed, ref, watch } = Vue
  const { amountToCents, entryMonth, filterEntries, summarizeEntries, monthlySummary, exportEntriesCsv } = helpers
  ${script}
  return { month, search, category, tab, entries, totals, monthly, chartMonths, cashScale, exportCsv, exportMessage, exportError }
`)
function harness(fail = '') {
  const props = Vue.reactive({ records: records.map(record => ({ ...record })), userId: 'a', deleting: '' })
  const calls = { clicks: 0, removed: 0, revoked: [], blobs: [] }
  const link = { click() { if (fail === 'click') throw Error('blocked'); calls.clicks++ }, remove() { calls.removed++ } }
  const document = { createElement: () => link, body: { appendChild() {} } }
  const URL = { createObjectURL(blob) { if (fail === 'url') throw Error('unsupported'); calls.blobs.push(blob); return 'blob:test' }, revokeObjectURL(url) { calls.revoked.push(url) } }
  const scope = Vue.effectScope()
  const state = scope.run(() => createState(Vue, helpers, () => props, () => () => {}, document, URL, callback => callback()))
  return { props, state, calls, link, stop: () => scope.stop() }
}
test('bookkeeping SFC and actual template compile', () => {
  const compiled = compileScript(descriptor, { id: 'bookkeeping' })
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'FarmBookkeeping.vue', id: 'bookkeeping', compilerOptions: { bindingMetadata: compiled.bindings } }).errors, [])
  assert.deepEqual(compileStyle({ source: descriptor.styles[0].content, id: 'bookkeeping', scoped: true }).errors, [])
  assert.match(source, /<template v-else><FbButton[^>]+Edit/)
  assert.match(source, /v-if="entry.sourceId"/)
  assert.match(source, /<details class="disclaimer">/)
})
test('cashbook proportions use actual period cents and never invent a nonzero empty bar', () => {
  const h = harness()
  assert.equal(h.state.cashScale.value, 1028)
  h.state.search.value = 'not found'
  assert.equal(h.state.cashScale.value, 1028)
  h.state.month.value = '2026-09'
  assert.equal(h.state.cashScale.value, 10)
  assert.equal(h.state.totals.value.incomeCents, 0)
  assert.equal(h.state.totals.value.expenseCents / h.state.cashScale.value, 1)
  h.props.records = [{ id: 'bad', category: 'income', amount: 'bad', createdAt: '2026-09-01' }]
  assert.equal(h.state.cashScale.value, 1)
  assert.equal(h.state.totals.value.incomeCents, 0)
  assert.equal(h.state.totals.value.invalidCount, 1)
  h.props.records = []
  assert.equal(h.state.cashScale.value, 1)
  assert.equal(h.state.totals.value.netCents, 0)
  h.stop()
})
test('cashbook presents labeled money directions, responsive spread, focus and reduced motion', () => {
  assert.match(source, /Receive money/)
  assert.match(source, /Spend money/)
  assert.match(source, /class="cashbook-spread"/)
  assert.match(source, /Money in/)
  assert.match(source, /Money out/)
  assert.match(source, /class="bar-label">In/)
  assert.match(source, /class="bar-label">Out/)
  assert.match(source, /min-height:44px/)
  assert.match(source, /max-width:380px/)
  assert.match(source, /focus-visible/)
  assert.match(source, /prefers-reduced-motion:reduce/)
})
test('actual Vue filters and monthly chart follow data without changing source or period totals', () => {
  const h = harness()
  h.state.month.value = '2026-10'
  h.state.category.value = 'income'
  h.state.search.value = 'market'
  assert.deepEqual(h.state.entries.value.map(row => row.id), ['1'])
  assert.equal(h.state.totals.value.incomeCents, 1028)
  assert.equal(h.state.monthly.value[0].incomeCents, 1008)
  h.state.search.value = ''; h.state.category.value = ''; h.state.month.value = ''
  assert.deepEqual(h.state.chartMonths.value.map(row => row.month), ['2026-09', '2026-10'])
  assert.deepEqual(h.props.records.map(row => row.id), ['1', '2', '3', '4'])
  h.stop()
})
test('account identity synchronously clears private filters, report selection and export feedback', () => {
  const h = harness()
  h.state.month.value = '2026-10'; h.state.search.value = 'secret'; h.state.category.value = 'expense'
  h.state.tab.value = 'reports'; h.state.exportMessage.value = 'private'; h.state.exportError.value = 'private'
  h.props.userId = 'b'
  for (const key of ['month', 'search', 'category', 'exportMessage', 'exportError']) assert.equal(h.state[key].value, '')
  assert.equal(h.state.tab.value, 'ledger')
  h.stop()
})
test('native CSV click contains filtered actual bytes and reports request not confirmed saved file', async () => {
  const h = harness()
  h.state.search.value = 'market'
  h.state.exportCsv()
  assert.equal(h.calls.clicks, 1)
  assert.equal(h.calls.removed, 1)
  assert.deepEqual(h.calls.revoked, ['blob:test'])
  assert.equal(h.link.download, 'farm-bookkeeping-all-time.csv')
  const csv = await h.calls.blobs[0].text()
  assert.ok(csv.includes('Egg sales'))
  assert.ok(csv.includes('10.08'))
  assert.ok(!csv.includes('Feed'))
  assert.match(h.state.exportMessage.value, /download requested/)
  assert.equal(h.state.exportError.value, '')
  h.stop()
})
test('unsupported export, click failures and empty results are honest and clean up resources', () => {
  for (const failure of ['url', 'click']) {
    const h = harness(failure)
    h.state.exportMessage.value = 'old success'
    h.state.exportCsv()
    assert.equal(h.state.exportMessage.value, '')
    assert.match(h.state.exportError.value, /Could not start/)
    if (failure === 'click') {
      assert.equal(h.calls.removed, 1)
      assert.deepEqual(h.calls.revoked, ['blob:test'])
    }
    h.stop()
  }
  const h = harness()
  h.state.search.value = 'nothing matching'
  h.state.exportCsv()
  assert.match(h.state.exportError.value, /No matching/)
  assert.equal(h.calls.clicks, 0)
  h.stop()
})
