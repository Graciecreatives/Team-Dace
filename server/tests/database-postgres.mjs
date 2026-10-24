import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { connectDatabase, createDatabaseStore, emptySnapshot } from '../utils/database.js'
import { importSnapshot } from '../../scripts/supabase-database.mjs'

// Opt-in only: must name a new disposable LOCAL database. This test creates
// schema/roles and deliberately exercises invalid writes, never use real data.
const url = process.env.FARMBUDDY_TEST_DATABASE_URL

test('real PostgreSQL: locks, rollback, persistence, schema constraints and private grants', { skip: !url }, async () => {
  const parsed = new URL(url)
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname), 'Only a disposable localhost database is permitted')
  const { default: postgres } = await import('postgres')
  const options = { prepare: false, max: 2, ssl: false, onnotice: () => {} }
  const first = postgres(url, options)
  const second = postgres(url, options)
  try {
    // A plaintext local server must not be accepted even with weakening URI flags.
    const secure = await connectDatabase({ SUPABASE_DATABASE_URL: `${url}?sslmode=disable` })
    try {
      let tlsCalls = 0
      await assert.rejects(createDatabaseStore(secure)(() => tlsCalls++), /database unavailable/)
      assert.equal(tlsCalls, 0)
    } finally { await secure.end({ timeout: 1 }) }
    // Refuse to touch any existing FarmBuddy data, even an uninitialized schema.
    const existing = await first`SELECT 1 FROM pg_namespace WHERE nspname = 'farmbuddy_private'`
    assert.equal(existing.length, 0, 'Test requires a fresh disposable database')
    await first.unsafe(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;`)
    const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8')
    await first.begin(tx => tx.unsafe(schema))
    const storeA = createDatabaseStore(first)
    const storeB = createDatabaseStore(second)
    let called = 0
    await assert.rejects(storeA(() => called++), /not initialized/)
    assert.equal(called, 0)
    const seed = emptySnapshot()
    seed.users.push({ id: 'user-1', passwordHash: 'preserve-hash' })
    seed.sessions.push({ id: 'server-session', userId: 'user-1' })
    const imports = await Promise.allSettled([importSnapshot(first, seed), importSnapshot(second, seed)])
    assert.equal(imports.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(imports.filter(result => result.status === 'rejected').length, 1)
    await assert.rejects(importSnapshot(second, emptySnapshot()), /refused/)
    // Reapplying provisioning must never reset existing state.
    await first.begin(tx => tx.unsafe(schema))
    assert.deepEqual(await storeA(data => data.users), seed.users)
    const expected = new Error('callback validation')
    await assert.rejects(storeA(data => { data.notes.push('rollback'); throw expected }, true), error => error === expected)
    await storeA(data => data.notes.push('read-discard'))
    assert.deepEqual(await storeB(data => data.notes), [])
    let executions = 0
    await Promise.all(Array.from({ length: 40 }, (_, index) => [storeA, storeB][index % 2](async data => {
      executions++
      const prior = data.notes.length
      await new Promise(resolve => setTimeout(resolve, 2))
      data.notes.push({ index, prior })
    }, true)))
    assert.equal(executions, 40)
    const notes = await storeA(data => data.notes)
    assert.equal(notes.length, 40)
    assert.deepEqual(notes.map(note => note.prior), Array.from({ length: 40 }, (_, i) => i))
    // Malformed JSON must fail at the database boundary, not only in JS.
    for (const snapshot of [{}, { ...seed, version: 2 }, { ...seed, notes: null }]) {
      await assert.rejects(first`UPDATE farmbuddy_private.app_state SET snapshot = ${first.json(snapshot)} WHERE id = 1`, error => error.code === '23514')
    }
    await assert.rejects(first`INSERT INTO farmbuddy_private.app_state(id, snapshot) VALUES (2, NULL)`, error => error.code === '23514')
    for (const role of ['anon', 'authenticated']) {
      const [privileges] = await first`SELECT has_schema_privilege(${role}, 'farmbuddy_private', 'USAGE') AS usage, has_table_privilege(${role}, 'farmbuddy_private.app_state', 'SELECT') AS select, has_table_privilege(${role}, 'farmbuddy_private.app_state', 'UPDATE') AS update`
      assert.deepEqual({ ...privileges }, { usage: false, select: false, update: false })
    }
    await first.end()
    const reopened = postgres(url, options)
    try {
      assert.equal((await createDatabaseStore(reopened)(data => data.notes)).length, 40)
      assert.deepEqual(await createDatabaseStore(reopened)(data => data.sessions), seed.sessions)
    } finally { await reopened.end() }
  } finally {
    await first.end({ timeout: 1 })
    await second.end({ timeout: 1 })
  }
})
