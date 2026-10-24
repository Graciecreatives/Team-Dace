import test from 'node:test'
import assert from 'node:assert/strict'
import { scryptSync } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

// Uses the actual auth helper bundled into workerd, not a Node-only algorithm probe.
test('Workers native crypto verifies legacy scrypt and new WebCrypto PBKDF2 hashes', async () => {
  const salt = 'ab'.repeat(16)
  const legacy = scryptSync('original-password', salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')
  const result = await build({
    stdin: {
      contents: `import { hashPassword, verifyPassword } from './server/utils/auth.js'
        export default { async fetch() {
          try {
            const salt = '${salt}'
            const passwordHash = await hashPassword('original-password', salt)
            return Response.json({
              pbkdf2: await verifyPassword('original-password', { salt, passwordHash }),
              wrong: await verifyPassword('wrong-password', { salt, passwordHash }),
              legacy: await verifyPassword('original-password', { salt, passwordHash: '${legacy}' }),
              legacyWrong: await verifyPassword('wrong-password', { salt, passwordHash: '${legacy}' }),
              passwordHash,
            })
          } catch (error) { return Response.json({ error: error.message }, { status: 503 }) }
        } }`,
      resolveDir: fileURLToPath(new URL('../../', import.meta.url)),
      sourcefile: 'auth-workers-entry.js',
    },
    bundle: true, write: false, format: 'esm', platform: 'neutral', external: ['node:*'],
  })
  const runtime = new Miniflare({ modules: true, script: result.outputFiles[0].text, compatibilityDate: '2026-06-01', compatibilityFlags: ['nodejs_compat'] })
  try {
    const response = await Promise.race([
      runtime.dispatchFetch('http://localhost/crypto'),
      new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Workers crypto probe timed out after 120 seconds')), 120000); timer.unref() }),
    ])
    const body = await response.json()
    assert.equal(response.status, 200, JSON.stringify(body))
    assert.deepEqual({ pbkdf2: body.pbkdf2, wrong: body.wrong, legacy: body.legacy, legacyWrong: body.legacyWrong }, { pbkdf2: true, wrong: false, legacy: true, legacyWrong: false })
    assert.match(body.passwordHash, /^pbkdf2-sha256\$100000\$[a-f0-9]{64}$/)
  } finally { await runtime.dispose() }
})
