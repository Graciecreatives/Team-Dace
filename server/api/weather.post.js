import { defineEventHandler, setHeader } from 'h3'
import { authenticated, mutationGuard, body, fail } from './[...].js'
import { store } from '../utils/store.js'
import { coordinates, forecastSummary } from '../utils/location.js'
const cache = new Map()
const attempts = new Map()
export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store')
  const user = await store(data => authenticated(data, event))
  mutationGuard(event)
  const input = await body(event)
  let point
  try { point = coordinates(input) } catch (error) { fail(400, error.message) }
  const now = Date.now()
  for (const [key, value] of attempts) if (value.until < now) attempts.delete(key)
  if (!attempts.has(user.id) && attempts.size >= 10000) fail(429, 'Weather temporarily busy')
  const bucket = attempts.get(user.id) || { count: 0, until: now + 60000 }
  if (++bucket.count > 10) fail(429, 'Please wait a minute before checking weather again')
  attempts.set(user.id, bucket)
  const key = `${point.latitude},${point.longitude}`
  const saved = cache.get(key)
  if (saved && now - saved.time < 900000) return saved.value
  const apiKey = process.env.OPEN_METEO_API_KEY
  const url = new URL(apiKey ? 'https://customer-api.open-meteo.com/v1/forecast' : 'https://api.open-meteo.com/v1/forecast')
  url.search = new URLSearchParams({ ...point, daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum', forecast_days: '5', timezone: 'auto', ...(apiKey ? { apikey: apiKey } : {}) }).toString()
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' })
    if (!response.ok) throw new Error('upstream')
    const result = forecastSummary(await response.json())
    const value = { ...result, ...point, checkedAt: new Date().toISOString(), source: 'Open-Meteo', disclaimer: 'Forecast planning indicators, not official emergency warnings. Check local weather authorities. No background notifications are sent.' }
    for (const [key, entry] of cache) if (now - entry.time > 900000) cache.delete(key)
    if (cache.size >= 500) cache.delete(cache.keys().next().value)
    cache.set(key, { time: now, value })
    return value
  } catch { fail(502, 'Weather provider unavailable. Please try again later.') }
})
