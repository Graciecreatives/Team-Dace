import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { need, text, number, date, findOwnedStock, record } from './farm-workspace.js'

const fail = (statusCode, statusMessage) => { throw createError({ statusCode, statusMessage }) }
const limit = rows => { if (rows.length >= 10000) fail(409, 'Farm history limit reached') }
const safe = value => { if (!Number.isSafeInteger(value)) fail(400, 'Money exceeds safe limits'); return value }
// Parse decimal spelling rather than multiplying binary floats. Never silently accept a third decimal.
export function moneyMinor(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1e9 || !/^\d+(?:\.\d{1,2})?$/.test(String(value))) fail(400, 'Money must be positive with at most two decimals')
  const [whole, fraction = ''] = String(value).split('.')
  return safe(Number(whole) * 100 + Number(fraction.padEnd(2, '0')))
}
function quantity(value) {
  number(value, 'Quantity', { min: 0, max: 1e9 })
  if (value <= 0 || !/^\d+(?:\.\d{1,6})?$/.test(String(value))) fail(400, 'Quantity must be positive with at most six decimals')
  return value
}
function amountFor(q, minor) {
  const [whole, fraction = ''] = String(q).split('.')
  const scale = 10n ** BigInt(fraction.length)
  const numerator = BigInt(whole + fraction) * BigInt(minor)
  const rounded = (numerator + scale / 2n) / scale
  const result = safe(Number(rounded))
  if (result <= 0) fail(400, 'Order must total at least one minor currency unit')
  return result
}
function season(ctx, id) {
  const row = ctx.workspace.seasons.find(s => s.id === id)
  if (!row) fail(404, 'Season unavailable')
  return row
}
function touchStock(stock) {
  const previous = Date.parse(stock.updatedAt)
  stock.updatedAt = new Date(Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0)).toISOString()
}
function movement(ctx, fields) { return { id: randomUUID(), actorId: ctx.user.id, userId: ctx.farmId, createdAt: new Date().toISOString(), ...fields } }
function order(ctx, id) {
  const row = ctx.workspace.orders.find(o => o.id === id)
  if (!row) fail(404, 'Order unavailable')
  return row
}
export function changeBusiness(data, ctx, input) {
  need(ctx, 'business.write')
  const ws = ctx.workspace
  if (input.action === 'harvest.create') {
    season(ctx, input.seasonId)
    const stock = findOwnedStock(data, ctx, input.inventoryId)
    const q = quantity(input.quantity)
    const when = date(input.date, 'Harvest date')
    const note = text(input.note ?? '', 'Note', 2000, true)
    const next = stock.quantity + q
    if (!Number.isFinite(next) || next > 1e9) fail(400, 'Stock exceeds quantity limit')
    limit(ws.events); limit(ws.movements)
    const event = { id: randomUUID(), seasonId: input.seasonId, inventoryId: stock.id, type: 'harvest', date: when, quantity: q, unit: stock.unit, note, actorId: ctx.user.id, createdAt: new Date().toISOString() }
    const move = movement(ctx, { type: 'harvest', inventoryId: stock.id, quantity: q, seasonId: input.seasonId, eventId: event.id })
    stock.quantity = Number(next.toFixed(6))
    touchStock(stock)
    ws.events.push(event); ws.movements.push(move)
    return { id: event.id }
  }
  if (input.action === 'orders.create') {
    season(ctx, input.seasonId)
    const stock = findOwnedStock(data, ctx, input.inventoryId)
    const q = quantity(input.quantity), unitPriceMinor = moneyMinor(input.unitPrice)
    const customer = text(input.customer, 'Customer', 200)
    const when = date(input.date, 'Order date')
    if (input.productId !== undefined) {
      const product = (data.marketplaceProducts || []).find(p => p.id === input.productId && p.ownerId === ctx.farmId)
      if (!product) fail(404, 'Farm product unavailable')
      if (product.currency !== 'NGN') fail(400, 'Sales bookkeeping uses NGN. Choose an NGN storefront product')
    }
    const seller = data.users?.find(user => user.id === ctx.farmId)
    const sellerName = seller?.farmName || (seller?.name ? `${seller.name}'s farm` : 'Farm')
    const amountMinor = amountFor(q, unitPriceMinor)
    limit(ws.orders)
    const id = randomUUID()
    const row = { id, sellerName, currency: 'NGN', invoiceId: `INV-${id.toUpperCase()}`, seasonId: input.seasonId, inventoryId: stock.id, itemName: stock.name, unit: stock.unit, quantity: q, unitPriceMinor, amountMinor, customer, date: when, status: 'draft', delivery: { status: 'pending', reference: '' }, createdAt: new Date().toISOString(), ...(input.productId ? { productId: input.productId } : {}) }
    ws.orders.push(row)
    return { id }
  }
  if (input.action === 'orders.confirm') {
    const row = order(ctx, input.id)
    if (row.status === 'confirmed') return { id: row.id }
    if (row.status !== 'draft') fail(409, 'Only draft orders can be confirmed')
    const stock = findOwnedStock(data, ctx, row.inventoryId)
    if (!Number.isFinite(stock.quantity) || stock.quantity < row.quantity) fail(409, 'Insufficient stock')
    limit(ws.movements)
    const move = movement(ctx, { type: 'sale', inventoryId: stock.id, quantity: -row.quantity, seasonId: row.seasonId, orderId: row.id })
    // All validation precedes mutations. Root persists the enclosing command as one transaction.
    const entry = record(data, ctx, { title: `Cash sale ${row.invoiceId}`, category: 'income', amount: row.amountMinor / 100, note: row.customer, seasonId: row.seasonId, sourceId: row.id })
    if (entry) { entry.date = row.date; entry.amountMinor = row.amountMinor }
    stock.quantity = Number((stock.quantity - row.quantity).toFixed(6))
    touchStock(stock)
    ws.movements.push(move)
    row.status = 'confirmed'; row.confirmedAt = new Date().toISOString()
    return { id: row.id }
  }
  if (input.action === 'orders.deliver') {
    const row = order(ctx, input.id)
    if (row.status !== 'confirmed') fail(409, 'Confirm cash sale before delivery')
    if (!['pending', 'dispatched', 'delivered'].includes(input.status)) fail(400, 'Invalid delivery status')
    const reference = text(input.reference ?? '', 'Delivery reference', 200, true)
    row.delivery = { status: input.status, reference }
    return { id: row.id }
  }
  if (input.action === 'orders.cancel') {
    const row = order(ctx, input.id)
    if (row.status !== 'draft') fail(409, 'Only draft orders can be cancelled. Confirmed sale reversals are not supported')
    row.status = 'cancelled'
    return { id: row.id }
  }
  if (input.action === 'expense.create') {
    season(ctx, input.seasonId)
    const amountMinor = moneyMinor(input.amount)
    const title = text(input.title, 'Expense title', 200)
    const when = date(input.date, 'Expense date')
    const note = text(input.note ?? '', 'Note', 2000, true)
    const entry = record(data, ctx, { title, category: 'expense', amount: amountMinor / 100, note, seasonId: input.seasonId, sourceId: randomUUID() })
    if (entry) { entry.date = when; entry.amountMinor = amountMinor }
    return { id: entry?.id }
  }
  fail(400, 'Unknown business action')
}
export function businessView(data, ctx) {
  if (!['owner', 'manager'].includes(ctx.role)) return null
  const totals = () => ({ incomeMinor: 0, expenseMinor: 0, profitMinor: 0 })
  const seasons = ctx.workspace.seasons.map(s => ({ id: s.id, name: s.name, ...totals() }))
  const unallocated = { id: null, name: 'Unallocated', ...totals() }
  const overall = totals()
  for (const entry of data.records.filter(r => r.userId === ctx.farmId && ['income', 'expense'].includes(r.category))) {
    const minor = Number.isSafeInteger(entry.amountMinor) ? entry.amountMinor : Math.round(entry.amount * 100)
    if (!Number.isSafeInteger(minor)) continue
    const group = seasons.find(s => s.id === entry.seasonId) || unallocated
    const key = `${entry.category}Minor`
    group[key] = safe(group[key] + minor); overall[key] = safe(overall[key] + minor)
  }
  for (const group of [...seasons, unallocated, overall]) group.profitMinor = safe(group.incomeMinor - group.expenseMinor)
  return { orders: ctx.workspace.orders.map(o => ({ ...o, delivery: { ...o.delivery } })), reports: { currency: 'NGN', seasons, unallocated, overall } }
}
