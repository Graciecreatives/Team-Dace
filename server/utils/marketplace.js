import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
const fail = (statusCode, statusMessage) => { throw createError({ statusCode, statusMessage }) }
const reserved = new Set(['api', 'admin', 'auth', 'login', 'logout', 'register', 'onboarding', 'dashboard', 'products', 'marketplace', 'storefront', 'settings', 'account', 'help', 'about', 'contact', 'public', 'assets', '_nuxt', 'www', 'team', 'farm'])
function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || /[<>\u0000-\u001f\u007f]/.test(value) || (required && !value.trim())) fail(400, 'Use valid plain text')
  return value.trim()
}
export function farmSlug(value) {
  if (typeof value !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length < 3 || value.length > 60 || reserved.has(value)) fail(400, 'Choose a unique lowercase farm slug, 3-60 letters, digits or hyphens, not a reserved page name')
  return value
}
export function safeImage(value = '') {
  value = text(value, 1000)
  if (!value) return ''
  let url
  try { url = new URL(value) } catch { fail(400, 'Image must use a public HTTPS URL') }
  const host = url.hostname.toLowerCase()
  // Images are browser-loaded only, never fetched by the server. Reject local/private hosts and credentials.
  if (url.protocol !== 'https:' || url.username || url.password || url.port || host.includes(':') || !host.includes('.') || /^(?:\d+\.){3}\d+$/.test(host) || /(^|\.)(localhost|local|internal|test|invalid)$/.test(host) || host.endsWith('.localhost')) fail(400, 'Image must use a public HTTPS URL')
  return url.href
}
function arrays(data) {
  data.marketplaceFarms ||= []
  data.marketplaceProducts ||= []
  if (!Array.isArray(data.marketplaceFarms) || !Array.isArray(data.marketplaceProducts)) throw new Error('Invalid marketplace store')
}
const productCard = p => ({ id: p.id, name: p.name, description: p.description, price: p.price, currency: p.currency, quantity: p.quantity, unit: p.unit, imageUrl: p.imageUrl, published: p.published === true })
export function ownerCatalog(data, ownerId) {
  arrays(data)
  const farm = data.marketplaceFarms.find(f => f.ownerId === ownerId)
  return { farm: farm ? { slug: farm.slug, name: farm.name, contact: farm.contact, contactConsent: farm.contactConsent === true, published: farm.published === true } : { slug: '', name: '', contact: '', contactConsent: false, published: false }, products: data.marketplaceProducts.filter(p => p.ownerId === ownerId).map(productCard) }
}
export function publicCatalog(data, slug) {
  arrays(data)
  const farm = data.marketplaceFarms.find(f => f.slug === slug && f.published === true)
  if (!farm) fail(404, 'Storefront unavailable')
  return { farm: { slug: farm.slug, name: farm.name, contact: farm.contactConsent === true ? farm.contact : '' }, products: data.marketplaceProducts.filter(p => p.ownerId === farm.ownerId && p.published === true).map(productCard) }
}
export function mutateCatalog(data, ownerId, input) {
  arrays(data)
  if (input.action === 'configure') {
    const slug = farmSlug(input.slug)
    if (data.marketplaceFarms.some(f => f.slug === slug && f.ownerId !== ownerId)) fail(409, 'Farm slug is already taken')
    if (typeof input.published !== 'boolean' || typeof input.contactConsent !== 'boolean') fail(400, 'Explicit publication and contact choices are required')
    const contact = text(input.contact ?? '', 250)
    if (contact && !input.contactConsent) fail(400, 'Consent is required to publish contact details')
    const fields = { slug, name: text(input.name, 100, true), contact, contactConsent: input.contactConsent, published: input.published }
    const farm = data.marketplaceFarms.find(f => f.ownerId === ownerId)
    if (farm) Object.assign(farm, fields)
    else data.marketplaceFarms.push({ ownerId, ...fields })
  } else if (input.action === 'saveProduct') {
    if (typeof input.published !== 'boolean') fail(400, 'Choose whether to publish the product')
    if (typeof input.price !== 'number' || !Number.isFinite(input.price) || input.price <= 0 || input.price > 1e9 || Math.abs(input.price * 100 - Math.round(input.price * 100)) > 0.00001) fail(400, 'Price must be positive with at most two decimals')
    if (typeof input.quantity !== 'number' || !Number.isFinite(input.quantity) || input.quantity < 0 || input.quantity > 1e9) fail(400, 'Invalid quantity')
    if (typeof input.currency !== 'string' || !['NGN', 'USD', 'GBP', 'EUR', 'GHS', 'KES', 'ZAR'].includes(input.currency)) fail(400, 'Choose a supported currency')
    const fields = { name: text(input.name, 120, true), description: text(input.description ?? '', 2000), price: input.price, quantity: input.quantity, currency: input.currency, unit: text(input.unit, 40, true), imageUrl: safeImage(input.imageUrl), published: input.published }
    if (input.id !== undefined) {
      const product = data.marketplaceProducts.find(p => p.id === input.id && p.ownerId === ownerId)
      if (!product) fail(404, 'Product unavailable')
      Object.assign(product, fields)
    } else {
      if (data.marketplaceProducts.filter(p => p.ownerId === ownerId).length >= 100) fail(409, 'Maximum 100 products per farm')
      data.marketplaceProducts.push({ id: randomUUID(), ownerId, ...fields })
    }
  } else if (input.action === 'deleteProduct') {
    const index = data.marketplaceProducts.findIndex(p => p.id === input.id && p.ownerId === ownerId)
    if (index < 0) fail(404, 'Product unavailable')
    data.marketplaceProducts.splice(index, 1)
  } else fail(400, 'Unknown marketplace action')
  return ownerCatalog(data, ownerId)
}
