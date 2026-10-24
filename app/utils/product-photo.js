export const MAX_PHONE_PHOTO_BYTES = 20 * 1024 * 1024
export const MAX_UPLOAD_PHOTO_BYTES = 4 * 1024 * 1024
export const PHOTO_EDGE = 1600
const formats = ['image/jpeg', 'image/png', 'image/webp']
const aborted = () => new DOMException('Photo preparation cancelled', 'AbortError')
function checkSignal(signal) { if (signal?.aborted) throw aborted() }

export function photoDimensions(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > 40000000) throw new Error('Choose a photo under 40 megapixels.')
  const scale = Math.min(1, PHOTO_EDGE / width, PHOTO_EDGE / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

// Browser decoding applies phone EXIF orientation. Drawing into a new canvas
// removes source metadata before upload. The server still decodes and re-encodes
// independently, because client preparation is not a security boundary.
export async function prepareProductPhoto(file, { signal, platform = globalThis } = {}) {
  checkSignal(signal)
  if (!file || !formats.includes(file.type)) throw new Error('Choose JPEG, PNG or WebP. Export HEIC photos as JPEG first.')
  if (!file.size || file.size > MAX_PHONE_PHOTO_BYTES) throw new Error('Choose a photo up to 20 MB.')
  const image = new platform.Image()
  const url = platform.URL.createObjectURL(file)
  let canvas
  try {
    await new Promise((resolve, reject) => {
      const cleanup = () => { image.onload = null; image.onerror = null; signal?.removeEventListener('abort', cancel) }
      const cancel = () => { cleanup(); image.src = ''; reject(aborted()) }
      image.onload = () => { cleanup(); resolve() }
      image.onerror = () => { cleanup(); reject(new Error('This photo could not be opened. Export it as JPEG and try again.')) }
      signal?.addEventListener('abort', cancel, { once: true })
      image.src = url
      if (signal?.aborted) cancel()
    })
    checkSignal(signal)
    const dimensions = photoDimensions(image.naturalWidth, image.naturalHeight)
    canvas = platform.document.createElement('canvas')
    canvas.width = dimensions.width
    canvas.height = dimensions.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Your browser cannot prepare photos. Try a different browser.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not prepare this photo. Choose another picture.')), 'image/jpeg', 0.85)
    })
    checkSignal(signal)
    if (blob.type !== 'image/jpeg' || !blob.size || blob.size > MAX_UPLOAD_PHOTO_BYTES) throw new Error('Photo could not be reduced safely. Choose a smaller picture.')
    return blob
  } finally {
    platform.URL.revokeObjectURL(url)
    image.src = ''
    // Release backing pixel memory promptly on memory-constrained phones.
    if (canvas) { canvas.width = 0; canvas.height = 0 }
  }
}
