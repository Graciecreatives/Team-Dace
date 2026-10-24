// Amounts are stored as non-negative cash values. Round each entry before summing.
export function amountToCents(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const text = String(value).trim()
  if (!/^\+?\d+(?:\.\d*)?$/.test(text)) return null
  const [whole, fraction = ''] = text.replace(/^\+/, '').split('.')
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2)) + (Number(fraction[2] || 0) >= 5 ? 1 : 0)
  return Number.isSafeInteger(cents) ? cents : null
}

export function isCashEntry(record) {
  return ['income', 'expense'].includes(record?.category)
}

// Use UTC consistently so a saved instant never changes month across devices.
export function entryMonth(record) {
  const date = new Date(record?.createdAt)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 7)
}

export function filterEntries(records = [], { month = '', category = '', search = '' } = {}) {
  const query = search.trim().toLocaleLowerCase()
  return records.filter(isCashEntry).filter(record =>
    (!month || entryMonth(record) === month) &&
    (!category || record.category === category) &&
    (!query || `${record.title || ''} ${record.note || ''}`.toLocaleLowerCase().includes(query))
  ).sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
}

export function summarizeEntries(records = []) {
  let incomeCents = 0
  let expenseCents = 0
  let invalidCount = 0
  for (const record of records.filter(isCashEntry)) {
    const cents = amountToCents(record.amount)
    if (cents === null) { invalidCount++; continue }
    if (record.category === 'income') incomeCents += cents
    else expenseCents += cents
  }
  return { incomeCents, expenseCents, netCents: incomeCents - expenseCents, invalidCount }
}

export function monthlySummary(records = []) {
  const groups = new Map()
  for (const record of records.filter(isCashEntry)) {
    const month = entryMonth(record)
    if (!month) continue
    if (!groups.has(month)) groups.set(month, [])
    groups.get(month).push(record)
  }
  return [...groups].sort(([a], [b]) => b.localeCompare(a)).map(([month, entries]) => ({ month, ...summarizeEntries(entries) }))
}

export function csvCell(value) {
  let text = String(value ?? '')
  // Spreadsheets may ignore leading whitespace before interpreting a formula.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

export function exportEntriesCsv(records = []) {
  const rows = [['Date (UTC)', 'Title', 'Category', 'Amount (NGN)', 'Note']]
  for (const record of records.filter(isCashEntry)) {
    const date = new Date(record.createdAt)
    const cents = amountToCents(record.amount)
    rows.push([Number.isNaN(date.getTime()) ? '' : date.toISOString(), record.title, record.category, cents === null ? '' : (cents / 100).toFixed(2), record.note])
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n')
}
