import { createError } from 'h3'

export const TRANSCRIBE_MODEL = '@cf/openai/whisper-large-v3-turbo'
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024
export const MAX_TRANSCRIBE_BODY = 3 * 1024 * 1024
const languages = new Set(['en', 'ha', 'yo', 'fr', 'sw'])
const fail = (statusCode, statusMessage) => { throw createError({ statusCode, statusMessage }) }

export function validateTranscription(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Expected an object')
  if (Object.keys(input).some(key => !['audio', 'language'].includes(key))) fail(400, 'Unknown transcription option')
  if (input.language !== undefined && !languages.has(input.language)) fail(400, 'Unsupported transcription language')
  if (typeof input.audio !== 'string') fail(400, 'Provide base64 audio')
  if (input.audio.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4 + 100) fail(413, 'Audio must be at most 2 MB')
  const match = /^data:audio\/(webm|ogg|mp4|wav);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input.audio)
  if (!match || match[2].length % 4) fail(400, 'Invalid audio data')
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.length > MAX_AUDIO_BYTES) fail(413, 'Audio must be at most 2 MB')
  if (!bytes.length || bytes.toString('base64') !== match[2]) fail(400, 'Invalid audio data')
  const ascii = (start, end) => bytes.toString('ascii', start, end)
  const valid = {
    webm: bytes.length >= 8 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
    ogg: bytes.length >= 27 && ascii(0, 4) === 'OggS' && bytes[4] === 0,
    mp4: bytes.length >= 16 && ascii(4, 8) === 'ftyp' && bytes.readUInt32BE(0) >= 16 && bytes.readUInt32BE(0) <= bytes.length,
    wav: bytes.length >= 44 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE'
  }[match[1]]
  if (!valid) fail(400, 'Audio contents do not match its type')
  return { audio: match[2], ...(input.language !== undefined ? { language: input.language } : {}) }
}

// Official Cloudflare model docs and Whisper chunking tutorial verified 2026-10-24:
// https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/
// https://developers.cloudflare.com/workers-ai/guides/tutorials/build-a-workers-ai-whisper-with-chunking/
// Native input is a base64 string, not the data URL or a number array. Language
// is an optional model parameter. Keep task fixed so dictation never translates.
export async function assistantTranscribe(input, env) {
  const options = validateTranscription(input)
  if (typeof env?.AI?.run !== 'function') fail(503, 'Speech transcription is not configured. Configure the Workers AI binding.')
  let timer
  try {
    // Native run has no documented cancellation option. This bounds waiting only.
    const result = await Promise.race([
      env.AI.run(TRANSCRIBE_MODEL, { ...options, task: 'transcribe' }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Transcription timeout')), 45000) })
    ])
    if (!result || result.error || typeof result.text !== 'string' || result.text.length > 128000) throw new Error('Invalid transcription')
    const text = result.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 4000)
    return { text }
  } catch { fail(502, 'Speech transcription is unavailable. Please try again later.') }
  finally { clearTimeout(timer) }
}
