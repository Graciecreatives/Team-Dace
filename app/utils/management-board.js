export function numericInput(value, optional = false, label = 'quantity') {
  if (value == null || (typeof value === 'string' && !value.trim())) {
    if (optional) return null
    throw new Error(`Enter ${label}. Zero is allowed.`)
  }
  if (!['string', 'number'].includes(typeof value) || (typeof value === 'string' && !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) throw new Error(`Enter a valid ${label}.`)
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 1e12) throw new Error(`${label} must be between 0 and 1,000,000,000,000.`)
  return number
}
export function stockStatus(item, date = new Date()) {
  const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return { low: typeof item.quantity === 'number' && typeof item.threshold === 'number' && item.quantity <= item.threshold, expired: Boolean(item.expiresOn && item.expiresOn < today) }
}
export function filterManagementRows(rows, { search = '', filter = 'all', sort = 'name', section = 'inventory' } = {}) {
  const query = search.trim().toLocaleLowerCase()
  return rows.filter(item => {
    const status = stockStatus(item)
    const match = filter === 'all' || (section === 'inventory' ? filter === 'low' ? status.low : filter === 'expired' ? status.expired : !status.low && !status.expired : (item.kind || item.status) === filter)
    return match && [item.name, item.title, item.notes, item.unit, item.summary].some(value => String(value || '').toLocaleLowerCase().includes(query))
  }).sort((a, b) => {
    if (sort === 'quantity') return (a.quantity ?? -1) - (b.quantity ?? -1) || String(a.name || a.title).localeCompare(String(b.name || b.title))
    if (sort === 'newest') return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
    return String(a.name || a.title).localeCompare(String(b.name || b.title))
  })
}
