import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabaseStore, emptySnapshot, MAX_CAS_ATTEMPTS } from '../utils/database.js'
import { importSnapshot, snapshotImportSQL } from '../../scripts/cloudflare-database.mjs'

// Real SQLite statements, not canned CAS responses. D1 binding-shaped adapter
// deliberately shares no queue, lock or process state across its connections.
export function sqliteBinding(sqlite) {
  return {
    withSession(constraint) { assert.equal(constraint, 'first-primary'); return this },
    prepare(query) {
      const statement = sqlite.prepare(query)
      let values = []
      return {
        bind(...args) { values = args; return this },
        async first() { return statement.get(...values) || null },
        async run() { const result = statement.run(...values); return { success: true, meta: { changes: Number(result.changes) } } },
      }
    },
  }
}

export async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'farmbuddy-d1-'))
  const first = new DatabaseSync(join(dir, 'test.sqlite'))
  const second = new DatabaseSync(join(dir, 'test.sqlite'))
  try {
    // Disposable fixtures test logical concurrency, not disk durability latency.
    first.exec('PRAGMA synchronous = OFF')
    second.exec('PRAGMA synchronous = OFF')
    const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8')
    first.exec(schema)
    await run({ first, second, a: sqliteBinding(first), b: sqliteBinding(second), schema })
  } finally { first.close(); second.close(); await rm(dir, { recursive: true, force: true }) }
}

test('real SQLite CAS across independent connections replays conflict without losing updates', async () => fixture(async ({ a, b }) => {
  await importSnapshot(a, emptySnapshot())
  const stores = [createDatabaseStore(a), createDatabaseStore(b)]
  let entered = 0, release
  const barrier = new Promise(resolve => { release = resolve })
  const calls = [0, 0]
  const results = await Promise.all(stores.map((store, index) => store(async data => {
    calls[index]++
    if (calls[index] === 1) { if (++entered === 2) release(); await barrier }
    const prior = data.notes.length
    data.notes.push({ index, prior })
    return prior
  }, true)))
  assert.deepEqual(results.toSorted(), [0, 1])
  assert.equal(calls[0] + calls[1], 3)
  const notes = await stores[0](data => data.notes)
  assert.equal(notes.length, 2)
  assert.deepEqual(notes.map(note => note.prior), [0, 1])
}))

test('retry exhaustion is bounded and competing commits survive', async () => fixture(async ({ a, b }) => {
  await importSnapshot(a, emptySnapshot())
  let calls = 0
  await assert.rejects(createDatabaseStore(a)(async data => {
    calls++
    await createDatabaseStore(b)(latest => latest.notes.push('winner'), true)
    data.notes.push('loser')
  }, true), /retry limit/)
  assert.equal(calls, MAX_CAS_ATTEMPTS)
  assert.deepEqual(await createDatabaseStore(a)(data => data.notes), Array(MAX_CAS_ATTEMPTS).fill('winner'))
}))

test('domain failures before and after conflict preserve identity and never commit failed draft', async () => fixture(async ({ a, b }) => {
  await importSnapshot(a, emptySnapshot())
  const expected = new Error('domain rejected')
  let calls = 0
  await assert.rejects(createDatabaseStore(a)(async data => {
    calls++
    data.notes.push('draft')
    if (calls === 1) await createDatabaseStore(b)(latest => latest.notes.push('winner'), true)
    else throw expected
  }, true), error => error === expected)
  assert.equal(calls, 2)
  await assert.rejects(createDatabaseStore(a)(() => { throw expected }, true), error => error === expected)
  await createDatabaseStore(a)(data => data.notes.push('read-discard'))
  assert.deepEqual(await createDatabaseStore(b)(data => data.notes), ['winner'])
}))

test('SQL schema/import roundtrip, guards, limits, Unicode and unknown fields', async () => fixture(async ({ first, a, schema }) => {
  let called = false
  await assert.rejects(createDatabaseStore(a)(() => { called = true }), /not initialized/)
  assert.equal(called, false)
  const seed = emptySnapshot()
  seed.future = { unicode: "🌱 O'Brien \\ \u0000", large: 'é'.repeat(30000) }
  const sql = snapshotImportSQL(seed)
  for (const statement of sql.split('\n')) assert.ok(Buffer.byteLength(statement) < 100000)
  first.exec(sql)
  first.exec(schema)
  assert.deepEqual(await createDatabaseStore(a)(data => data), seed)
  await assert.rejects(importSnapshot(a, emptySnapshot()), /refused/)
  assert.throws(() => first.exec(snapshotImportSQL(emptySnapshot())), /CHECK/)
  assert.deepEqual(await createDatabaseStore(a)(data => data), seed)
  assert.throws(() => first.prepare('UPDATE app_state SET snapshot = ?').run('{}'))
  assert.throws(() => first.prepare('UPDATE app_state SET snapshot = ?').run(JSON.stringify({ ...seed, future: 'x'.repeat(1000000) })))
  await assert.rejects(createDatabaseStore(a)(data => { data.future = 'é'.repeat(500000) }, true), /byte limit/)
  assert.deepEqual(await createDatabaseStore(a)(data => data), seed)
}))
