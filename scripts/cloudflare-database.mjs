import { readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { emptySnapshot, serializeSnapshot } from '../server/utils/database.js'

export async function importSnapshot(db, snapshot) {
  const text = serializeSnapshot(snapshot)
  const result = await db.prepare('UPDATE app_state SET snapshot = ?, revision = revision + 1 WHERE id = 1 AND snapshot IS NULL AND revision = 0').bind(text).run()
  if (!result.success || result.meta?.changes !== 1) throw new Error('Import refused: destination must be provisioned and uninitialized')
}

export function snapshotImportSQL(snapshot) {
  const bytes = Buffer.from(serializeSnapshot(snapshot))
  const table = `farmbuddy_import_${randomBytes(12).toString('hex')}`
  // Hex chunks keep each statement below D1's SQL text limit, even for Unicode.
  const statements = [`CREATE TABLE ${table} (payload BLOB NOT NULL, applied INTEGER CHECK (applied = 1));`, `INSERT INTO ${table}(payload) VALUES (X'');`]
  for (let offset = 0; offset < bytes.length; offset += 16000) {
    statements.push(`UPDATE ${table} SET payload = CAST(payload || X'${bytes.subarray(offset, offset + 16000).toString('hex')}' AS BLOB);`)
  }
  statements.push(`UPDATE app_state SET snapshot = CAST((SELECT payload FROM ${table}) AS TEXT), revision = revision + 1 WHERE id = 1 AND snapshot IS NULL AND revision = 0;`, `UPDATE ${table} SET applied = changes();`, `DROP TABLE ${table};`)
  return `${statements.join('\n')}\n`
}

export async function main(args = process.argv.slice(2)) {
  const [command, ...flags] = args
  if (!['schema', 'import', 'init-empty'].includes(command) || flags.some(flag => !/^--(file|out)=.+/.test(flag)) || flags.filter(flag => flag.startsWith('--out=')).length > 1 || flags.filter(flag => flag.startsWith('--file=')).length > 1 || (command !== 'import' && flags.some(flag => flag.startsWith('--file=')))) {
    throw new Error('Usage: node scripts/cloudflare-database.mjs schema|import|init-empty [--file=source.json] [--out=private.sql]')
  }
  let sql
  if (command === 'schema') sql = await readFile(new URL('../server/database/schema.sql', import.meta.url), 'utf8')
  else {
    let snapshot = emptySnapshot()
    if (command === 'import') {
      const file = flags.find(flag => flag.startsWith('--file='))?.slice(7) || process.env.FARMBUDDY_DATA_FILE || '.data/farmbuddy.json'
      try { snapshot = JSON.parse(await readFile(file, 'utf8')) } catch { throw new Error('Local snapshot is missing or invalid; no database changes made') }
    }
    sql = snapshotImportSQL(snapshot)
  }
  const out = flags.find(flag => flag.startsWith('--out='))?.slice(6)
  if (!out) {
    console.log('Dry run: valid SQL prepared. No database connection or writes. Use --out=private.sql to create a migration file. Source unchanged.')
    return
  }
  await writeFile(out, sql, { flag: 'wx', mode: 0o600 })
  console.log('SQL file created privately. No database connection or writes. Apply explicitly with Wrangler. Source unchanged.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Database SQL preparation failed. Check arguments, snapshot validity, size and output path privately. No database writes made.'); process.exitCode = 1 })
}
