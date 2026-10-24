import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { connectDatabase, emptySnapshot, validateSnapshot } from '../server/utils/database.js'

export async function importSnapshot(sql, snapshot) {
  validateSnapshot(snapshot)
  return sql.begin(async tx => {
    await tx`SET LOCAL lock_timeout = '15s'`
    const rows = await tx`SELECT snapshot FROM farmbuddy_private.app_state WHERE id = 1 FOR UPDATE`
    if (rows.length !== 1 || rows[0].snapshot !== null) {
      throw new Error('Import refused: destination must be explicitly provisioned and uninitialized')
    }
    await tx`UPDATE farmbuddy_private.app_state SET snapshot = ${tx.json(snapshot)}, revision = revision + 1, updated_at = now() WHERE id = 1`
  })
}

export async function main(args = process.argv.slice(2)) {
  const [command, ...flags] = args
  if (!['schema', 'import', 'init-empty'].includes(command) || flags.some(flag => flag !== '--apply' && flag !== '--dry-run' && !flag.startsWith('--file=')) || (flags.includes('--apply') && flags.includes('--dry-run')) || (command !== 'import' && flags.some(flag => flag.startsWith('--file=')))) {
    throw new Error('Usage: node scripts/supabase-database.mjs schema|import|init-empty [--file=path] [--dry-run|--apply]')
  }
  let snapshot
  if (command === 'import') {
    const file = flags.find(flag => flag.startsWith('--file='))?.slice(7) || process.env.FARMBUDDY_DATA_FILE || '.data/farmbuddy.json'
    try { snapshot = validateSnapshot(JSON.parse(await readFile(file, 'utf8'))) } catch { throw new Error('Local snapshot is missing or invalid; no database changes made') }
  } else if (command === 'init-empty') snapshot = emptySnapshot()
  if (!flags.includes('--apply')) {
    console.log(`Dry run: ${command === 'schema' ? 'private schema would be provisioned' : 'valid snapshot would be imported only into uninitialized state'}. No database connection or writes made. Source file unchanged.`)
    return
  }
  if (!process.env.SUPABASE_DATABASE_URL) throw new Error('SUPABASE_DATABASE_URL is required; no database changes made')
  let sql
  try {
    sql = await connectDatabase()
    if (command === 'schema') {
      const schema = await readFile(new URL('../server/database/schema.sql', import.meta.url), 'utf8')
      await sql.begin(tx => tx.unsafe(schema))
    } else await importSnapshot(sql, snapshot)
    console.log(`${command} completed. Source file unchanged.`)
  } catch {
    throw new Error('Database operation failed or destination already initialized. Check configuration and state privately; source file unchanged.')
  } finally {
    if (sql) await sql.end({ timeout: 5 }).catch(() => {})
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
