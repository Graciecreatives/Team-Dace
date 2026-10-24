import { defineEventHandler, getHeader, setHeader } from 'h3'
import { authenticated, mutationGuard, fail } from '../[...].js'
import { store } from '../../utils/store.js'
import { readBoundedBytes } from '../../utils/request-body.js'
import { MAX_PHOTO_BYTES, encodeProductPhoto, imageRows, imageUrl, newPhoto, writePhoto, removePhoto, photoBackend } from '../../utils/product-images.js'

const buckets = new Map()
let activeUploads = 0
function throttle(id) {
  const now = Date.now()
  for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key)
  if (!buckets.has(id)) {
    if (buckets.size >= 10000) fail(429, 'Photo uploads are temporarily busy')
    buckets.set(id, { count: 0, until: now + 60000 })
  }
  if (++buckets.get(id).count > 10) fail(429, 'Please wait a minute before uploading more photos')
  if (activeUploads >= (photoBackend() === 'cloudflare' ? 1 : 2)) fail(429, 'Photos are being processed. Please try again shortly.')
}
export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store')
  const user = await store(data => authenticated(data, event))
  mutationGuard(event)
  throttle(user.id)
  const type = (getHeader(event, 'content-type') || '').split(';')[0].trim().toLowerCase()
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) fail(415, 'Use a JPEG, PNG or WebP photo up to 8 MB')
  if (Number(getHeader(event, 'content-length')) > MAX_PHOTO_BYTES) fail(413, 'Choose a photo up to 8 MB')
  activeUploads++
  let asset, written = false
  try {
    await store(data => { if (imageRows(data).filter(image => image.ownerId === user.id).length >= 500) fail(409, 'Photo storage limit reached. Contact the farm administrator to remove unused uploads.') })
    const bytes = await readBoundedBytes(event, MAX_PHOTO_BYTES, 'Choose a photo up to 8 MB')
    const photo = await encodeProductPhoto(bytes, type)
    asset = newPhoto(user.id, photo)
    await writePhoto(asset, photo.bytes)
    written = true
    await store(data => {
      authenticated(data, event)
      if (imageRows(data).filter(image => image.ownerId === user.id).length >= 500) fail(409, 'Photo storage limit reached')
      imageRows(data).push(asset)
    }, true)
    return { imageUrl: imageUrl(asset.id), width: asset.width, height: asset.height }
  } catch (error) {
    if (asset && written) await removePhoto(asset).catch(() => {})
    if (error.statusCode) throw error
    fail(503, 'Photo upload could not be saved. Please try again.')
  } finally { activeUploads-- }
})
