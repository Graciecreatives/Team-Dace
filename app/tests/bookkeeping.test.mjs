import test from 'node:test'
import assert from 'node:assert/strict'
import { amountToCents, filterEntries, summarizeEntries, monthlySummary, csvCell, exportEntriesCsv } from '../utils/bookkeeping.js'
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
