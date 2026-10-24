import { scrypt, timingSafeEqual, webcrypto } from 'node:crypto'
import { createError } from 'h3'

// scrypt N=2^14, r=8, p=5 keeps memory bounded (~16 MiB per derivation)
// while increasing work relative to legacy p=1. Supported natively in Workers.
const prefix = 'scrypt$16384$8$5$'
const oldPbkdf2Prefix = 'pbkdf2-sha256$100000$'
let activeHashes = 0
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Password verification is unavailable in this runtime. Existing credentials have not been changed.' })

export function authConfig(env = process.env) {
  const mode = env.FARMBUDDY_AUTH || (env.FARMBUDDY_DATABASE === 'cloudflare' ? 'cloudflare' : 'local')
  return { mode, configured: ['local', 'cloudflare'].includes(mode) }
}
export function passwordNeedsUpgrade(hash) { return typeof hash !== 'string' || !hash.startsWith(prefix) }

async function bounded(operation) {
  if (activeHashes >= 4) throw createError({ statusCode: 429, statusMessage: 'Authentication temporarily busy' })
  activeHashes++
  try { return await operation() } finally { activeHashes-- }
}
async function deriveScrypt(password, salt, p) {
  try {
    return await new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 16384, r: 8, p }, (error, value) => error ? reject(error) : resolve(value)))
  } catch { throw unavailable() }
}
async function oldPbkdf2(password, salt) {
  const subtle = (globalThis.crypto || webcrypto).subtle
  const encoder = new TextEncoder()
  const key = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  return Buffer.from(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100000 }, key, 256))
}
export async function hashPassword(password, salt) {
  return bounded(async () => prefix + (await deriveScrypt(password, salt, 5)).toString('hex'))
}
export async function verifyPassword(password, user) {
  return bounded(async () => {
    const stored = user?.passwordHash
    const salt = user?.salt
    if (typeof stored === 'string' && /^[a-f0-9]{32}$/.test(salt || '')) {
      if (stored.startsWith(prefix) && /^[a-f0-9]{128}$/.test(stored.slice(prefix.length))) {
        return timingSafeEqual(await deriveScrypt(password, salt, 5), Buffer.from(stored.slice(prefix.length), 'hex'))
      }
      if (stored.startsWith(oldPbkdf2Prefix) && /^[a-f0-9]{64}$/.test(stored.slice(oldPbkdf2Prefix.length))) {
        return timingSafeEqual(await oldPbkdf2(password, salt), Buffer.from(stored.slice(oldPbkdf2Prefix.length), 'hex'))
      }
      if (/^[a-f0-9]{128}$/.test(stored)) {
        // Original parameters and string salt must remain unchanged for compatibility.
        return timingSafeEqual(await deriveScrypt(password, salt, 1), Buffer.from(stored, 'hex'))
      }
    }
    // Unknown users and malformed hashes incur the current password derivation.
    await deriveScrypt(password, '00000000000000000000000000000000', 5)
    return false
  })
}
