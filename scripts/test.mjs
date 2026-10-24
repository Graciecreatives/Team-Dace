import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'

// Tests must never inherit real cloud credentials, send auth emails, or consume
// provider credits. Individual synthetic tests opt into their own fake config.
const env = {
  ...process.env,
  FARMBUDDY_AUTH: 'local', FARMBUDDY_DATABASE: 'local', FARMBUDDY_IMAGE_STORAGE: 'local',
  SUPABASE_URL: '', SUPABASE_DATABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '',
  SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '',
  OPENROUTER_API_KEY: '', YARNGPT_API_KEY: '',
}
const units = [
  ...readdirSync('app/tests').filter(file => file.endsWith('.test.mjs')).map(file => `app/tests/${file}`),
  ...readdirSync('tests').filter(file => file.endsWith('.test.js')).map(file => `tests/${file}`),
]
for (const args of [['server/tests/integration.mjs'], ['server/tests/location.mjs'], ['--test', ...units]]) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' })
  if (result.error) { console.error('Could not start local test process'); process.exit(1) }
  if (result.status !== 0) process.exit(result.status || 1)
}
