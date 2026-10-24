import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
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
  if (mode && !['local', 'cloudflare'].includes(mode)) fail(503, 'Product photo storage is misconfigured')
  let cloud
  try { cloud = databaseMode() === 'cloudflare' } catch { fail(503, 'Product photo database is misconfigured') }
  if (mode === 'local' && cloud) fail(503, 'Cloudflare database mode requires private R2 photo storage')
  return mode || (cloud ? 'cloudflare' : 'local')
}
async function imageBucket() {
  if (photoBackend() !== 'cloudflare') fail(503, 'Private R2 photo storage is not configured')
  try {
    // Bindings are never obtained from process.env or exposed in browser URLs.
    const { env } = await import('cloudflare:workers')
    const bucket = env.FARMBUDDY_IMAGES
    if (!bucket?.put || !bucket?.get || !bucket?.delete) throw new Error()
    return bucket
  } catch { fail(503, 'Private R2 photo storage is unavailable') }
}
function validKey(key) {
  if (!/^[a-f0-9]{32}\/[a-f0-9-]{36}\.jpg$/.test(key)) fail(404, 'Photo unavailable')
  return key
}
function localPath(key) {
  validKey(key)
  const base = process.env.FARMBUDDY_UPLOAD_DIR || resolve(dirname(process.env.FARMBUDDY_DATA_FILE || '.data/farmbuddy.json'), 'uploads')
  return resolve(base, key)
}
export function photoKey(ownerId, id) { return `${createHash('sha256').update(ownerId).digest('hex').slice(0, 32)}/${id}.jpg` }

// Read dimensions before WASM allocates decoded pixels. A 40MP image is unsafe
// inside a 128MB Worker. Cloud uploads are limited to 4MP, local uploads to 40MP.
function imageHeader(bytes, type) {
  let width, height, orientation = 1
  if (type === 'image/png') {
    if (bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error()
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20)
  } else if (type === 'image/jpeg') {
    for (let offset = 2; offset + 4 < bytes.length;) {
      if (bytes[offset++] !== 255) throw new Error()
      const marker = bytes[offset++]
      if (marker === 0xda || marker === 0xd9) break
      const length = bytes.readUInt16BE(offset)
      if (length < 2 || offset + length > bytes.length) throw new Error()
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (width || height) throw new Error()
        height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5)
      }
      if (marker === 0xe1 && bytes.toString('ascii', offset + 2, offset + 8) === 'Exif\0\0') {
        const tiff = bytes.subarray(offset + 8, offset + length)
        const little = tiff.toString('ascii', 0, 2) === 'II'
        const u16 = at => little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at)
        const u32 = at => little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at)
        if (u16(2) !== 42) throw new Error()
        const start = u32(4), count = u16(start)
        for (let i = 0; i < count; i++) {
          const at = start + 2 + 12 * i
          if (u16(at) === 0x112 && u16(at + 2) === 3 && u32(at + 4) === 1) orientation = u16(at + 8)
        }
      }
      offset += length
    }
  } else {
    // VP8X/VP8L/VP8 dimensions. Reject malformed or unsupported containers.
    let frame = false
    if (bytes.readUInt32LE(4) + 8 !== bytes.length) throw new Error()
    for (let at = 12; at + 8 <= bytes.length;) {
      const chunk = bytes.toString('ascii', at, at + 4), length = bytes.readUInt32LE(at + 4)
      const start = at + 8
      if (start + length > bytes.length) throw new Error()
      let w, h
      if (chunk === 'ANIM' || chunk === 'ANMF') throw new Error()
      if (chunk === 'VP8X') {
        if (length !== 10 || (bytes[start] & 2)) throw new Error()
        w = 1 + bytes.readUIntLE(start + 4, 3); h = 1 + bytes.readUIntLE(start + 7, 3)
      } else if (chunk === 'VP8L' || chunk === 'VP8 ') {
        if (frame) throw new Error()
        frame = true
        if (chunk === 'VP8L' && bytes[start] === 0x2f) {
          const bits = bytes.readUInt32LE(start + 1)
          w = (bits & 0x3fff) + 1; h = ((bits >>> 14) & 0x3fff) + 1
        } else if (chunk === 'VP8 ' && bytes.toString('hex', start + 3, start + 6) === '9d012a') {
          w = bytes.readUInt16LE(start + 6) & 0x3fff; h = bytes.readUInt16LE(start + 8) & 0x3fff
        } else throw new Error()
      }
      if (w !== undefined) {
        if (width && (width !== w || height !== h)) throw new Error()
        width = w; height = h
      }
      at = start + length + (length % 2)
    }
    if (!frame) throw new Error()
  }
  if (!width || !height || orientation < 1 || orientation > 8) throw new Error()
  return { width, height, orientation }
}
function orientedPixels(pixels, width, height, orientation) {
  const swap = orientation >= 5, outWidth = swap ? height : width, outHeight = swap ? width : height
  const output = new Uint8Array(pixels.length)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let dx = x, dy = y
    if (orientation === 2) dx = width - 1 - x
    else if (orientation === 3) { dx = width - 1 - x; dy = height - 1 - y }
    else if (orientation === 4) dy = height - 1 - y
    else if (orientation === 5) { dx = y; dy = x }
    else if (orientation === 6) { dx = height - 1 - y; dy = x }
    else if (orientation === 7) { dx = height - 1 - y; dy = width - 1 - x }
    else if (orientation === 8) { dx = y; dy = width - 1 - x }
    const src = (y * width + x) * 4, dst = (dy * outWidth + dx) * 4
    const alpha = pixels[src + 3] / 255
    for (let c = 0; c < 3; c++) output[dst+c] = Math.round(pixels[src+c] * alpha + 255 * (1-alpha))
    output[dst+3] = 255
  }
  return { pixels: output, width: outWidth, height: outHeight }
}
export async function encodeProductPhoto(bytes, contentType) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_PHOTO_BYTES) fail(413, 'Choose a photo up to 8 MB')
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  const expected = jpeg ? 'image/jpeg' : png ? 'image/png' : webp ? 'image/webp' : ''
  if (!expected || contentType !== expected) fail(415, 'Use a JPEG, PNG or WebP photo. Export HEIC photos as JPEG first.')
  const cloud = photoBackend() === 'cloudflare'
  let input, resized, output
  try {
    const header = imageHeader(bytes, expected)
    if (header.width * header.height > (cloud ? 4000000 : 40000000)) fail(413, cloud ? 'Choose a photo under 4 megapixels for upload' : 'Choose a photo under 40 megapixels')
    // Both entrypoints use real Rust decoding and encoding, no native sharp code.
    const photon = cloud ? await import('./product-photon.js') : await import('@cf-wasm/photon/node')
    input = photon.PhotonImage.new_from_byteslice(bytes)
    if (input.get_width() !== header.width || input.get_height() !== header.height) throw new Error()
    const scale = Math.min(1, 1600 / header.width, 1600 / header.height)
    resized = photon.resize(input, Math.max(1, Math.round(header.width * scale)), Math.max(1, Math.round(header.height * scale)), photon.SamplingFilter.Lanczos3)
    input.free()
    input = undefined
    const normalized = orientedPixels(resized.get_raw_pixels(), resized.get_width(), resized.get_height(), header.orientation)
    resized.free()
    resized = undefined
    output = new photon.PhotonImage(normalized.pixels, normalized.width, normalized.height)
    // A fresh image from RGBA has no EXIF, GPS, ICC, comments or source chunks.
    const data = Buffer.from(output.get_bytes_jpeg(85))
    if (!data.length || data.length > MAX_STORED_BYTES) fail(413, 'Photo could not be reduced safely. Choose a smaller image.')
    return { bytes: data, width: normalized.width, height: normalized.height }
  } catch (error) {
    if (error.statusCode === 413) throw error
    fail(415, 'This photo could not be decoded safely. Use a JPEG, PNG or WebP photo.')
  } finally { output?.free(); resized?.free(); input?.free() }
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
export async function writePhoto(asset, bytes) {
  if (asset.backend === 'local') {
    if (photoBackend() !== 'local') fail(503, 'Local photos are unavailable in Cloudflare mode')
    const file = localPath(asset.key)
    await mkdir(dirname(file), { recursive: true, mode: 0o700 })
    await writeFile(file, bytes, { flag: 'wx', mode: 0o600 })
    return
  }
  if (asset.backend !== 'cloudflare') fail(503, 'Photo storage requires migration')
  try {
    const bucket = await imageBucket()
    const result = await bucket.put(validKey(asset.key), bytes, { httpMetadata: { contentType: 'image/jpeg', cacheControl: 'no-store' }, onlyIf: { etagDoesNotMatch: '*' } })
    if (!result) throw new Error()
  } catch { fail(503, 'Private R2 photo upload is unavailable') }
}
export async function readPhoto(asset) {
  try {
    if (asset.backend === 'local') {
      if (photoBackend() !== 'local') throw new Error()
      const bytes = await readFile(localPath(asset.key))
      if (bytes.length > MAX_STORED_BYTES) throw new Error()
      return bytes
    }
    if (asset.backend !== 'cloudflare') throw new Error()
    const object = await (await imageBucket()).get(validKey(asset.key))
    if (!object || object.size > MAX_STORED_BYTES || object.httpMetadata?.contentType !== 'image/jpeg') throw new Error()
    return await boundedBytes(new Response(object.body), MAX_STORED_BYTES)
  } catch { fail(503, 'Product photo is temporarily unavailable') }
}
export async function removePhoto(asset) {
  if (asset.backend === 'local') {
    if (photoBackend() !== 'local') fail(503, 'Local photos are unavailable in Cloudflare mode')
    await unlink(localPath(asset.key)).catch(error => { if (error.code !== 'ENOENT') throw error }); return
  }
  if (asset.backend !== 'cloudflare') fail(503, 'Photo storage requires migration')
  try { await (await imageBucket()).delete(validKey(asset.key)) }
  catch { fail(503, 'Photo cleanup failed') }
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
