import test from 'node:test'
import assert from 'node:assert/strict'
import { weatherAdvice } from '../utils/farm-watch.js'
const forecast = { latitude: 7.4, longitude: 3.9, days: [{ date: '2026-10-24', max: 35, min: 24, rain: 20 }] }
test('weather prompts use crop profile and deterministic approximate-area IDs', () => {
  const result = weatherAdvice(forecast, { farmType: 'crops', mainEnterprises: ['Maize', 'Cassava'] })
  assert.equal(result.length, 2)
  assert.match(result[0].body, /Maize, Cassava/)
  assert.ok(result.every(a => a.kind === 'weather' && a.level === 'watch'))
  assert.match(result[1].body, /does not confirm a disease outbreak/)
  assert.ok(!result[0].body.includes('your animals'))
  assert.deepEqual(result, weatherAdvice(forecast, { farmType: 'crops', mainEnterprises: ['Maize', 'Cassava'] }))
})
test('animal and mixed profiles receive appropriate non-diagnostic planning reminders', () => {
  const animal = weatherAdvice(forecast, { farmType: 'livestock' })
  assert.match(animal[0].body, /drinking-water/)
  assert.ok(!animal[0].body.includes('soil moisture'))
  const mixed = weatherAdvice(forecast, { farmType: 'mixed' })
  assert.match(mixed[0].body, /soil moisture/)
  assert.match(mixed[0].body, /your animals/)
})
test('cold thresholds, routine days and missing data remain distinct', () => {
  const cold = weatherAdvice({ ...forecast, days: [{ date: '2026-10-25', max: 10, min: 2, rain: 0 }] }, { farmType: 'crops' })
  assert.equal(cold[0].title, 'Cold conditions forecast')
  const routine = weatherAdvice({ ...forecast, days: [{ date: '2026-10-25', max: 30, min: 20, rain: 2 }] })
  assert.equal(routine[0].level, 'notice')
  assert.match(routine[0].body, /does not mean all weather hazards are absent/)
  assert.deepEqual(weatherAdvice(null), [])
  assert.deepEqual(weatherAdvice({ days: [{ date: 'bad', max: 35, min: null, rain: -1 }] }), [])
})
