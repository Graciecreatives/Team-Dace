import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const secretScript = resolve('scripts/cloudflare-secrets.mjs')
test('Cloudflare production configuration binds private data and enforces production cookies', async () => {
  const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'))
  assert.equal(config.vars.NODE_ENV, 'production')
  assert.equal(config.vars.FARMBUDDY_DATABASE, 'cloudflare')
  assert.equal(config.vars.FARMBUDDY_IMAGE_STORAGE, 'cloudflare')
  assert.equal(config.d1_databases[0].binding, 'FARMBUDDY_DB')
  assert.equal(config.r2_buckets[0].binding, 'FARMBUDDY_IMAGES')
  assert.equal(config.ai.binding, 'AI')
  assert.equal(config.ai.remote, true)
  assert.equal(config.vars.FARMBUDDY_AI_MODEL, '@cf/qwen/qwen3-30b-a3b-fp8')
  assert.ok(config.compatibility_flags.includes('nodejs_compat'))
  const pkg = JSON.parse(await readFile('package.json', 'utf8'))
  assert.equal(pkg.dependencies['@supabase/supabase-js'], undefined)
  assert.equal(pkg.dependencies.postgres, undefined)
  assert.equal(pkg.dependencies.sharp, undefined)
  assert.ok(pkg.dependencies['@cf-wasm/photon'])
})
test('provider configuration only writes allowed private local values and never prints secrets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'farmbuddy-cf-config-'))
  const fake = 'not-a-real-secret-for-isolated-test'
  const env = { ...process.env, PLANTNET_API_KEY: '', ROBOFLOW_API_KEY: '', FARMBUDDY_EXPERIMENTAL_ANIMAL_SCAN: '', YARNGPT_API_KEY: '', YARNGPT_VOICE: '', OPENWEATHER_API_KEY: '' }
  try {
    await writeFile(join(dir, '.env'), `PLANTNET_API_KEY=${fake}\nUNSUPPORTED_PROVIDER_KEY=obsolete-do-not-copy\nUNRELATED_PRIVATE_VALUE=must-not-copy\nFARMBUDDY_DATABASE=local\n`)
    const dry = spawnSync(process.execPath, [secretScript], { cwd: dir, env, encoding: 'utf8' })
    assert.equal(dry.status, 0)
    assert.match(dry.stdout, /PLANTNET_API_KEY/)
    assert.ok(!dry.stdout.includes(fake))
    await assert.rejects(stat(join(dir, '.dev.vars')), { code: 'ENOENT' })
    const local = spawnSync(process.execPath, [secretScript, '--local'], { cwd: dir, env, encoding: 'utf8' })
    assert.equal(local.status, 0, local.stderr)
    assert.ok(!local.stdout.includes(fake))
    const text = await readFile(join(dir, '.dev.vars'), 'utf8')
    assert.ok(text.includes(fake))
    assert.ok(!text.includes('must-not-copy'))
    assert.ok(!text.includes('obsolete-do-not-copy'))
    assert.match(text, /FARMBUDDY_AI_MODEL="@cf\/qwen\/qwen3-30b-a3b-fp8"/)
    assert.match(text, /FARMBUDDY_DATABASE="cloudflare"/)
    assert.match(text, /NODE_ENV="development"/)
    assert.equal((await stat(join(dir, '.dev.vars'))).mode & 0o777, 0o600)
    assert.equal(spawnSync(process.execPath, [secretScript, '--apply', '--local'], { cwd: dir, env }).status, 1)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
