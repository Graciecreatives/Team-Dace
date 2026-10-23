import { randomUUID } from 'node:crypto'
import { defineEventHandler, setHeader } from 'h3'
import { authenticated, mutationGuard, body, fail } from '../[...].js'
import { store } from '../../utils/store.js'
import { coordinates, distanceKm } from '../../utils/location.js'
const requestsPerMinute = new Map()
const text = (value, max) => { if (typeof value !== 'string' || value.length > max || /[<>\u0000-\u001f]/.test(value)) fail(400, 'Use short plain text'); return value.trim() }
const blocked = (a, b) => a.community?.blocked?.includes(b.id) || b.community?.blocked?.includes(a.id)
const card = user => ({ id: user.id, displayName: user.community.displayName, farmType: user.farmType, bio: user.community.bio, latitude: user.community.latitude, longitude: user.community.longitude })
function overview(data, user) {
  const requests = (data.communityRequests || []).filter(r => r.from === user.id || r.to === user.id).flatMap(r => {
    const other = data.users.find(u => u.id === (r.from === user.id ? r.to : r.from))
    if (!other || blocked(user, other)) return []
    return [{ id: r.id, farmerId: other.id, status: r.status, incoming: r.to === user.id, farmer: other.community?.visible ? other.community.displayName : 'Farmer unavailable', contact: r.status === 'accepted' && other.community?.visible ? other.community.contact || '' : '' }]
  })
  const own = user.community || { visible: false }
  return { profile: { visible: own.visible === true, displayName: own.displayName || '', bio: own.bio || '', contact: own.contact || '', latitude: own.latitude ?? null, longitude: own.longitude ?? null }, requests }
}
export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store')
  if (event.method === 'GET') return store(data => overview(data, authenticated(data, event)))
  mutationGuard(event)
  if (event.method !== 'POST') fail(405, 'Method not allowed')
  const sessionUser = await store(data => authenticated(data, event))
  const now = Date.now()
  for (const [id, limit] of requestsPerMinute) if (limit.until <= now) requestsPerMinute.delete(id)
  if (!requestsPerMinute.has(sessionUser.id) && requestsPerMinute.size >= 10000) fail(429, 'Community temporarily busy')
  const limit = requestsPerMinute.get(sessionUser.id) || { count: 0, until: now + 60000 }
  if (++limit.count > 60) fail(429, 'Please wait before making more community requests')
  requestsPerMinute.set(sessionUser.id, limit)
  const input = await body(event)
  return store(data => {
    const user = authenticated(data, event)
    if (input.action === 'search') {
      let point
      try { point = coordinates(input) } catch (error) { fail(400, error.message) }
      const radius = input.radiusKm ?? 100
      if (typeof radius !== 'number' || !Number.isFinite(radius) || radius < 10 || radius > 200) fail(400, 'Choose a radius between 10 and 200 km')
      return { farmers: data.users.filter(other => other.id !== user.id && other.community?.visible === true && !blocked(user, other)).map(other => ({ ...card(other), distanceKm: distanceKm(point, other.community) })).filter(other => other.distanceKm <= radius).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 50), ...point }
    }
    if (input.action === 'publish') {
      let point
      try { point = coordinates(input) } catch (error) { fail(400, error.message) }
      if (input.consent !== true) fail(400, 'Location sharing consent is required')
      const displayName = text(input.displayName, 100)
      if (!displayName) fail(400, 'Choose a public farm name')
      user.community = { ...user.community, ...point, visible: true, displayName, bio: text(input.bio || '', 400), contact: text(input.contact || '', 150) }
    } else if (input.action === 'hide') {
      user.community = { blocked: user.community?.blocked || [], visible: false }
    } else if (input.action === 'request') {
      const other = data.users.find(u => u.id === input.targetId && u.community?.visible === true)
      if (!other || other.id === user.id || blocked(user, other)) fail(404, 'Farmer unavailable')
      if (!user.community?.visible) fail(400, 'Publish your own profile before connecting')
      data.communityRequests ||= []
      const exists = data.communityRequests.find(r => ((r.from === user.id && r.to === other.id) || (r.from === other.id && r.to === user.id)) && ['pending', 'accepted'].includes(r.status))
      if (!exists) {
        if (data.communityRequests.filter(r => r.from === user.id).length >= 100) fail(409, 'Connection request limit reached')
        data.communityRequests.push({ id: randomUUID(), from: user.id, to: other.id, status: 'pending', createdAt: new Date().toISOString() })
      }
    } else if (input.action === 'respond') {
      const request = (data.communityRequests || []).find(r => r.id === input.requestId && r.to === user.id)
      const other = request && data.users.find(u => u.id === request.from)
      if (!request || !other || blocked(user, other)) fail(404, 'Request unavailable')
      if (!['accepted', 'declined'].includes(input.status) || request.status !== 'pending') fail(400, 'Invalid response')
      request.status = input.status
    } else if (input.action === 'block') {
      if (input.targetId === user.id || !data.users.some(u => u.id === input.targetId)) fail(404, 'Farmer unavailable')
      user.community ||= { visible: false }
      user.community.blocked ||= []
      if (user.community.blocked.length >= 200) fail(409, 'Block limit reached')
      if (!user.community.blocked.includes(input.targetId)) user.community.blocked.push(input.targetId)
    } else fail(400, 'Unknown community action')
    return overview(data, user)
  }, input.action !== 'search')
})
