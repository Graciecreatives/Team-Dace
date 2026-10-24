import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createDatabaseStore, databaseMode, emptySnapshot, validateSnapshot, connectDatabase } from '../server/utils/database.js'
import '../server/tests/database-d1.mjs'

test('mode selection is explicit and Cloudflare import never runs in local mode', async () => {
  assert.equal(databaseMode({}), 'local')
  assert.equal(databaseMode({ SUPABASE_DATABASE_URL: 'ignored' }), 'local')
  assert.equal(databaseMode({ FARMBUDDY_DATABASE: 'cloudflare' }), 'cloudflare')
  for (const mode of ['supabase', 'postgres', 'other']) assert.throws(() => databaseMode({ FARMBUDDY_DATABASE: mode }), /mode/)
  await assert.rejects(connectDatabase(), /FARMBUDDY_DB unavailable/)
})

test('legacy optional collection upgrade retains unknown data', () => {
  const snapshot = { version: 1, users: [], sessions: [], records: [], reminders: [], future: { preserved: true } }
  assert.equal(validateSnapshot(snapshot), snapshot)
  assert.deepEqual(snapshot.notes, [])
  assert.deepEqual(snapshot.future, { preserved: true })
  for (const key of Object.keys(emptySnapshot()).filter(key => key !== 'version')) {
    for (const invalid of [null, {}, 'bad', 1]) assert.throws(() => validateSnapshot({ ...emptySnapshot(), [key]: invalid }))
  }
})

test('unavailable driver and ambiguous writes are sanitized and never retried', async () => {
  let calls = 0
  const secret = new Error('private SQL snapshot password')
  for (const writeFailure of [false, true]) {
    const db = { withSession() { return { prepare() { return {
      async first() { if (!writeFailure) throw secret; return { snapshot: JSON.stringify(emptySnapshot()), revision: 0 } },
      bind() { return this }, async run() { throw secret },
    } } } } }
    const before = calls
    await assert.rejects(createDatabaseStore(db)(() => { calls++ }, true), error => error.message === 'FarmBuddy database unavailable or not initialized' && !error.cause)
    assert.equal(calls - before, writeFailure ? 1 : 0)
  }
})

test('CLI dry run and exclusive private output never alter source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'farmbuddy-db-cli-'))
  try {
    const file = join(dir, 'source.json'), out = join(dir, 'import.sql')
    const source = JSON.stringify(emptySnapshot())
    await writeFile(file, source)
    const run = (...flags) => spawnSync(process.execPath, ['scripts/cloudflare-database.mjs', 'import', `--file=${file}`, ...flags], { encoding: 'utf8' })
    const dry = run()
    assert.equal(dry.status, 0, dry.stderr)
    assert.match(dry.stdout, /No database connection or writes/)
    assert.equal(run(`--out=${out}`).status, 0)
    assert.equal((await stat(out)).mode & 0o777, 0o600)
    assert.equal(run(`--out=${out}`).status, 1)
    assert.equal(await readFile(file, 'utf8'), source)
    assert.equal(run(`--out=${file}`).status, 1)
    await writeFile(file, '{}')
    assert.equal(run().status, 1)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('cloud mode failure never creates local JSON or invokes callback', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'farmbuddy-db-fail-'))
  try {
    const file = join(dir, 'absent.json')
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import {store} from './server/utils/store.js'; try { await store(() => { throw new Error('callback executed') }, true); process.exitCode = 2 } catch(e) { console.log(e.message) }`], { env: { ...process.env, FARMBUDDY_DATABASE: 'cloudflare', FARMBUDDY_DATA_FILE: file }, encoding: 'utf8' })
    assert.equal(result.status, 0)
    assert.match(result.stdout, /FARMBUDDY_DB unavailable/)
    await assert.rejects(readFile(file), { code: 'ENOENT' })
  } finally { await rm(dir, { recursive: true, force: true }) }
})
