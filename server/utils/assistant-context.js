import { createError } from 'h3'
import { workspaceContext, need } from './farm-workspace.js'

const fail = message => { throw createError({ statusCode: 400, statusMessage: message }) }
export function validateContextFlags(input) {
  const allowed = new Set(['task', 'messages', 'image', 'includeFarmContext', 'includeFinancialContext', 'farmId'])
  if (Object.keys(input).some(key => !allowed.has(key))) fail('Unsupported assistant request field')
  for (const key of ['includeFarmContext', 'includeFinancialContext']) {
    if (input[key] !== undefined && typeof input[key] !== 'boolean') fail(`Invalid ${key}`)
  }
  if (input.includeFinancialContext === true) fail('Financial context is not supported')
  for (const key of ['context', 'farmContext', 'serverContext', 'includePrivateNotes', 'includeNotes', 'workspaceId', 'farmIds']) {
    if (Object.hasOwn(input, key)) fail('Client context and shared selectors are not supported')
  }
  if (input.farmId !== undefined && (typeof input.farmId !== 'string' || !input.farmId || input.farmId.length > 100)) fail('Invalid farmId')
}
const fields = ['farmName', 'farmType', 'location', 'mainEnterprises', 'preferredLanguage']
export const assistantProfile = user => Object.fromEntries(fields.map(key => [key, typeof user[key] === 'string' ? user[key].slice(0, 300) : '']))
const project = (row, keys) => Object.fromEntries(keys.flatMap(key => {
  const value = row[key]
  if (typeof value === 'string') return [[key, value.slice(0, key === 'id' ? 100 : 200)]]
  if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return [[key, value]]
  return []
}))
const recent = rows => rows.slice().sort((a, b) => String(b.createdAt || b.date || b.dueOn || b.startsOn || '').localeCompare(String(a.createdAt || a.date || a.dueOn || a.startsOn || ''))).slice(0, 12)
// Must run inside the store callback immediately after authenticating this request.
// Returns only detached projections, never user objects or workspace references.
export function buildAssistantContext(data, user, input) {
  validateContextFlags(input)
  if (input.farmId !== undefined && input.farmId !== user.id) throw createError({ statusCode: 403, statusMessage: 'Only your own farm context is supported' })
  const profile = assistantProfile(user)
  if (!input.includeFarmContext) return { profile, snapshot: null, contextUsed: { included: false, counts: {} } }
  const ctx = workspaceContext(data, user, user.id)
  need(ctx, 'planning.write')
  const own = key => (data[key] || []).filter(row => row.userId === user.id)
  const specs = {
    enterprises: [own('enterprises'), ['id', 'name', 'kind', 'quantity', 'unit', 'startedOn']],
    inventory: [own('inventory'), ['id', 'name', 'quantity', 'unit', 'threshold', 'expiresOn']],
    reminders: [own('reminders'), ['id', 'title', 'date', 'completed']],
    records: [own('records').filter(row => row.category === 'activity' && (row.amount === null || row.amount === undefined)), ['id', 'title', 'category', 'createdAt']],
    seasons: [ctx.workspace.seasons, ['id', 'name', 'kind', 'startsOn', 'endsOn']],
    tasks: [ctx.workspace.tasks, ['id', 'title', 'dueOn', 'completed']],
    events: [ctx.workspace.events, ['id', 'type', 'date', 'quantity', 'unit']]
  }
  const snapshot = Object.fromEntries(Object.entries(specs).map(([key, [rows, keys]]) => [key, recent(rows).map(row => project(row, keys))]))
  return { profile, snapshot, contextUsed: { included: true, counts: Object.fromEntries(Object.entries(snapshot).map(([key, rows]) => [key, rows.length])) } }
}
