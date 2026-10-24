import { createError } from 'h3'
import { encodeProductPhoto } from './product-images.js'

export const ANIMAL_IMAGE_LIMIT = 3 * 1024 * 1024
const RESPONSE_LIMIT = 128 * 1024
const MODEL = 'cattle-disease-detection/1'
const identity = { provider: 'Roboflow', experimental: true, animal: 'cattle', model: MODEL }
// Verified 2026-10-24 against the public Universe model page. The requested
// raghul-3h7h5 URL redirects to this owner. No inference or private metadata call.
export const ANIMAL_MODEL_PROVENANCE = Object.freeze({
  source: 'https://universe.roboflow.com/raghul-3h7h5/cattle-disease-detection',
  resolvedSource: 'https://universe.roboflow.com/jhonpauls-workspace/cattle-disease-detection',
  license: 'CC BY 4.0', images: 51, verified: '2026-10-24',
  classes: Object.freeze(['Healthy', 'lumpy', 'objects'])
})
// Expose only the documented positive class, without claiming its box locates
// a lesion or confirms the named disease. Healthy/objects are never findings.
const lesionClasses = new Set(['lumpy'])
const notice = 'Experimental cattle photo-pattern screening, not a validated diagnosis or cattle identification. Source: Jhonpauls Workspace, Cattle Disease Detection, Roboflow Universe, CC BY 4.0, 51 images. Highlighted areas may include the whole animal, not a precisely located lesion, and do not confirm lumpy skin disease. No regions does not mean healthy. Model scores are not diagnostic probabilities. Consult a veterinarian for concerns.'
const fail = (statusCode, statusMessage) => { throw createError({ statusCode, statusMessage }) }
const apiKey = () => process.env.ROBOFLOW_API_KEY?.trim()
export const animalVisionStatus = () => ({ configured: Boolean(apiKey()) && process.env.FARMBUDDY_EXPERIMENTAL_ANIMAL_SCAN === 'true', ...identity })

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
export function validateAnimalScan(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['image', 'animal'].includes(key))) fail(400, 'Only image and animal are accepted')
  if (input.animal !== 'cattle') fail(400, 'Only experimental cattle screening is supported')
  if (typeof input.image !== 'string') fail(400, 'Choose a JPEG or PNG photo')
  if (input.image.length > ANIMAL_IMAGE_LIMIT * 4 / 3 + 40) fail(413, 'Choose a photo up to 3 MB')
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(input.image)
  if (!match || match[2].length % 4) fail(400, 'Invalid image data')
  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.length || bytes.length > ANIMAL_IMAGE_LIMIT || bytes.toString('base64') !== match[2]) fail(400, 'Invalid image data')
  let width, height
  try { [width, height] = dimensions(bytes, match[1]) } catch { fail(400, 'Photo contents do not match a valid JPEG or PNG') }
  if (!width || !height || width * height > 4000000 || width > 8000 || height > 8000) fail(413, 'Choose a photo under 4 megapixels')
  return { bytes, mime: match[1] }
}
async function responseJSON(response) {
  if (Number(response.headers.get('content-length')) > RESPONSE_LIMIT) throw new Error()
  const reader = response.body?.getReader()
  if (!reader) throw new Error()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > RESPONSE_LIMIT) throw new Error()
      chunks.push(Buffer.from(value))
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } finally { await reader.cancel().catch(() => {}) }
}
export function normalizeAnimalRegions(result) {
  const width = result?.image?.width
  const height = result?.image?.height
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > 8000 || height > 8000 || width * height > 4000000 || !Array.isArray(result.predictions)) throw new Error('Invalid provider response')
  const regions = []
  for (const item of result.predictions) {
    if (!item || typeof item.class !== 'string' || !['confidence', 'x', 'y', 'width', 'height'].every(key => typeof item[key] === 'number' && Number.isFinite(item[key])) || item.confidence < 0 || item.confidence > 1 || item.width <= 0 || item.height <= 0) throw new Error('Invalid provider prediction')
    const left = Math.max(0, item.x - item.width / 2)
    const top = Math.max(0, item.y - item.height / 2)
    const right = Math.min(width, item.x + item.width / 2)
    const bottom = Math.min(height, item.y + item.height / 2)
    if (right <= left || bottom <= top || !lesionClasses.has(item.class)) continue
    if (regions.length < 20) regions.push({ label: 'Model-highlighted area', score: item.confidence, box: { left: left / width, top: top / height, width: (right - left) / width, height: (bottom - top) / height } })
  }
  return regions
}
export async function scanAnimal(input, fetcher = fetch) {
  const image = validateAnimalScan(input)
  if (!animalVisionStatus().configured) fail(503, 'Experimental animal scanning is not configured')
  // Actual shared decoder re-encodes JPEG, strips metadata and normalizes orientation.
  const photo = await encodeProductPhoto(image.bytes, image.mime)
  if (photo.bytes.length > ANIMAL_IMAGE_LIMIT) fail(413, 'Choose a smaller photo up to 3 MB')
  const url = new URL(`https://serverless.roboflow.com/${MODEL}`)
  url.searchParams.set('api_key', apiKey())
  try {
    const response = await fetcher(url.toString(), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: Buffer.from(photo.bytes).toString('base64'), redirect: 'error', signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error()
    const regions = normalizeAnimalRegions(await responseJSON(response))
    return { ...identity, status: regions.length ? 'regions' : 'no-regions', regions, notice }
  } catch {
    fail(502, 'Animal scanning is unavailable. Please try again later.')
  }
}
