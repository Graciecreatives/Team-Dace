// Civil dates stay civil: never parse a reminder's YYYY-MM-DD as a UTC instant.
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function parseDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(12, 0, 0, 0)
  return localDay(date) === value ? date : null
}
export function displayDay(value) {
  const date = parseDay(value)
  return date ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date'
}
export function shiftDay(value, amount) {
  const date = parseDay(value)
  if (!date) return ''
  date.setDate(date.getDate() + amount)
  return localDay(date)
}
export function shiftMonth(value, amount) {
  const date = parseDay(`${value}-01`)
  if (!date) return ''
  date.setMonth(date.getMonth() + amount)
  return localDay(date).slice(0, 7)
}
export function monthGrid(month) {
  const first = parseDay(`${month}-01`)
  if (!first) return []
  const start = shiftDay(localDay(first), -first.getDay())
  return Array.from({ length: 42 }, (_, index) => {
    const date = shiftDay(start, index)
    return { date, day: Number(date.slice(8)), inMonth: date.startsWith(month) }
  })
}
export function recordDay(record) {
  if (parseDay(record.date)) return record.date
  const date = new Date(record.createdAt)
  return Number.isNaN(date.getTime()) ? '' : localDay(date)
}
export function filterRecords(records = [], { search = '', category = '', from = '', to = '' } = {}) {
  const query = search.trim().toLocaleLowerCase()
  return records.filter(row => (!category || row.category === category) && (!from || recordDay(row) >= from) && (!to || (recordDay(row) && recordDay(row) <= to)) && (!query || `${row.title || ''} ${row.note || ''} ${row.category || ''}`.toLocaleLowerCase().includes(query))).slice().sort((a, b) => recordDay(b).localeCompare(recordDay(a)))
}
export function reminderCounts(reminders = [], today = localDay()) {
  return { open: reminders.filter(row => !row.completed).length, completed: reminders.filter(row => row.completed).length, overdue: reminders.filter(row => !row.completed && parseDay(row.date) && row.date < today).length, today: reminders.filter(row => row.date === today).length }
}
export function filterReminders(reminders = [], { search = '', status = 'all', date = '' } = {}, today = localDay()) {
  const query = search.trim().toLocaleLowerCase()
  return reminders.filter(row => (!query || `${row.title || ''} ${row.note || ''}`.toLocaleLowerCase().includes(query)) && (!date || row.date === date) && (status === 'all' || (status === 'open' && !row.completed) || (status === 'completed' && row.completed) || (status === 'overdue' && !row.completed && parseDay(row.date) && row.date < today) || (status === 'today' && row.date === today))).slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
}
