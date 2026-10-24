import test from 'node:test'
import assert from 'node:assert/strict'
import { forecastSummary, fetchForecast } from '../server/utils/weather.js'
import { weatherAdvice } from '../app/utils/farm-watch.js'
const start = Date.parse('2026-10-24T00:00:00Z') / 1000
const slot = (i = 0) => ({ dt: start + i * 10800, main: { temp: 30, temp_min: 22, temp_max: 36, humidity: 60 + i }, wind: { speed: i + 2 }, rain: { '3h': 3 } })
const payload = (list = [slot()]) => ({ cod: '200', city: { timezone: 0 }, list })
test('OpenWeather aggregates rain, sampled extrema, humidity and metric wind with coverage', () => {
  const result = forecastSummary(payload(Array.from({ length: 8 }, (_, i) => slot(i))))
  assert.deepEqual({ ...result.days[0], indicators: [] }, { date: '2026-10-24', max: 36, min: 22, rain: 24, partial: false, intervals: 8, coverageHours: 24, humidity: 63.5, wind: 9, indicators: [] })
  const partial = forecastSummary(payload([slot(0), slot(2)]))
  assert.equal(partial.days[0].partial, true)
  assert.equal(partial.days[0].rain, 6)
  assert.match(weatherAdvice(partial)[0].body, /Partial-day/)
  assert.ok(weatherAdvice(partial)[0].title)
  assert.equal(weatherAdvice(partial)[0].date, '2026-10-24')
  const missing = slot()
  delete missing.rain; delete missing.main.humidity; delete missing.wind
  assert.equal(forecastSummary(payload([missing])).days[0].rain, 0)
  assert.equal(forecastSummary(payload([missing])).days[0].humidity, null)
  assert.equal(forecastSummary(payload([missing])).days[0].wind, null)
  const shifted = payload([slot(7), slot(8)])
  shifted.city.timezone = 19800
  assert.equal(forecastSummary(shifted).days[0].date, '2026-10-25')
  assert.equal(forecastSummary(shifted).timezone, 'UTC+05:30')
})
test('OpenWeather rejects malformed, duplicate, unordered and invalid data', () => {
  for (const bad of [null, {}, payload([]), payload(Array(41).fill(slot())), payload([slot(), slot()]), payload([slot(1), slot(0)]), { ...payload(), cod: '401' }, { ...payload(), city: {} }]) assert.throws(() => forecastSummary(bad))
  for (const change of [s => { s.main.temp = null }, s => { s.rain['3h'] = -1 }, s => { s.rain = {} }, s => { s.main.humidity = 101 }, s => { s.wind.speed = '3' }, s => { s.main.temp_min = 60 }, s => { s.dt = 'tomorrow' }]) {
    const s = slot(); change(s); assert.throws(() => forecastSummary(payload([s])))
  }
})
test('ten-second timeout aborts connection and body reads', async t => {
  const original = globalThis.fetch
  t.mock.timers.enable({ apis: ['setTimeout'] })
  try {
    for (const bodyPhase of [false, true]) {
      let signal
      globalThis.fetch = async (url, options) => {
        signal = options.signal
        if (!bodyPhase) return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
        return new Response(new ReadableStream({ start(controller) { signal.addEventListener('abort', () => controller.error(new Error('aborted body')), { once: true }) } }))
      }
      const pending = fetchForecast('https://example.test')
      await Promise.resolve()
      t.mock.timers.tick(10000)
      await assert.rejects(pending)
      assert.equal(signal.aborted, true)
    }
  } finally { globalThis.fetch = original; t.mock.timers.reset() }
})

test('bounded provider fetch rejects status errors, redirects, malformed JSON, oversize and network failures', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(options.redirect, 'error')
      assert.equal(options.signal.aborted, false)
      return Response.json(payload())
    }
    assert.equal((await fetchForecast('https://example.test')).days.length, 1)
    for (const response of [new Response('secret', { status: 401 }), new Response('secret', { status: 429 }), new Response('secret', { status: 500 }), new Response(null, { status: 302 }), new Response('{'), new Response('x', { headers: { 'content-length': '262145' } }), new Response('x'.repeat(262145)), Response.json({ cod: '200', list: [] })]) {
      globalThis.fetch = async () => response
      await assert.rejects(fetchForecast('https://example.test'))
    }
    globalThis.fetch = async () => { throw new Error('network secret') }
    await assert.rejects(fetchForecast('https://example.test'))
  } finally { globalThis.fetch = original }
})
