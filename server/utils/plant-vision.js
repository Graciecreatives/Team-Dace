import { createError } from 'h3'
import { encodeProductPhoto } from './product-images.js'

export const PLANT_IMAGE_LIMIT = 3 * 1024 * 1024
const RESPONSE_LIMIT = 128 * 1024
const fail = (statusCode, statusMessage) => { throw createError({ statusCode, statusMessage }) }
const apiKey = () => process.env.PLANTNET_API_KEY?.trim()
export const plantVisionStatus = () => ({ configured: Boolean(apiKey()), provider: 'Pl@ntNet', animalSupported: false })
const clean = (value, max = 180) => typeof value === 'string' ? value.replace(/[<>\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : ''

// Bound decoded allocations even in local mode, before entering the shared codec.
function dimensions(bytes, mime) {
  if (mime === 'image/png') {
    if (bytes.length < 33 || bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a' || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error()
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
  }
  if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) throw new Error()
  for (let offset = 2; offset + 9 < bytes.length;) {
    if (bytes[offset++] !== 255) throw new Error()
    const marker = bytes[offset++]
    if (marker === 0xda || marker === 0xd9) break
    const length = bytes.readUInt16BE(offset)
    if (length < 2 || offset + length > bytes.length) throw new Error()
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)]
    offset += length
  }
  throw new Error()
}
export function validatePlantScan(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['task', 'image', 'images', 'organs', 'consent'].includes(key))) fail(400, 'Only task, image or images, organs and consent are accepted')
  if (!['disease', 'identify'].includes(input.task)) fail(400, 'Choose plant identification or plant disease screening')
  if (input.consent !== true) fail(400, 'Consent is required before sending this photo to Pl@ntNet')
  if (Object.hasOwn(input, 'image') && Object.hasOwn(input, 'images')) fail(400, 'Provide image or images, not both')
  const images = Object.hasOwn(input, 'images') ? input.images : [input.image]
  const maxImages = 5
  if (!Array.isArray(images) || !images.length || images.length > maxImages) fail(400, `Choose 1 to ${maxImages} photos of the same individual plant`)
  const organs = input.organs === undefined ? images.map(() => 'auto') : input.organs
  if (!Array.isArray(organs) || organs.length !== images.length || organs.some(organ => !['auto', 'leaf', 'flower', 'fruit', 'bark'].includes(organ))) fail(400, 'Provide one supported organ per photo: auto, leaf, flower, fruit or bark')
  let size = 0, pixels = 0
  return images.map((image, index) => {
    const parsed = validateImage(image)
    size += parsed.bytes.length
    if (size > PLANT_IMAGE_LIMIT) fail(413, 'Choose photos totaling at most 3 MB')
    pixels += parsed.width * parsed.height
    if (pixels > 8000000) fail(413, 'Choose photos totaling at most 8 megapixels')
    return { ...parsed, organ: organs[index] }
  })
}
function validateImage(image) {
  if (typeof image !== 'string') fail(400, 'Choose a JPEG or PNG photo')
  if (image.length > PLANT_IMAGE_LIMIT * 4 / 3 + 40) fail(413, 'Choose a photo up to 3 MB')
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image)
  if (!match || match[2].length % 4) fail(400, 'Invalid image data')
  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.length || bytes.length > PLANT_IMAGE_LIMIT || bytes.toString('base64') !== match[2]) fail(400, 'Invalid image data')
  let width, height
  try { [width, height] = dimensions(bytes, match[1]) } catch { fail(400, 'Photo contents do not match a valid JPEG or PNG') }
  if (!width || !height || width * height > 4000000 || width > 8000 || height > 8000) fail(413, 'Choose a photo under 4 megapixels')
  return { bytes, mime: match[1], width, height }
}
async function responseJSON(response, limit = RESPONSE_LIMIT) {
  if (Number(response.headers.get('content-length')) > limit) throw new Error()
  const reader = response.body?.getReader()
  if (!reader) throw new Error()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new Error()
      chunks.push(Buffer.from(value))
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } finally { await reader.cancel().catch(() => {}) }
}
function resultsFor(result, task, labels = new Map()) {
  if (!Array.isArray(result.results)) throw new Error()
  return result.results.slice(0, 20).flatMap(item => {
    if (!item || typeof item.score !== 'number' || !Number.isFinite(item.score) || item.score < 0 || item.score > 1) return []
    if (task === 'disease') {
      const code = clean(item.name, 32)
      if (!/^[A-Z0-9]+$/.test(code)) return []
      return [{ name: clean(item.description) || labels.get(code) || code, code, score: item.score }]
    }
    const scientificName = clean(item.species?.scientificNameWithoutAuthor)
    if (!scientificName) return []
    const commonNames = Array.isArray(item.species?.commonNames) ? item.species.commonNames.slice(0, 3).map(name => clean(name)).filter(Boolean) : []
    const genus = clean(item.species?.genus?.scientificNameWithoutAuthor)
    const family = clean(item.species?.family?.scientificNameWithoutAuthor)
    return [{ name: commonNames[0] || scientificName, scientificName, commonNames, ...(genus ? { genus } : {}), ...(family ? { family } : {}), score: item.score }]
  }).sort((a, b) => b.score - a.score).slice(0, 3)
}
// A single bounded catalogue, never keyed by user, photo or private API key.
// Failed refreshes fall back to explicit EPPO codes instead of invented labels.
let catalogue
async function diseaseLabels(fetcher) {
  const now = Date.now()
  if (catalogue?.fetcher === fetcher && catalogue.until > now) return catalogue.pending || catalogue.labels
  const entry = { fetcher, until: now + 60000, labels: new Map() }
  catalogue = entry
  entry.pending = (async () => {
    try {
      const url = new URL('https://my-api.plantnet.org/v2/diseases')
      url.search = new URLSearchParams({ 'api-key': apiKey(), lang: 'en' }).toString()
      const response = await fetcher(url.toString(), { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5000) })
      if (!response.ok) throw new Error()
      const rows = await responseJSON(response, 256 * 1024)
      if (!Array.isArray(rows) || rows.length > 2000) throw new Error()
      for (const row of rows) {
        const code = clean(row?.name, 32), label = clean(row?.label)
        if (/^[A-Z0-9]+$/.test(code) && label) entry.labels.set(code, label)
      }
      entry.until = Date.now() + 60 * 60 * 1000
    } catch { /* Unavailable labels do not invalidate an otherwise valid scan. */ }
    finally { entry.pending = undefined }
    return entry.labels
  })()
  return entry.pending
}
export async function scanPlant(input, fetcher = fetch) {
  const images = validatePlantScan(input)
  if (!apiKey()) fail(503, 'Plant scanning is not configured. Ask the administrator to configure PLANTNET_API_KEY.')
  // The existing portable Rust/WASM codec really decodes, normalizes orientation,
  // strips metadata and re-encodes. No source image or derivative is persisted.
  const form = new FormData()
  // Decode sequentially without retaining multiple decoded RGBA buffers.
  for (const image of images) {
    const photo = await encodeProductPhoto(image.bytes, image.mime)
    form.append('images', new Blob([photo.bytes], { type: 'image/jpeg' }), 'plant.jpg')
    form.append('organs', image.organ)
  }
  const url = new URL(input.task === 'disease' ? 'https://my-api.plantnet.org/v2/diseases/identify' : 'https://my-api.plantnet.org/v2/identify/all')
  url.search = new URLSearchParams({ 'api-key': apiKey(), lang: 'en', 'nb-results': '3', 'include-related-images': 'false' }).toString()
  let stage = 'request'
  let providerStatus
  try {
    // Workers rejects redirect:error before sending. Manual keeps 3xx responses
    // visible so the non-2xx check rejects them without forwarding a photo or key.
    const response = await fetcher(url.toString(), { method: 'POST', body: form, redirect: 'manual', signal: AbortSignal.timeout(20000) })
    providerStatus = response.status
    stage = 'http-status'
    // Preserve provider rejection. Never enable no-reject and never fall back to an LLM.
    if ([400, 404, 422].includes(response.status)) fail(422, 'Pl@ntNet could not identify a supported plant or disease in this photo. Try a clear photo of one plant.')
    if (!response.ok) throw new Error()
    stage = 'response-json'
    const result = await responseJSON(response)
    stage = 'normalize-results'
    const labels = input.task === 'disease' && Array.isArray(result.results) && result.results.some(item => !clean(item?.description)) ? await diseaseLabels(fetcher) : new Map()
    const candidates = resultsFor(result, input.task, labels)
    return { task: input.task, provider: 'Pl@ntNet', animalSupported: false, status: candidates.length ? 'suggestions' : 'no-match', candidates, ...(clean(result.version, 80) ? { version: clean(result.version, 80) } : {}), scoreLabel: 'Model score', notice: 'Model scores are not diagnostic probabilities. Plant disease support is limited. A photo cannot confirm a diagnosis. Verify with a qualified local agronomist. Never eat a plant based on this result.' }
  } catch (error) {
    if (error.statusCode === 422) throw error
    // Never log the provider URL, raw error, key, photo or response body.
    console.warn('plant_scan_failed', { stage, ...(providerStatus ? { providerStatus } : {}) })
    fail(502, 'Pl@ntNet is unavailable. Please try again later or ask the administrator to check provider access and quota.')
  }
}
