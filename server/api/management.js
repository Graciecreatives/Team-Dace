import { defineEventHandler, getHeader, getQuery, setHeader } from 'h3'
import { authenticated, mutationGuard, body } from './[...].js'
import { store } from '../utils/store.js'
import { accessibleFarms, workspaceContext, validateCommand, commandFingerprint, fail } from '../utils/farm-workspace.js'
import { changeProduction, planningView } from '../utils/farm-production.js'
import { changeOperations, operationsView, acceptInvitation } from '../utils/farm-operations.js'
import { changeBusiness, businessView } from '../utils/farm-business.js'

export function managementView(data, ctx) {
  const farm = accessibleFarms(data, ctx.user).find(row => row.id === ctx.farmId)
  const finance = ['owner', 'manager'].includes(ctx.role)
  return {
    farms: accessibleFarms(data, ctx.user), farm,
    currentUserId: ctx.user.id,
    planning: planningView(data, ctx), operations: operationsView(data, ctx), business: businessView(data, ctx),
    inventory: data.inventory.filter(row => row.userId === ctx.farmId).map(row => ({ id: row.id, name: row.name, quantity: row.quantity, unit: row.unit, threshold: row.threshold, expiresOn: row.expiresOn })),
    enterprises: data.enterprises.filter(row => row.userId === ctx.farmId).map(row => ({ id: row.id, name: row.name, kind: row.kind, quantity: row.quantity, unit: row.unit })),
    products: finance ? data.marketplaceProducts.filter(row => row.ownerId === ctx.farmId).map(row => ({ id: row.id, name: row.name, price: row.price, currency: row.currency })) : [],
  }
}
export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store')
  if (event.method === 'GET') {
    const query = getQuery(event)
    return store(data => {
      const user = authenticated(data, event)
      return managementView(data, workspaceContext(data, user, query.farmId === undefined ? user.id : query.farmId))
    })
  }
  if (event.method !== 'POST') fail(405, 'Method not allowed')
  mutationGuard(event)
  if (!getHeader(event, 'origin')) fail(403, 'Origin required')
  await store(data => authenticated(data, event))
  const input = await body(event)
  validateCommand(input)
  const digest = commandFingerprint(input)
  return store(data => {
    const user = authenticated(data, event)
    let ctx, result
    if (input.action === 'team.accept') {
      // A consumed invite can be retried only by the same actor and identical command.
      const prior = (data.farmWorkspaces || []).find(w => w.commands.some(c => c.id === input.commandId && c.actorId === user.id))
      if (prior) ctx = workspaceContext(data, user, prior.id, true)
      else {
        const accepted = acceptInvitation(data, user, input)
        ctx = workspaceContext(data, user, accepted.farmId, true)
        result = accepted
      }
    } else ctx = workspaceContext(data, user, input.farmId === undefined ? user.id : input.farmId, true)
    const previous = ctx.workspace.commands.find(row => row.id === input.commandId)
    if (previous) {
      if (previous.actorId !== user.id || previous.digest !== digest) fail(409, 'Command ID already used for different content')
      return { ...managementView(data, ctx), lastCommandId: input.commandId, result: { alreadyApplied: true, action: input.action } }
    }
    if (ctx.workspace.commands.length >= 50000) fail(409, 'Workspace command limit reached. Contact support before continuing.')
    if (input.action === 'team.accept') { /* Membership already accepted above, atomically with this receipt. */ }
    else if (/^(plot|season|schedule|event)\./.test(input.action)) result = changeProduction(data, ctx, input)
    else if (/^(team|tasks)\./.test(input.action)) result = changeOperations(data, ctx, input)
    else if (/^(harvest|orders|expense)\./.test(input.action)) result = changeBusiness(data, ctx, input)
    else fail(400, 'Unknown management action')
    ctx.workspace.commands.push({ id: input.commandId, actorId: user.id, digest, action: input.action, createdAt: new Date().toISOString() })
    return { ...managementView(data, ctx), lastCommandId: input.commandId, result: { ...result, action: input.action } }
  }, true)
})
