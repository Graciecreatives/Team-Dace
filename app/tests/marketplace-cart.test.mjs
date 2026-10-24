import test from 'node:test'
import assert from 'node:assert/strict'
import { enquiryBasket, enquiryText } from '../utils/marketplace-cart.js'

const products = [
  { id: 'maize', name: 'Maize', price: 1200.50, quantity: 20, unit: 'kg', currency: 'NGN' },
  { id: 'eggs', name: 'Eggs', price: 10.01, quantity: 5, unit: 'tray', currency: 'USD' },
]
test('enquiry basket supports fractional units and keeps currency totals separate', () => {
  const basket = enquiryBasket(products, { maize: 2.5, eggs: 2 })
  assert.deepEqual(basket.totals, { NGN: 300125, USD: 2002 })
  assert.deepEqual(basket.invalid, [])
  const text = enquiryText({ name: 'Green Acre' }, basket)
  assert.match(text, /Maize: 2.5 kg/)
  assert.match(text, /Estimated total: NGN 3001.25/)
  assert.match(text, /Estimated total: USD 20.02/)
  assert.match(text, /not a confirmed or paid order/)
  assert.equal(products[0].quantity, 20, 'An enquiry must never reserve stock')
})
test('invalid, unavailable and unsafe-sized enquiries cannot be copied as valid orders', () => {
  for (const value of ['', '2', NaN, Infinity, 0, -1, 21]) {
    const basket = enquiryBasket(products, { maize: value })
    assert.deepEqual(basket.invalid, ['maize'])
    assert.equal(enquiryText({ name: 'Farm' }, basket), '')
  }
  assert.deepEqual(enquiryBasket(products, { missing: 1 }).invalid, ['missing'])
  assert.deepEqual(enquiryBasket([{ ...products[0], price: 1e9, quantity: 1e9 }], { maize: 1e9 }).invalid, ['maize'])
  assert.equal(enquiryText({}, enquiryBasket(products, {})), '')
})
