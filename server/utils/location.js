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
export { forecastSummary } from './weather.js'
