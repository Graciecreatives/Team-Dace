import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

const file = resolve(process.env.FARMBUDDY_DATA_FILE || '.data/farmbuddy.json')
let queue = Promise.resolve()

// Every read and mutation shares the queue. A failed write never becomes live state.
export function store(operation, mutate = false) {
  const task = queue.then(async () => {
    let data
    try {
      data = JSON.parse(await readFile(file, 'utf8'))
      if (data.version !== 1 || !['users', 'sessions', 'records', 'reminders'].every(key => Array.isArray(data[key]))) {
        throw new Error('Invalid FarmBuddy store')
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      data = { version: 1, users: [], sessions: [], records: [], reminders: [] }
    }
    const result = await operation(data)
    if (mutate) {
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
