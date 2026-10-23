export function coordinates(input) {
  if (typeof input.latitude !== 'number' || typeof input.longitude !== 'number' || !Number.isFinite(input.latitude) || !Number.isFinite(input.longitude) || Math.abs(input.latitude) > 90 || Math.abs(input.longitude) > 180) throw new Error('Enter valid latitude and longitude')
  return { latitude: Math.round(input.latitude * 10) / 10, longitude: Math.round(input.longitude * 10) / 10 }
}
export function distanceKm(a, b) {
  const rad = n => n * Math.PI / 180
  const dlat = rad(b.latitude - a.latitude), dlon = rad(b.longitude - a.longitude)
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dlon / 2) ** 2
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h))))
}
export function forecastSummary(payload) {
  const daily = payload?.daily
  if (!daily || !Array.isArray(daily.time) || !daily.time.length || daily.time.length > 7) throw new Error('Weather data unavailable')
  const days = daily.time.map((date, i) => {
    const max = daily.temperature_2m_max?.[i], min = daily.temperature_2m_min?.[i], rain = daily.precipitation_sum?.[i]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || ![max, min, rain].every(n => typeof n === 'number' && Number.isFinite(n)) || rain < 0) throw new Error('Weather data incomplete')
    return { date, max, min, rain, indicators: [...(max >= 35 ? ['Heat planning: forecast maximum at least 35°C. Review water and shade availability.'] : []), ...(rain >= 20 ? ['Rain planning: forecast precipitation at least 20 mm. Review drainage and outdoor tasks.'] : [])] }
  })
  return { days, timezone: typeof payload.timezone === 'string' ? payload.timezone : 'UTC' }
}
