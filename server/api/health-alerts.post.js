import { defineEventHandler, setHeader } from 'h3'
import { authenticated, mutationGuard, body, fail } from './[...].js'
import { store } from '../utils/store.js'
import { coordinates } from '../utils/location.js'
import { countryCode, healthBulletins } from '../utils/health-alerts.js'
const cache = new Map()
const attempts = new Map()
export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store')
  const user = await store(data => authenticated(data, event))
  mutationGuard(event)
  const input = await body(event)
  let code
  try { coordinates(input); code = countryCode(input.countryCode) } catch (error) { fail(400, error.message) }
  const now = Date.now()
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key)
  if (!attempts.has(user.id) && attempts.size >= 10000) fail(429, 'Health bulletin service temporarily busy')
  const bucket = attempts.get(user.id) || { count: 0, until: now + 60000 }
  attempts.set(user.id, bucket)
  if (++bucket.count > 10) fail(429, 'Please wait a minute before checking health bulletins again')
  // Coordinates are validated but never forwarded, cached, or interpreted as disease evidence.
  const key = `${user.id}:${code || 'global'}`
  for (const [key, value] of cache) if (now - value.time >= 300000) cache.delete(key)
  const saved = cache.get(key)
  if (saved) return saved.value
  if (cache.size >= 500) cache.delete(cache.keys().next().value)
  const value = healthBulletins(code, { now })
  cache.set(key, { time: now, value })
  try { return await value } catch (error) { cache.delete(key); throw error }
})
