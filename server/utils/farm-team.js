import { randomUUID } from 'node:crypto'
import { createError } from 'h3'

const fail = (statusCode, statusMessage) => { throw createError({ statusCode, statusMessage }) }
export const TEAM_LIMIT = 100
export const TEAM_STATUSES = ['active', 'seasonal', 'inactive']
function text(value, label, max, required = false) {
  if (value === undefined && !required) return ''
  if (typeof value !== 'string' || value.length > max || /[<>\u0000-\u001f\u007f]/.test(value) || (required && !value.trim())) fail(400, `Invalid ${label}`)
  return value.trim()
}
export function memberFields(input) {
  if (!TEAM_STATUSES.includes(input.status)) fail(400, 'Choose a valid roster status')
  return { name: text(input.name, 'name', 100, true), contact: text(input.contact, 'contact', 150), role: text(input.role, 'role', 80, true), responsibilities: text(input.responsibilities, 'responsibilities', 600), status: input.status }
}
// Stored on the authenticated user, like the community profile. No account IDs,
// permissions, invitations or email delivery are created by this roster.
export function roster(user) {
  if (user.teamRoster === undefined) return []
  if (!Array.isArray(user.teamRoster)) fail(500, 'Roster data is unavailable')
  return user.teamRoster.map(({ id, name, contact, role, responsibilities, status, createdAt, updatedAt }) => ({ id, name, contact, role, responsibilities, status, createdAt, updatedAt }))
}
export function changeRoster(user, input) {
  const members = roster(user)
  if (!['add', 'edit', 'remove'].includes(input.action)) fail(400, 'Unknown roster action')
  let index = -1
  if (input.action !== 'add') {
    const id = text(input.id, 'member ID', 36, true)
    index = members.findIndex(member => member.id === id)
    if (index < 0) fail(404, 'Roster member not found')
  }
  if (input.action === 'remove') members.splice(index, 1)
  else {
    const fields = memberFields(input)
    const now = new Date().toISOString()
    if (input.action === 'add') {
      if (members.length >= TEAM_LIMIT) fail(409, 'Roster limit of 100 members reached')
      members.push({ id: randomUUID(), ...fields, createdAt: now, updatedAt: now })
    } else members[index] = { ...members[index], ...fields, updatedAt: now }
  }
  user.teamRoster = members
  return { members: roster(user) }
}
