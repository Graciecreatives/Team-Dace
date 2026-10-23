import test from 'node:test'
import assert from 'node:assert/strict'
import { mapGroups, safeTileUrl } from '../utils/farmer-map.js'

test('groups rounded areas without inventing precise farmer locations', () => {
  const farmer = { id: 'a', latitude: 7.43, longitude: 3.91 }
  const groups = mapGroups([farmer, farmer, { id: 'b', latitude: 7.41, longitude: 3.94 }, { id: 'c', latitude: 8, longitude: 4 }])
  assert.equal(groups.length, 2)
  assert.deepEqual([groups[0].latitude, groups[0].longitude], [7.4, 3.9])
  assert.deepEqual(groups[0].farmers.map(f => f.id), ['a', 'b'])
  assert.equal(farmer.latitude, 7.43)
})
test('rejects malformed map points', () => {
  assert.deepEqual(mapGroups([null, { id: 'a', latitude: NaN, longitude: 1 }, { id: 'b', latitude: 91, longitude: 1 }, { id: 'c', latitude: 1, longitude: -181 }, { latitude: 1, longitude: 1 }]), [])
  assert.deepEqual(mapGroups(), [])
})
test('tile providers require HTTPS, templates and no credentials', () => {
  assert.equal(safeTileUrl('https://tile.openstreetmap.org/{z}/{x}/{y}.png'), true)
  for (const url of ['http://tiles.example/{z}/{x}/{y}', 'https://secret:password@tiles.example/{z}/{x}/{y}', 'javascript:alert(1)', 'https://tiles.example/static.png', 'invalid']) assert.equal(safeTileUrl(url), false)
})
