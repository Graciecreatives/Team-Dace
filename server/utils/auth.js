import { scrypt, timingSafeEqual, webcrypto } from 'node:crypto'
import { createError } from 'h3'

// WebCrypto is native in Workers. Node's implementation keeps local development equivalent.
// Workers supports at most 100,000 PBKDF2 iterations. Version parameters are stored with each hash.
const iterations = 100000
const prefix = `pbkdf2-sha256$${iterations}$`
let activeHashes = 0
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Password verification is unavailable in this runtime. Existing credentials have not been changed.' })

export function authConfig(env = process.env) {
  const mode = env.FARMBUDDY_AUTH || (env.FARMBUDDY_DATABASE === 'cloudflare' ? 'cloudflare' : 'local')
  return { mode, configured: ['local', 'cloudflare'].includes(mode) }
}

async function bounded(operation) {
  if (activeHashes >= 4) throw createError({ statusCode: 429, statusMessage: 'Authentication temporarily busy' })
  activeHashes++
  try { return await operation() } finally { activeHashes-- }
}
async function pbkdf2(password, salt) {
  const subtle = (globalThis.crypto || webcrypto).subtle
  const encoder = new TextEncoder()
  const key = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations }, key, 256)
  return Buffer.from(bits)
}
export async function hashPassword(password, salt) {
  return bounded(async () => prefix + (await pbkdf2(password, salt)).toString('hex'))
}
export async function verifyPassword(password, user) {
  return bounded(async () => {
    const stored = user?.passwordHash
    const salt = user?.salt
    if (typeof stored === 'string' && /^[a-f0-9]{32}$/.test(salt || '')) {
      if (stored.startsWith(prefix) && /^[a-f0-9]{64}$/.test(stored.slice(prefix.length))) {
        return timingSafeEqual(await pbkdf2(password, salt), Buffer.from(stored.slice(prefix.length), 'hex'))
      }
      if (/^[a-f0-9]{128}$/.test(stored)) {
        // Keep the original scrypt parameters and string salt, not hex-decoded salt.
        // Never reinterpret a legacy hash as PBKDF2 or replace a password on failure.
        let derived
        try {
          derived = await new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, value) => error ? reject(error) : resolve(value)))
        } catch { throw unavailable() }
        return timingSafeEqual(derived, Buffer.from(stored, 'hex'))
      }
    }
    // Unknown users and malformed hashes still incur a password derivation.
    await pbkdf2(password, '00000000000000000000000000000000')
    return false
  })
}
