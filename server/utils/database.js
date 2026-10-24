export const collections = ['users', 'sessions', 'records', 'reminders', 'enterprises', 'inventory', 'referrals', 'notes', 'marketplaceFarms', 'marketplaceProducts', 'marketplaceImages']

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
  const mode = env.FARMBUDDY_DATABASE || (env.SUPABASE_DATABASE_URL ? 'supabase' : 'local')
  if (!['local', 'supabase'].includes(mode)) throw new Error('Invalid FarmBuddy database mode')
  if (mode === 'supabase' && !env.SUPABASE_DATABASE_URL) throw new Error('Supabase database configuration required')
  return mode
}

export async function connectDatabase(env = process.env) {
  try {
    const url = new URL(env.SUPABASE_DATABASE_URL)
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username) throw new Error()
    // URL TLS flags must never override certificate verification.
    for (const key of [...url.searchParams.keys()]) {
      if (/^(ssl|sslmode|sslcert|sslkey|sslrootcert)$/i.test(key)) url.searchParams.delete(key)
    }
    const { default: postgres } = await import('postgres')
    return postgres(url.toString(), {
      ssl: { rejectUnauthorized: true }, prepare: false, max: 3,
      idle_timeout: 20, connect_timeout: 10, max_lifetime: 1800,
      onnotice: () => {}, debug: false
    })
  } catch {
    throw new Error('Supabase database configuration unavailable')
  }
}

// A singleton row is provisioned explicitly by the schema CLI. Lock even reads,
// preserving the local store's serial callback semantics across server instances.
export function createDatabaseStore(sql) {
  return async function databaseStore(operation, mutate = false) {
    let callbackError
    try {
      return await sql.begin(async tx => {
        await tx`SET LOCAL lock_timeout = '15s'`
        const rows = await tx`SELECT snapshot FROM farmbuddy_private.app_state WHERE id = 1 FOR UPDATE`
        if (rows.length !== 1 || rows[0].snapshot === null) throw new Error('uninitialized')
        const data = validateSnapshot(rows[0].snapshot)
        let result
        try { result = await operation(data) } catch (error) { callbackError = error; throw error }
        if (mutate) {
          validateSnapshot(data)
          await tx`UPDATE farmbuddy_private.app_state SET snapshot = ${tx.json(data)}, revision = revision + 1, updated_at = now() WHERE id = 1`
        }
        return result
      })
    } catch (error) {
      if (callbackError === error) throw error
      // Never attach driver errors/causes: URLs, SQL parameters and snapshot data
      // may contain credentials or private user data.
      throw new Error('FarmBuddy database unavailable or not initialized')
    }
  }
}
