import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { createError } from 'h3'
import { need, text, number, date, findOwnedStock } from './farm-workspace.js'

const fail = (code, message) => { throw createError({ statusCode: code, statusMessage: message }) }
const hash = token => createHash('sha256').update(token).digest('hex')
const cap = (rows, limit = 5000) => { if (rows.length >= limit) fail(409, 'Farm collection limit reached') }
const active = member => member.status === undefined || member.status === 'active'
const memberId = member => member.userId
const memberOf = (workspace, id) => id === workspace.userId || id === workspace.id || workspace.members.some(member => memberId(member) === id && active(member))

export function acceptInvitation(data, user, input) {
  const token = text(input.token, 'invitation token', 64)
  if (!/^[a-f0-9]{64}$/.test(token)) fail(400, 'Invalid invitation token')
  const digest = hash(token)
  for (const workspace of data.farmWorkspaces || []) {
    const invitation = workspace.invitations.find(row => row.tokenHash === digest)
    if (!invitation) continue
    if (invitation.acceptedAt || invitation.revokedAt || !Number.isFinite(Date.parse(invitation.expiresAt)) || Date.parse(invitation.expiresAt) <= Date.now()) fail(410, 'Invitation is no longer available')
    if (!user.email || user.email.toLowerCase() !== invitation.email.toLowerCase()) fail(403, 'Sign in with the invited email address')
    if (user.id === workspace.id || memberOf(workspace, user.id)) fail(409, 'Account already belongs to this farm')
    cap(workspace.members, 100)
    workspace.members.push({ userId: user.id, role: invitation.role, status: 'active', joinedAt: new Date().toISOString() })
    invitation.acceptedAt = new Date().toISOString()
    delete invitation.tokenHash
    return { farmId: workspace.id }
  }
  fail(404, 'Invitation not found')
}

export function operationsView(data, ctx) {
  const w = ctx.workspace
  return {
    members: [{ userId: ctx.farmId, role: 'owner', name: data.users?.find(u => u.id === ctx.farmId)?.name || 'Farm owner' }, ...w.members.filter(active).map(m => ({ userId: m.userId, role: m.role, name: data.users?.find(u => u.id === m.userId)?.name || 'Team member' }))],
    invitations: ctx.role === 'owner' ? w.invitations.map(({ id, email, role, expiresAt, acceptedAt, revokedAt }) => ({ id, email, role, expiresAt, acceptedAt, revokedAt })) : [],
    tasks: w.tasks.map(({ id, title, dueOn, assigneeId, seasonId, completed, completedAt, createdAt }) => ({ id, title, dueOn, assigneeId, seasonId, completed, completedAt, createdAt })),
    movements: w.movements.filter(m => m.type === 'consume').map(({ id, inventoryId, quantity, actorId, taskId, seasonId, createdAt }) => ({ id, inventoryId, quantity, actorId, taskId, seasonId, createdAt }))
  }
}

export function changeOperations(data, ctx, input) {
  const w = ctx.workspace
  const now = new Date().toISOString()
  if (input.action === 'team.invite') {
    need(ctx, 'team.manage')
    const email = text(input.email, 'email', 254).toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Invalid email')
    if (!['manager', 'worker', 'viewer'].includes(input.role)) fail(400, 'Invalid team role')
    cap(w.invitations, 500)
    const token = randomBytes(32).toString('hex')
    w.invitations.push({ id: randomUUID(), email, role: input.role, tokenHash: hash(token), createdAt: now, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() })
    return { token }
  }
  if (input.action === 'team.revoke') {
    need(ctx, 'team.manage')
    const invitation = w.invitations.find(row => row.id === text(input.id, 'invitation ID', 100))
    if (!invitation) fail(404, 'Invitation not found')
    if (invitation.acceptedAt) fail(409, 'Accepted invitations cannot be revoked. Remove the member instead.')
    invitation.revokedAt ||= now
    delete invitation.tokenHash
    return { invitationId: invitation.id }
  }
  if (input.action === 'team.remove') {
    need(ctx, 'team.manage')
    const id = text(input.userId, 'member ID', 100)
    if (id === ctx.farmId) fail(400, 'Cannot remove farm owner')
    const member = w.members.find(m => m.userId === id && active(m))
    if (!member) fail(404, 'Member not found')
    member.status = 'revoked'
    member.revokedAt = now
    // Outstanding invitations for the removed account must not silently restore access.
    const email = data.users?.find(u => u.id === id)?.email
    for (const invitation of w.invitations) if (email && invitation.email.toLowerCase() === email.toLowerCase() && !invitation.acceptedAt) invitation.revokedAt = now
    return { removed: id }
  }
  if (input.action === 'tasks.create') {
    need(ctx, 'tasks.manage')
    cap(w.tasks)
    const title = text(input.title, 'task title', 200)
    const dueOn = date(input.dueOn, 'due date')
    const assigneeId = text(input.assigneeId, 'assignee', 100, true) || null
    const seasonId = text(input.seasonId, 'season', 100, true) || null
    if (assigneeId && (!memberOf(w, assigneeId) || !data.users?.some(u => u.id === assigneeId))) fail(400, 'Assignee must be an active farm account')
    if (assigneeId && w.members.some(m => m.userId === assigneeId && active(m) && m.role === 'viewer')) fail(400, 'Viewers cannot be assigned tasks')
    if (seasonId && !w.seasons.some(s => s.id === seasonId)) fail(404, 'Season not found')
    const task = { id: randomUUID(), title, dueOn, assigneeId, seasonId, completed: false, createdAt: now }
    w.tasks.push(task)
    return { taskId: task.id }
  }
  if (['tasks.complete', 'tasks.consume'].includes(input.action)) {
    need(ctx, input.action === 'tasks.complete' ? 'tasks.complete' : 'stock.consume')
    const id = text(input.id, 'task ID', 100)
    const task = w.tasks.find(t => t.id === id)
    if (!task) fail(404, 'Task not found')
    if (ctx.role === 'worker' && (task.assigneeId !== ctx.user.id || !memberOf(w, ctx.user.id))) fail(403, 'Only the assigned worker may perform this action')
    if (input.action === 'tasks.complete') {
      if (typeof input.completed !== 'boolean') fail(400, 'Completed must be boolean')
      task.completed = input.completed
      task.completedAt = input.completed ? now : null
      return { taskId: id }
    }
    if (task.completed) fail(409, 'Completed tasks cannot consume stock')
    cap(w.movements)
    const stock = findOwnedStock(data, ctx, text(input.inventoryId, 'inventory ID', 100))
    const quantity = number(input.quantity, 'quantity', { min: Number.MIN_VALUE })
    if (!/^\d+(?:\.\d{1,6})?$/.test(String(quantity))) fail(400, 'Quantity must have at most six decimals')
    if (!Number.isFinite(stock.quantity) || stock.quantity < quantity) fail(409, 'Insufficient inventory')
    const remaining = Number((stock.quantity - quantity).toFixed(6))
    if (remaining === stock.quantity) fail(400, 'Quantity is too small for this stock balance')
    const movementId = randomUUID()
    stock.quantity = remaining
    stock.updatedAt = now
    w.movements.push({ id: movementId, type: 'consume', inventoryId: stock.id, quantity, actorId: ctx.user.id, taskId: task.id, seasonId: task.seasonId, createdAt: now })
    return { taskId: id }
  }
  fail(400, 'Unknown operations action')
}
