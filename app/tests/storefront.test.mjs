import test from 'node:test'
import assert from 'node:assert/strict'
import { isUploadedPhoto, storefrontProducts, storefrontHeroImage } from '../utils/storefront.js'
const products = [
  { id: 'a', name: 'Zucchini', description: 'Green squash', currency: 'USD', price: 2, quantity: 5 },
  { id: 'b', name: 'Apples', description: 'Orchard fruit', currency: 'NGN', price: 800, quantity: 0 },
  { id: 'c', name: 'Beans', currency: 'USD', price: 10, quantity: 3 },
  { id: 'd', name: 'Carrots', currency: 'NGN', price: 200, quantity: 2 },
]
test('search matches names and descriptions with whitespace and case normalization', () => {
  assert.deepEqual(storefrontProducts(products, ' GREEN ').map(p => p.id), ['a'])
  assert.deepEqual(storefrontProducts(products, 'apP').map(p => p.id), ['b'])
  assert.deepEqual(storefrontProducts(products, '', 'name', true).map(p => p.id), ['c', 'd', 'a'])
  assert.deepEqual(storefrontProducts(products, 'missing'), [])
  assert.deepEqual(storefrontProducts([]), [])
})
test('price sorting groups currencies rather than comparing incomparable prices', () => {
  assert.deepEqual(storefrontProducts(products, '', 'price-asc').map(p => p.id), ['d', 'b', 'a', 'c'])
  assert.deepEqual(storefrontProducts(products, '', 'price-desc').map(p => p.id), ['b', 'd', 'c', 'a'])
  assert.deepEqual(products.map(p => p.id), ['a', 'b', 'c', 'd'], 'source order stays unchanged')
})
test('cover uses the same opt-in and failure policy before falling back to a permitted product', () => {
  const farm = { name: 'Green Acre', coverImageUrl: 'https://images.example.com/cover.jpg' }
  const product = { name: 'Beans', imageUrl: '/api/product-images/11111111-1111-4111-8111-111111111111' }
  let enabled = false
  const failures = new Set()
  const permitted = item => Boolean(item.imageUrl && !failures.has(item.imageUrl) && (isUploadedPhoto(item.imageUrl) || enabled))
  assert.equal(storefrontHeroImage(farm, product, permitted).url, product.imageUrl)
  enabled = true
  assert.deepEqual(storefrontHeroImage(farm, product, permitted), { url: farm.coverImageUrl, alt: 'Green Acre cover photo' })
  failures.add(farm.coverImageUrl)
  assert.equal(storefrontHeroImage(farm, product, permitted).url, product.imageUrl)
  assert.equal(storefrontHeroImage(farm, undefined, permitted), null)
  assert.equal(storefrontHeroImage({}, undefined, permitted), null)
  assert.equal(storefrontHeroImage({ ...farm, coverImageUrl: product.imageUrl }, undefined, permitted).url, product.imageUrl)
})

test('only local uploaded product URLs qualify for default image loading', () => {
  assert.equal(isUploadedPhoto('/api/product-images/12345678-1234-1234-1234-123456789abc'), true)
  for (const value of ['', null, 'https://example.com/photo.jpg', '//example.com/photo.jpg', '/api/product-images/not-an-id', '/api/product-images/12345678-1234-1234-1234-123456789abc?external=1']) assert.equal(isUploadedPhoto(value), false)
})
