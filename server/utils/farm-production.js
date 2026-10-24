import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { need, text, number, date } from './farm-workspace.js'

const fail = (code, message) => { throw createError({ statusCode: code, statusMessage: message }) }
const limits = { plots: 500, seasons: 1000, events: 20000, schedule: 500 }
function bounded(rows, key) {
  if (rows.length >= limits[key]) fail(409, `${key} limit reached`)
}
function seasonFor(ctx, id) {
  const season = (ctx.workspace.seasons || []).find(row => row.id === text(id, 'season ID', 100))
  if (!season) fail(404, 'Season not found in this farm')
  return season
}
function withinSeason(value, season) {
  if (value < season.startsOn || value > season.endsOn) fail(400, 'Date must fall within the season')
  return value
}
export function planningView(data, ctx) {
  // Explicit projection keeps private workspace membership and command data out.
  return {
    plots: (ctx.workspace.plots || []).map(({ id, name, coordinates, areaHa, createdAt }) => ({ id, name, coordinates: coordinates.map(point => [...point]), areaHa, createdAt })),
    seasons: (ctx.workspace.seasons || []).map(({ id, name, kind, enterpriseId, plotId, startsOn, endsOn, createdAt, schedule }) => ({ id, name, kind, enterpriseId, plotId, startsOn, endsOn, createdAt, schedule: (schedule || []).map(({ id, title, date, createdAt }) => ({ id, title, date, createdAt })) })),
    events: (ctx.workspace.events || []).map(({ id, seasonId, type, date, quantity, unit, note, actorId, createdAt }) => ({ id, seasonId, type, date, quantity, unit, note, actorId, createdAt }))
  }
}
export function changeProduction(data, ctx, input) {
  if (!input || typeof input !== 'object') fail(400, 'Invalid production command')
  const action = input.action
  if (!['plot.create', 'season.create', 'schedule.create', 'event.create'].includes(action)) fail(400, 'Unknown production action')
  need(ctx, action === 'event.create' ? 'event.create' : 'planning.write')
  const ws = ctx.workspace
  const stamp = { id: randomUUID(), createdAt: new Date().toISOString() }
  if (action === 'plot.create') {
    bounded(ws.plots || [], 'plots')
    const name = text(input.name, 'plot name', 150)
    if (!Array.isArray(input.coordinates) || input.coordinates.length < 3 || input.coordinates.length > 100) fail(400, 'Boundary requires 3 to 100 coordinate pairs')
    const coordinates = input.coordinates.map(point => {
      if (!Array.isArray(point) || point.length !== 2) fail(400, 'Each boundary point must be [latitude, longitude]')
      return [number(point[0], 'latitude', { min: -90, max: 90 }), number(point[1], 'longitude', { min: -180, max: 180 })]
    })
    if (new Set(coordinates.map(point => point.join(','))).size < 3) fail(400, 'Boundary requires three distinct points')
    // Allow an explicitly closed ring, but reject repeated vertices or crossing edges.
    const ring = coordinates.length > 3 && coordinates[0].every((value, i) => value === coordinates.at(-1)[i]) ? coordinates.slice(0, -1) : coordinates
    if (new Set(ring.map(point => point.join(','))).size !== ring.length) fail(400, 'Boundary points must be distinct')
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    const between = (a, b, c) => Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1])
    for (let i = 0; i < ring.length; i++) for (let j = i + 1; j < ring.length; j++) {
      if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue
      const a = ring[i], b = ring[(i + 1) % ring.length], c = ring[j], d = ring[(j + 1) % ring.length]
      const ac = cross(a, b, c), ad = cross(a, b, d), ca = cross(c, d, a), cb = cross(c, d, b)
      if ((ac * ad < 0 && ca * cb < 0) || (ac === 0 && between(a, b, c)) || (ad === 0 && between(a, b, d)) || (ca === 0 && between(c, d, a)) || (cb === 0 && between(c, d, b))) fail(400, 'Boundary edges must not cross')
    }
    // Reject a line rather than saving an unusable polygon. Relative coordinates avoid cancellation.
    const [lat, lng] = coordinates[0]
    const area = coordinates.reduce((sum, point, i) => { const next = coordinates[(i + 1) % coordinates.length]; return sum + (point[0] - lat) * (next[1] - lng) - (next[0] - lat) * (point[1] - lng) }, 0)
    if (Math.abs(area) < 1e-14) fail(400, 'Boundary must enclose an area')
    const areaHa = input.areaHa === undefined ? undefined : number(input.areaHa, 'area hectares', { min: Number.MIN_VALUE, max: 1e9 })
    const plot = { ...stamp, name, coordinates, ...(areaHa === undefined ? {} : { areaHa }) }
    ;(ws.plots ||= []).push(plot)
    return { plotId: plot.id }
  }
  if (action === 'season.create') {
    bounded(ws.seasons || [], 'seasons')
    const name = text(input.name, 'season name', 150)
    if (!['crops', 'livestock'].includes(input.kind)) fail(400, 'Choose crops or livestock')
    const startsOn = date(input.startsOn, 'start date')
    const endsOn = date(input.endsOn, 'end date')
    if (endsOn < startsOn) fail(400, 'Season end must not precede its start')
    const enterpriseId = text(input.enterpriseId, 'enterprise ID', 100, true) || undefined
    const plotId = text(input.plotId, 'plot ID', 100, true) || undefined
    if (enterpriseId && !(data.enterprises || []).some(row => row.id === enterpriseId && row.userId === ctx.farmId)) fail(404, 'Enterprise not found in this farm')
    if (plotId && !(ws.plots || []).some(row => row.id === plotId)) fail(404, 'Plot not found in this farm')
    const season = { ...stamp, name, kind: input.kind, startsOn, endsOn, enterpriseId, plotId, schedule: [] }
    ;(ws.seasons ||= []).push(season)
    return { seasonId: season.id }
  }
  const season = seasonFor(ctx, input.seasonId)
  const eventDate = withinSeason(date(input.date, 'date'), season)
  if (action === 'schedule.create') {
    bounded(season.schedule || [], 'schedule')
    const entry = { ...stamp, title: text(input.title, 'schedule title', 200), date: eventDate }
    ;(season.schedule ||= []).push(entry)
    return { scheduleId: entry.id }
  }
  bounded(ws.events || [], 'events')
  if (!['health', 'breeding', 'feeding', 'production', 'observation', 'planting'].includes(input.type)) fail(400, 'Invalid production event type')
  const quantity = input.quantity === undefined ? undefined : number(input.quantity, 'quantity', { min: Number.MIN_VALUE, max: 1e9 })
  const unit = text(input.unit, 'unit', 60, true) || undefined
  const note = text(input.note, 'note', 4000, true)
  if (quantity !== undefined && !unit) fail(400, 'A quantity requires a unit')
  const event = { ...stamp, seasonId: season.id, type: input.type, date: eventDate, quantity, unit, note, actorId: ctx.user.id }
  ;(ws.events ||= []).push(event)
  return { eventId: event.id }
}
