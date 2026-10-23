// Only approximate coordinates from the authenticated discovery API belong here.
export function mapGroups(farmers = []) {
  const groups = new Map()
  for (const farmer of farmers) {
    if (!farmer || typeof farmer.id !== 'string' || !Number.isFinite(farmer.latitude) || !Number.isFinite(farmer.longitude) || Math.abs(farmer.latitude) > 90 || Math.abs(farmer.longitude) > 180) continue
    const latitude = Math.round(farmer.latitude * 10) / 10
    const longitude = Math.round(farmer.longitude * 10) / 10
    const key = `${latitude},${longitude}`
    if (!groups.has(key)) groups.set(key, { latitude, longitude, farmers: [] })
    const group = groups.get(key)
    if (!group.farmers.some(item => item.id === farmer.id)) group.farmers.push(farmer)
  }
  return [...groups.values()]
}
export function safeTileUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && ['{z}', '{x}', '{y}'].every(token => value.includes(token))
  } catch { return false }
}
