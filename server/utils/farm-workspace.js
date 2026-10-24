import { randomUUID, createHash } from 'node:crypto'
import { createError } from 'h3'

export const fail = (statusCode, statusMessage) => { throw createError({ statusCode, statusMessage }) }
export function text(value, label, max = 200, optional = false) {
  if ((value === undefined || value === '') && optional) return ''
  if (typeof value !== 'string' || value.length > max || !value.trim() || /[<>\u0000-\u001f\u007f]/.test(value)) fail(400, `Invalid ${label}`)
  return value.trim()
}
export function number(value, label, { min = 0, max = 1e9, integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) fail(400, `Invalid ${label}`)
  return value
}
export function date(value, label, optional = false) {
  if ((value === undefined || value === '') && optional) return ''
  if (typeof value !== 'string' || value.startsWith('0000') || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail(400, `Invalid ${label}`)
  return value
}
const permissions = {
  owner: ['planning.write', 'event.create', 'team.manage', 'tasks.manage', 'tasks.complete', 'stock.consume', 'business.write', 'business.read'],
  manager: ['planning.write', 'event.create', 'tasks.manage', 'tasks.complete', 'stock.consume', 'business.write', 'business.read'],
  worker: ['event.create', 'tasks.complete', 'stock.consume'], viewer: [],
}
export function need(ctx, permission) { if (!permissions[ctx.role]?.includes(permission)) fail(403, 'Your farm role does not allow this action') }
export function emptyWorkspace(ownerId) {
  return { id: ownerId, userId: ownerId, ...Object.fromEntries(['plots', 'seasons', 'events', 'tasks', 'members', 'invitations', 'orders', 'movements', 'commands'].map(key => [key, []])) }
}
export function workspaceContext(data, user, farmId = user.id, create = false) {
  if (typeof farmId !== 'string' || !data.users.some(row => row.id === farmId)) fail(404, 'Farm workspace not found')
  data.farmWorkspaces ||= []
  let workspace = data.farmWorkspaces.find(row => row.id === farmId)
  let role = farmId === user.id ? 'owner' : workspace?.members.find(row => row.userId === user.id && (row.status === undefined || row.status === 'active'))?.role
  if (!role || !permissions[role]) fail(403, 'You do not have access to this farm')
  if (!workspace) {
    workspace = emptyWorkspace(farmId)
    if (create) data.farmWorkspaces.push(workspace)
  }
  for (const key of ['plots', 'seasons', 'events', 'tasks', 'members', 'invitations', 'orders', 'movements', 'commands']) if (!Array.isArray(workspace[key])) fail(503, 'Farm workspace data unavailable')
  return { user, farmId, role, workspace }
}
export function accessibleFarms(data, user) {
  const ids = new Set([user.id, ...(data.farmWorkspaces || []).filter(w => w.members.some(m => m.userId === user.id && (m.status === undefined || m.status === 'active'))).map(w => w.id)])
  return data.users.filter(row => ids.has(row.id)).map(row => ({ id: row.id, name: row.farmName || `${row.name}'s farm`, role: workspaceContext(data, user, row.id).role }))
}
export function findOwnedStock(data, ctx, id) {
  const stock = data.inventory.find(row => row.id === id && row.userId === ctx.farmId)
  if (!stock) fail(404, 'Inventory item not found in this farm')
  if (typeof stock.quantity !== 'number' || !Number.isFinite(stock.quantity) || stock.quantity < 0) fail(409, 'Inventory quantity needs correction before use')
  return stock
}
export function record(data, ctx, fields) {
  if (data.records.filter(row => row.userId === ctx.farmId).length >= 20000) fail(409, 'Farm record limit reached')
  const entry = { ...fields, id: randomUUID(), userId: ctx.farmId, actorId: ctx.user.id, createdAt: new Date().toISOString() }
  data.records.push(entry)
  return entry
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}
export function commandFingerprint(input) { return createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex') }
export function validateCommand(input) {
  if (typeof input.commandId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.commandId)) fail(400, 'A unique command ID is required')
  text(input.action, 'action', 60)
}
