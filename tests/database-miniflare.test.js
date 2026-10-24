import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createDatabaseStore, emptySnapshot, MAX_CAS_ATTEMPTS } from '../server/utils/database.js'
import { importSnapshot, snapshotImportSQL } from '../scripts/cloudflare-database.mjs'

test('real Miniflare D1 binding: concurrent CAS, bounded retries, domain failure and Worker binding import', { timeout: 60000 }, async () => {
  // Never use project .wrangler state, configuration, credentials or remote D1.
  const dir = await mkdtemp(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'farmbuddy-miniflare-d1-'))
  let mf
  try {
    const databaseModule = await readFile(new URL('../server/utils/database.js', import.meta.url), 'utf8')
    mf = new Miniflare(convertV4MiniflareOptions({
      compatibilityDate: '2026-10-24',
      d1Persist: join(dir, 'd1'),
      modules: [
        { type: 'ESModule', path: 'worker.js', contents: `
          import { connectDatabase, createDatabaseStore } from './database.js'
          export default { async fetch() {
            const db = await connectDatabase()
            const notes = await createDatabaseStore(db)(data => data.notes)
            return Response.json({ notes })
          } }
        ` },
        { type: 'ESModule', path: 'database.js', contents: databaseModule },
      ],
      d1Databases: { FARMBUDDY_DB: 'disposable-test-database' },
    }))
    // These are actual workerd D1 binding proxies, not an API-shaped SQLite mock.
    const first = await mf.getD1Database('FARMBUDDY_DB')
    const second = await mf.getD1Database('FARMBUDDY_DB')
    const schema = await readFile(new URL('../server/database/schema.sql', import.meta.url), 'utf8')
    for (const statement of schema.split(';').map(value => value.trim()).filter(Boolean)) await first.prepare(statement).run()
    const migration = snapshotImportSQL(emptySnapshot())
    for (const statement of migration.split(';').map(value => value.trim()).filter(Boolean)) await first.prepare(statement).run()
    const stores = [createDatabaseStore(first), createDatabaseStore(second)]
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
    assert.equal(calls[0] + calls[1], 3, 'one stale revision must replay exactly once')
    const committed = await stores[0](data => data.notes)
    assert.deepEqual(committed.map(note => note.prior), [0, 1])
    assert.deepEqual(committed.map(note => note.index).toSorted(), [0, 1])

    const domainError = new Error('domain failure after conflict')
    let domainCalls = 0
    await assert.rejects(stores[0](async data => {
      domainCalls++
      data.notes.push('failed draft')
      if (domainCalls === 1) await stores[1](latest => latest.notes.push('domain competitor'), true)
      else throw domainError
    }, true), error => error === domainError)
    assert.equal(domainCalls, 2)

    let exhaustedCalls = 0
    await assert.rejects(stores[0](async data => {
      exhaustedCalls++
      await stores[1](latest => latest.notes.push('retry competitor'), true)
      data.notes.push('stale draft')
    }, true), /retry limit exceeded/)
    assert.equal(exhaustedCalls, MAX_CAS_ATTEMPTS)
    const expected = [...committed, 'domain competitor', ...Array(MAX_CAS_ATTEMPTS).fill('retry competitor')]
    assert.deepEqual(await stores[0](data => data.notes), expected)
    const row = await first.prepare('SELECT revision FROM app_state WHERE id = 1').first()
    assert.equal(row.revision, 1 + 2 + 1 + MAX_CAS_ATTEMPTS)

    // Execute the real dynamic import('cloudflare:workers') path in a Worker.
    const response = await mf.dispatchFetch('http://local.test/read')
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { notes: expected })
    await assert.rejects(importSnapshot(second, emptySnapshot()), /Import refused/)
  } finally {
    try { if (mf) await mf.dispose() } finally { await rm(dir, { recursive: true, force: true }) }
  }
})
