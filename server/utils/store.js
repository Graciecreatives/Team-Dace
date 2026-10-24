import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

import { databaseMode, connectDatabase, createDatabaseStore, emptySnapshot, validateSnapshot } from './database.js'

const file = resolve(process.env.FARMBUDDY_DATA_FILE || '.data/farmbuddy.json')
let queue = Promise.resolve()

// Every local read and mutation shares the queue. A failed write never becomes live state.
let databaseStore

export function store(operation, mutate = false) {
  // Resolve mode before touching the local file. A rejected connection remains
  // rejected rather than ever creating a local empty replacement database.
  let mode
  try { mode = databaseMode() } catch (error) { return Promise.reject(error) }
  if (mode === 'cloudflare') {
    databaseStore ||= connectDatabase().then(createDatabaseStore)
    return databaseStore.then(run => run(operation, mutate))
  }
  const task = queue.then(async () => {
    let data
    try {
      data = JSON.parse(await readFile(file, 'utf8'))
      validateSnapshot(data)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      data = emptySnapshot()
    }
    const result = await operation(data)
    if (mutate) {
      validateSnapshot(data)
      await mkdir(dirname(file), { recursive: true, mode: 0o700 })
      const temp = `${file}.${randomBytes(12).toString('hex')}.tmp`
      try {
        await writeFile(temp, JSON.stringify(data), { mode: 0o600, flag: 'wx' })
        await rename(temp, file)
      } finally {
        await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error })
      }
    }
    return result
  })
  queue = task.catch(() => {})
  return task
}
