import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createDatabaseStore, databaseMode, emptySnapshot, validateSnapshot, connectDatabase } from '../server/utils/database.js'
import { importSnapshot } from '../scripts/supabase-database.mjs'

function fakeDatabase(initial = emptySnapshot(), failure = false) {
  let state = structuredClone(initial)
  let queue = Promise.resolve()
  let writes = 0
  const sql = { begin(callback) {
    const task = queue.then(async () => {
      let next = structuredClone(state)
      const tx = async (strings, ...values) => {
        if (failure) throw new Error('postgres://secret-password@private.example/secret')
        const query = strings.join('?')
        if (query.includes('SELECT snapshot')) return [{ snapshot: structuredClone(next) }]
        if (query.includes('UPDATE')) { writes++; next = structuredClone(values[0]) }
        return []
      }
      tx.json = value => value
      const result = await callback(tx)
      state = next
      return result
    })
    queue = task.catch(() => {})
    return task
  } }
  return { sql, state: () => state, writes: () => writes }
}

test('mode defaults, explicit local and fail-closed configuration', async () => {
  assert.equal(databaseMode({}), 'local')
  assert.equal(databaseMode({ SUPABASE_DATABASE_URL: 'present' }), 'supabase')
  assert.equal(databaseMode({ FARMBUDDY_DATABASE: 'local', SUPABASE_DATABASE_URL: 'present' }), 'local')
  assert.throws(() => databaseMode({ FARMBUDDY_DATABASE: 'other' }), /mode/)
  assert.throws(() => databaseMode({ FARMBUDDY_DATABASE: 'supabase' }), /required/)
  await assert.rejects(connectDatabase({ SUPABASE_DATABASE_URL: 'secret-invalid-url' }), error => !error.message.includes('secret-invalid-url'))
})

test('connection configuration requires verified TLS and bounded transaction-pooler options', async () => {
  const sql = await connectDatabase({ SUPABASE_DATABASE_URL: 'postgres://user:password@localhost:55439/db?sslmode=disable&max=999&prepare=true' })
  try {
    assert.deepEqual(sql.options.ssl, { rejectUnauthorized: true })
    assert.equal(sql.options.max, 3)
    assert.equal(sql.options.prepare, false)
    assert.equal(sql.options.connect_timeout, 10)
  } finally { await sql.end({ timeout: 1 }) }
})

test('snapshot upgrades optional collections without dropping fields', () => {
  const snapshot = { version: 1, users: [], sessions: [], records: [], reminders: [], future: { keep: true } }
  assert.equal(validateSnapshot(snapshot), snapshot)
  assert.deepEqual(snapshot.notes, [])
  assert.deepEqual(snapshot.future, { keep: true })
  for (const data of [null, {}, { ...emptySnapshot(), version: 2 }, { ...emptySnapshot(), users: {} }]) assert.throws(() => validateSnapshot(data))
})

test('independent adapters serialize callbacks without reexecution', async () => {
  const db = fakeDatabase()
  const stores = [createDatabaseStore(db.sql), createDatabaseStore(db.sql)]
  let calls = 0
  await Promise.all(Array.from({ length: 30 }, (_, index) => stores[index % 2](async data => {
    calls++
    await new Promise(resolve => setTimeout(resolve, 1))
    data.notes.push(index)
  }, true)))
  assert.equal(calls, 30)
  assert.equal(db.state().notes.length, 30)
  assert.equal(db.writes(), 30)
})

test('reads discard changes and callback errors roll back without poisoning next task', async () => {
  const db = fakeDatabase()
  const store = createDatabaseStore(db.sql)
  assert.equal(await store(data => { data.notes.push('discard'); return 42 }), 42)
  const expected = new Error('Application validation error')
  await assert.rejects(store(data => { data.notes.push('rollback'); throw expected }, true), error => error === expected)
  assert.deepEqual(await store(data => data.notes), [])
  await store(data => data.notes.push('commit'), true)
  assert.deepEqual(db.state().notes, ['commit'])
})

test('uninitialized, corrupt and unavailable database never execute callback or expose details', async () => {
  for (const db of [fakeDatabase(null), fakeDatabase({ version: 7 }), fakeDatabase(emptySnapshot(), true)]) {
    let calls = 0
    await assert.rejects(createDatabaseStore(db.sql)(() => calls++, true), error => error.message === 'FarmBuddy database unavailable or not initialized' && !error.cause)
    assert.equal(calls, 0)
  }
})

test('imports require uninitialized state and never overwrite existing data', async () => {
  const db = fakeDatabase(null)
  const snapshot = emptySnapshot()
  snapshot.users.push({ id: 'preserved' })
  await importSnapshot(db.sql, snapshot)
  assert.deepEqual(db.state(), snapshot)
  await assert.rejects(importSnapshot(db.sql, emptySnapshot()), /refused/)
  assert.deepEqual(db.state(), snapshot)
})

test('CLI dry-run preserves source without credentials or connection; invalid input fails', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'farmbuddy-db-test-'))
  try {
    const file = join(dir, 'source.json')
    const source = JSON.stringify(emptySnapshot())
    await writeFile(file, source)
    const env = { ...process.env, SUPABASE_DATABASE_URL: 'postgres://secret-password@nonexistent.invalid/db' }
    const result = spawnSync(process.execPath, ['scripts/supabase-database.mjs', 'import', `--file=${file}`], { env, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /No database connection or writes/)
    assert.ok(!result.stdout.includes('secret-password'))
    assert.equal(await readFile(file, 'utf8'), source)
    await writeFile(file, '{}')
    const invalid = spawnSync(process.execPath, ['scripts/supabase-database.mjs', 'import', `--file=${file}`, '--apply'], { env, encoding: 'utf8' })
    assert.equal(invalid.status, 1)
    assert.ok(!invalid.stderr.includes('secret-password'))
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('Supabase selection never touches or creates a local store on failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'farmbuddy-db-fail-'))
  try {
    const file = join(dir, 'must-not-exist.json')
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import {store} from './server/utils/store.js'; try { await store(() => { throw new Error('callback executed') }, true); process.exitCode = 2 } catch(e) { console.log(e.message) }`], { env: { ...process.env, FARMBUDDY_DATABASE: 'supabase', SUPABASE_DATABASE_URL: '', FARMBUDDY_DATA_FILE: file }, encoding: 'utf8' })
    assert.equal(result.status, 0)
    assert.match(result.stdout, /configuration required/)
    await assert.rejects(readFile(file), { code: 'ENOENT' })
  } finally { await rm(dir, { recursive: true, force: true }) }
})
