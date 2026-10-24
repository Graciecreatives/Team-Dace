import { defineEventHandler, getRouterParam, setHeader } from 'h3'
import { authenticated, fail } from '../[...].js'
import { store } from '../../utils/store.js'
import { readPhoto, visiblePhoto } from '../../utils/product-images.js'
function viewer(data, event) {
  try { return authenticated(data, event).id }
  catch (error) { if (error.statusCode !== 401) throw error }
}
export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'Vary', 'Cookie')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Content-Security-Policy', "default-src 'none'; sandbox")
  const id = getRouterParam(event, 'id')
  if (!/^[a-f0-9-]{36}$/.test(id || '')) fail(404, 'Photo unavailable')
  const asset = await store(data => visiblePhoto(data, id, viewer(data, event)))
  const bytes = await readPhoto(asset)
  // Honour an unpublish or logout that occurred during the storage request.
  await store(data => visiblePhoto(data, id, viewer(data, event)))
  setHeader(event, 'Content-Type', 'image/jpeg')
  setHeader(event, 'Content-Length', bytes.length)
  setHeader(event, 'Content-Disposition', 'inline; filename="farm-product.jpg"')
  return bytes
})
