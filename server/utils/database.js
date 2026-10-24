export const collections = ['users', 'sessions', 'records', 'reminders', 'enterprises', 'inventory', 'referrals', 'notes', 'marketplaceFarms', 'marketplaceProducts', 'marketplaceImages', 'farmWorkspaces']

export function emptySnapshot() {
  return { version: 1, ...Object.fromEntries(collections.map(key => [key, []])) }
}

export function validateSnapshot(data) {
  if (!data || data.version !== 1 || !['users', 'sessions', 'records', 'reminders'].every(key => Array.isArray(data[key]))) {
    throw new Error('Invalid FarmBuddy store')
  }
  for (const key of collections) {
    if (data[key] === undefined) data[key] = []
    else if (!Array.isArray(data[key])) throw new Error('Invalid FarmBuddy store')
  }
  return data
}

export function databaseMode(env = process.env) {
  const mode = env.FARMBUDDY_DATABASE || 'local'
  if (!['local', 'cloudflare'].includes(mode)) throw new Error('Invalid FarmBuddy database mode')
  return mode
}

export async function connectDatabase() {
  try {
    const { env } = await import('cloudflare:workers')
    if (!env.FARMBUDDY_DB?.prepare || !env.FARMBUDDY_DB?.withSession) throw new Error()
    return env.FARMBUDDY_DB
  } catch {
    throw new Error('FarmBuddy D1 binding FARMBUDDY_DB unavailable')
  }
}

export const MAX_SNAPSHOT_BYTES = 1_000_000
export const MAX_CAS_ATTEMPTS = 8

export function serializeSnapshot(data) {
  const snapshot = JSON.stringify(validateSnapshot(data))
  if (new TextEncoder().encode(snapshot).byteLength > MAX_SNAPSHOT_BYTES) {
    throw new Error('FarmBuddy snapshot exceeds 1000000 byte limit')
  }
  return snapshot
}

// Mutating callbacks may be replayed after conflicts. Keep them free of external
// side effects. Only the successful revision's result escapes to the caller.
export function createDatabaseStore(db) {
  return async function databaseStore(operation, mutate = false) {
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
      let session, row, data
      try {
        // Start each attempt on primary, never an arbitrarily stale replica.
        session = db.withSession('first-primary')
        row = await session.prepare('SELECT snapshot, revision FROM app_state WHERE id = 1').first()
        if (!row || row.snapshot === null || !Number.isSafeInteger(row.revision) || row.revision < 0 || row.revision >= Number.MAX_SAFE_INTEGER) throw new Error()
        data = validateSnapshot(JSON.parse(row.snapshot))
      } catch {
        throw new Error('FarmBuddy database unavailable or not initialized')
      }
      // Domain failures retain identity and are never retried or sanitized.
      const result = await operation(data)
      if (!mutate) return result
      const snapshot = serializeSnapshot(data)
      let changes
      try {
        const response = await session.prepare('UPDATE app_state SET snapshot = ?, revision = revision + 1 WHERE id = 1 AND revision = ?').bind(snapshot, row.revision).run()
        if (!response.success || ![0, 1].includes(response.meta?.changes)) throw new Error()
        changes = response.meta.changes
      } catch {
        // Ambiguous write failures must not replay callbacks.
        throw new Error('FarmBuddy database unavailable or not initialized')
      }
      if (changes === 1) return result
    }
    throw new Error('FarmBuddy database contention: retry limit exceeded')
  }
}
