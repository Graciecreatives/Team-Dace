import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mutateCatalog, ownerCatalog, publicCatalog } from '../server/utils/marketplace.js'
import { imageUrl, visiblePhoto } from '../server/utils/product-images.js'

const defaults = { headline: '', tagline: '', coverImageUrl: '', theme: 'green', showHero: true }
const configure = { action: 'configure', slug: 'green-farm', name: 'Green Farm', contact: '', contactConsent: false, published: false }
const first = '11111111-1111-1111-1111-111111111111'
const second = '22222222-2222-2222-2222-222222222222'
const foreign = '33333333-3333-3333-3333-333333333333'
const fixture = () => ({ marketplaceImages: [{ id: first, ownerId: 'owner' }, { id: second, ownerId: 'owner' }, { id: foreign, ownerId: 'other' }] })
const appearance = farm => Object.fromEntries(Object.keys(defaults).map(key => [key, farm[key]]))
const unavailable = fn => assert.throws(fn, error => error.statusCode === 404)

test('appearance defaults normalize old snapshots and public projection excludes private data', () => {
  const data = fixture()
  assert.deepEqual(appearance(ownerCatalog(data, 'owner').farm), defaults)
  data.marketplaceFarms.push({ ownerId: 'owner', slug: configure.slug, name: configure.name, contact: 'private', contactConsent: false, published: true, secret: 'private metadata' })
  assert.deepEqual(appearance(ownerCatalog(data, 'owner').farm), defaults)
  assert.deepEqual(publicCatalog(data, configure.slug).farm, { slug: configure.slug, name: configure.name, contact: '', ...defaults })
  Object.assign(data.marketplaceFarms[0], { headline: '<script>', tagline: '\u0085', coverImageUrl: imageUrl(foreign), theme: 'bad', showHero: 'false' })
  assert.deepEqual(appearance(publicCatalog(data, configure.slug).farm), defaults)
})

test('customization validates strict flat fields and rejects foreign covers atomically', () => {
  const data = fixture()
  mutateCatalog(data, 'owner', configure)
  const before = JSON.stringify(data)
  const invalid = [
    { headline: '<b>Fresh</b>' }, { headline: 'a'.repeat(81) }, { headline: null }, { headline: 'bad\ntext' },
    { tagline: 'a'.repeat(161) }, { tagline: 'bad\u0000text' }, { tagline: '\u0085' }, { tagline: 1 },
    { theme: 'purple' }, { theme: null }, { theme: {} }, { showHero: 'false' }, { showHero: 0 }, { showHero: null },
    { coverImageUrl: imageUrl(foreign) }, { coverImageUrl: 'javascript:alert(1)' }, { coverImageUrl: 'https://localhost/x' }, { coverImageUrl: 'a'.repeat(1001) }, { coverImageUrl: null }
  ]
  for (const fields of invalid) {
    assert.throws(() => mutateCatalog(data, 'owner', { ...configure, ...fields }), error => error.statusCode === 400, JSON.stringify(fields))
    assert.equal(JSON.stringify(data), before)
  }
  const valid = { headline: 'h'.repeat(80), tagline: 't'.repeat(160), coverImageUrl: imageUrl(first), theme: 'teal', showHero: false }
  assert.deepEqual(appearance(mutateCatalog(data, 'owner', { ...configure, ...valid }).farm), valid)
  assert.deepEqual(appearance(mutateCatalog(data, 'owner', { ...configure, name: 'Renamed', published: true }).farm), valid)
  assert.deepEqual(appearance(publicCatalog(JSON.parse(JSON.stringify(data)), configure.slug).farm), valid)
  assert.equal(mutateCatalog(data, 'owner', { ...configure, theme: 'sage' }).farm.theme, 'sage')
  assert.deepEqual(appearance(mutateCatalog(data, 'owner', { ...configure, ...defaults }).farm), defaults)
})

test('cover visibility follows publication, replacement and independent published product authorization', () => {
  const data = fixture()
  const save = fields => mutateCatalog(data, 'owner', { ...configure, ...fields })
  save({ coverImageUrl: imageUrl(first) })
  assert.equal(visiblePhoto(data, first, 'owner').id, first)
  unavailable(() => visiblePhoto(data, first))
  unavailable(() => visiblePhoto(data, first, 'other'))
  save({ published: true })
  assert.equal(visiblePhoto(data, first).id, first)
  save({ published: true, showHero: false })
  unavailable(() => visiblePhoto(data, first))
  assert.equal(visiblePhoto(data, first, 'owner').id, first)
  save({ published: true, showHero: true })
  assert.equal(visiblePhoto(data, first).id, first)
  unavailable(() => visiblePhoto(data, second))
  unavailable(() => visiblePhoto(data, foreign))
  // A foreign farm referencing this asset cannot authorize it.
  data.marketplaceFarms.push({ ownerId: 'other', slug: 'other-farm', published: true, coverImageUrl: imageUrl(first) })
  save({ published: false })
  unavailable(() => visiblePhoto(data, first))
  save({ published: true, coverImageUrl: imageUrl(second) })
  unavailable(() => visiblePhoto(data, first))
  assert.equal(visiblePhoto(data, second).id, second)
  const product = { action: 'saveProduct', name: 'Tomatoes', description: '', price: 10, quantity: 1, unit: 'kg', currency: 'NGN', imageUrl: imageUrl(first), published: true }
  const id = mutateCatalog(data, 'owner', product).products[0].id
  assert.equal(visiblePhoto(data, first).id, first)
  save({ published: true, showHero: false })
  assert.equal(visiblePhoto(data, first).id, first)
  unavailable(() => visiblePhoto(data, second))
  save({ published: true, coverImageUrl: '' })
  unavailable(() => visiblePhoto(data, second))
  assert.equal(visiblePhoto(data, first).id, first)
  save({ published: false })
  unavailable(() => visiblePhoto(data, first))
  save({ published: true })
  mutateCatalog(data, 'owner', { ...product, id, published: false })
  unavailable(() => visiblePhoto(data, first))
  assert.equal(visiblePhoto(data, first, 'owner').id, first)
})
