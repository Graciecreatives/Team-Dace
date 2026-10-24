import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'
import { createError } from 'h3'
import { databaseMode } from './database.js'

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024
const MAX_STORED_BYTES = 4 * 1024 * 1024
const fail = (statusCode, statusMessage) => { throw createError({ statusCode, statusMessage }) }
export const imageUrl = id => `/api/product-images/${id}`
export const imageId = value => typeof value === 'string' && /^\/api\/product-images\/([a-f0-9-]{36})$/.exec(value)?.[1]
export function imageRows(data) {
  if (data.marketplaceImages === undefined) data.marketplaceImages = []
  if (!Array.isArray(data.marketplaceImages)) throw new Error('Invalid product image store')
  return data.marketplaceImages
}
export function photoBackend() {
  const mode = process.env.FARMBUDDY_IMAGE_STORAGE?.trim()
  if (mode && !['local', 'supabase'].includes(mode)) fail(503, 'Product photo storage is misconfigured')
  let databaseIsCloud
  try { databaseIsCloud = databaseMode() === 'supabase' } catch { fail(503, 'Product photo database is misconfigured') }
  if (mode === 'local' && databaseIsCloud) fail(503, 'Supabase database mode requires Supabase photo storage')
  return mode || (databaseIsCloud || process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY ? 'supabase' : 'local')
}
function storageConfig() {
  let url
  try { url = new URL(process.env.SUPABASE_URL) } catch { fail(503, 'Supabase photo storage needs server configuration') }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'farm-products'
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || !key || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(bucket)) fail(503, 'Supabase photo storage needs valid private server configuration')
  return { base: url.origin, bucket, headers: { apikey: key, Authorization: `Bearer ${key}` } }
}
function localPath(key) {
  if (!/^[a-f0-9]{32}\/[a-f0-9-]{36}\.jpg$/.test(key)) fail(404, 'Photo unavailable')
  const base = process.env.FARMBUDDY_UPLOAD_DIR || resolve(dirname(process.env.FARMBUDDY_DATA_FILE || '.data/farmbuddy.json'), 'uploads')
  return resolve(base, key)
}
export function photoKey(ownerId, id) { return `${createHash('sha256').update(ownerId).digest('hex').slice(0, 32)}/${id}.jpg` }
export async function encodeProductPhoto(bytes, contentType) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_PHOTO_BYTES) fail(413, 'Choose a photo up to 8 MB')
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  const expected = jpeg ? 'image/jpeg' : png ? 'image/png' : webp ? 'image/webp' : ''
  if (!expected || contentType !== expected) fail(415, 'Use a JPEG, PNG or WebP photo. Export HEIC photos as JPEG first.')
  try {
    // Decoding and re-encoding strips EXIF/GPS metadata and prevents serving raw uploads.
    const { data, info } = await sharp(bytes, { limitInputPixels: 40000000, failOn: 'warning', sequentialRead: true, pages: 1 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true })
    if (!data.length || data.length > MAX_STORED_BYTES) fail(413, 'Photo could not be reduced safely. Choose a smaller image.')
    return { bytes: data, width: info.width, height: info.height }
  } catch (error) {
    if (error.statusCode === 413) throw error
    fail(415, 'This photo could not be decoded safely. Use a JPEG, PNG or WebP under 40 megapixels.')
  }
}
async function boundedBytes(response, limit) {
  if (Number(response.headers.get('content-length')) > limit) throw new Error('Response too large')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Empty response')
  let size = 0
  const chunks = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new Error('Response too large')
      chunks.push(Buffer.from(value))
    }
  } finally { await reader.cancel().catch(() => {}) }
  return Buffer.concat(chunks)
}
export async function writePhoto(asset, bytes, fetcher = fetch) {
  if (asset.backend === 'local') {
    const file = localPath(asset.key)
    await mkdir(dirname(file), { recursive: true, mode: 0o700 })
    await writeFile(file, bytes, { flag: 'wx', mode: 0o600 })
    return
  }
  const config = storageConfig()
  try {
    const bucket = await fetcher(`${config.base}/storage/v1/bucket/${config.bucket}`, { headers: config.headers, signal: AbortSignal.timeout(15000), redirect: 'error' })
    if (!bucket.ok || JSON.parse((await boundedBytes(bucket, 64000)).toString()).public !== false) fail(503, 'Create a private Supabase farm-products bucket before uploading photos')
    const response = await fetcher(`${config.base}/storage/v1/object/${config.bucket}/${asset.key}`, { method: 'POST', headers: { ...config.headers, 'Content-Type': 'image/jpeg', 'x-upsert': 'false', 'Cache-Control': 'no-store' }, body: bytes, signal: AbortSignal.timeout(20000), redirect: 'error' })
    if (!response.ok) throw new Error('Storage upload failed')
    await response.body?.cancel()
  } catch (error) {
    if (error.statusCode === 503) throw error
    fail(503, 'Supabase photo upload is unavailable. Check the private bucket and server credentials.')
  }
}
export async function readPhoto(asset, fetcher = fetch) {
  try {
    if (asset.backend === 'local') {
      if (photoBackend() === 'supabase') fail(503, 'This older local photo must be uploaded to Supabase again')
      const bytes = await readFile(localPath(asset.key))
      if (bytes.length > MAX_STORED_BYTES) throw new Error('Invalid photo')
      return bytes
    }
    const config = storageConfig()
    const response = await fetcher(`${config.base}/storage/v1/object/authenticated/${config.bucket}/${asset.key}`, { headers: config.headers, signal: AbortSignal.timeout(20000), redirect: 'error' })
    if (!response.ok || !/^image\/jpeg(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('Photo unavailable')
    return await boundedBytes(response, MAX_STORED_BYTES)
  } catch { fail(503, 'Product photo is temporarily unavailable') }
}
export async function removePhoto(asset, fetcher = fetch) {
  if (asset.backend === 'local') { await unlink(localPath(asset.key)).catch(error => { if (error.code !== 'ENOENT') throw error }); return }
  const config = storageConfig()
  const response = await fetcher(`${config.base}/storage/v1/object/${config.bucket}`, { method: 'DELETE', headers: { ...config.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [asset.key] }), signal: AbortSignal.timeout(15000), redirect: 'error' })
  if (!response.ok) throw new Error('Photo cleanup failed')
  await response.body?.cancel()
}
export function newPhoto(ownerId, photo) {
  const id = randomUUID()
  return { id, ownerId, key: photoKey(ownerId, id), backend: photoBackend(), size: photo.bytes.length, width: photo.width, height: photo.height, createdAt: new Date().toISOString() }
}
export function visiblePhoto(data, id, ownerId) {
  const asset = imageRows(data).find(image => image.id === id)
  if (!asset) fail(404, 'Photo unavailable')
  if (ownerId === asset.ownerId) return asset
  const visibleFarm = data.marketplaceFarms?.some(farm => farm.ownerId === asset.ownerId && farm.published === true)
  const visibleProduct = data.marketplaceProducts?.some(product => product.ownerId === asset.ownerId && product.published === true && product.imageUrl === imageUrl(id))
  if (!visibleFarm || !visibleProduct) fail(404, 'Photo unavailable')
  return asset
}
