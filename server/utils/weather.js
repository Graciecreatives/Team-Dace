// OpenWeather free 5-day / 3-hour forecast, never One Call.
export function forecastSummary(payload) {
  const offset = payload?.city?.timezone
  if (String(payload?.cod) !== '200' || !Number.isInteger(offset) || Math.abs(offset) > 50400 || !Array.isArray(payload.list) || !payload.list.length || payload.list.length > 40) throw new Error('Weather data unavailable')
  const groups = new Map()
  let previous = 0
  const number = (value, low, high) => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high
  for (const slot of payload.list) {
    const { dt, main, wind } = slot || {}
    if (!Number.isInteger(dt) || dt <= previous || dt < 946684800 || dt > 7258118400 || !number(main?.temp, -100, 70)) throw new Error('Weather data incomplete')
    if (previous && ((dt - previous) % 10800 !== 0 || dt - payload.list[0].dt > 432000)) throw new Error('Weather data incomplete')
    previous = dt
    const min = main.temp_min === undefined ? main.temp : main.temp_min
    const max = main.temp_max === undefined ? main.temp : main.temp_max
    const rain = slot.rain === undefined ? 0 : slot.rain?.['3h']
    const humidity = main.humidity === undefined ? null : main.humidity
    const speed = wind?.speed === undefined ? null : wind.speed
    if (!number(min, -100, 70) || !number(max, -100, 70) || min > max || !number(rain, 0, 3000) || (humidity !== null && !number(humidity, 0, 100)) || (speed !== null && !number(speed, 0, 200))) throw new Error('Weather data incomplete')
    const date = new Date((dt + offset) * 1000).toISOString().slice(0, 10)
    const slots = groups.get(date) || []
    slots.push({ dt, min, max, rain, humidity, speed })
    groups.set(date, slots)
  }
  const round = n => Math.round(n * 10) / 10
  const days = [...groups].map(([date, slots]) => {
    const max = Math.max(...slots.map(s => s.max)), min = Math.min(...slots.map(s => s.min))
    const rain = round(slots.reduce((sum, s) => sum + s.rain, 0))
    const partial = slots.length !== 8 || slots.some((s, i) => i && s.dt - slots[i - 1].dt !== 10800)
    return { date, max, min, rain, partial, intervals: slots.length, coverageHours: slots.length * 3,
      humidity: slots.every(s => s.humidity !== null) ? round(slots.reduce((sum, s) => sum + s.humidity, 0) / slots.length) : null,
      wind: slots.every(s => s.speed !== null) ? Math.max(...slots.map(s => s.speed)) : null,
      indicators: [...(partial ? ['Partial day: values cover available three-hour forecast periods only, not full-day extremes or totals.'] : []), ...(max >= 35 ? ['Heat planning: available forecast temperatures reach at least 35°C. Review water and shade availability.'] : []), ...(rain >= 20 ? ['Rain planning: available forecast periods total at least 20 mm of rain. Review drainage and outdoor tasks.'] : [])] }
  })
  return { days, timezone: `UTC${offset < 0 ? '-' : '+'}${String(Math.floor(Math.abs(offset) / 3600)).padStart(2, '0')}:${String(Math.floor(Math.abs(offset) % 3600 / 60)).padStart(2, '0')}` }
}

export async function fetchForecast(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  let reader
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'error' })
    if (!response.ok || response.redirected || !response.body || Number(response.headers.get('content-length')) > 262144) throw new Error('Weather unavailable')
    reader = response.body.getReader()
    const chunks = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 262144) throw new Error('Weather response too large')
      chunks.push(Buffer.from(value))
    }
    return forecastSummary(JSON.parse(Buffer.concat(chunks).toString('utf8')))
  } finally {
    clearTimeout(timer)
    if (reader) await reader.cancel().catch(() => {})
    controller.abort()
  }
}
