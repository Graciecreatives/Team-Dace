import { readFile, writeFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { spawnSync } from 'node:child_process'

const allowed = ['PLANTNET_API_KEY', 'ROBOFLOW_API_KEY', 'YARNGPT_API_KEY', 'YARNGPT_VOICE', 'OPENWEATHER_API_KEY']
const args = process.argv.slice(2)
if (args.some(arg => !['--apply', '--local'].includes(arg)) || (args.includes('--apply') && args.includes('--local'))) {
  console.error('Usage: npm run cf:secrets -- [--apply | --local]')
  process.exit(1)
}
let values = {}
try { values = parseEnv(await readFile('.env', 'utf8')) } catch (error) {
  if (error.code !== 'ENOENT') throw new Error('Could not read private .env')
}
const secrets = Object.fromEntries(allowed.map(key => [key, (process.env[key] || values[key] || '').trim()]).filter(([, value]) => value))
const animalFlag = process.env.FARMBUDDY_EXPERIMENTAL_ANIMAL_SCAN || values.FARMBUDDY_EXPERIMENTAL_ANIMAL_SCAN
if (animalFlag === 'true' && secrets.ROBOFLOW_API_KEY) secrets.FARMBUDDY_EXPERIMENTAL_ANIMAL_SCAN = 'true'
else if (animalFlag === 'false' || secrets.ROBOFLOW_API_KEY) secrets.FARMBUDDY_EXPERIMENTAL_ANIMAL_SCAN = 'false'
if (args.includes('--local')) {
  // A dedicated .dev.vars prevents Wrangler importing unrelated values from .env.
  const local = { ...secrets, NODE_ENV: 'development', FARMBUDDY_AUTH: 'cloudflare', FARMBUDDY_DATABASE: 'cloudflare', FARMBUDDY_IMAGE_STORAGE: 'cloudflare', FARMBUDDY_AI_MODEL: process.env.FARMBUDDY_AI_MODEL || values.FARMBUDDY_AI_MODEL || '@cf/qwen/qwen3-30b-a3b-fp8' }
  await writeFile('.dev.vars', Object.entries(local).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 })
  console.log('Private local Worker configuration prepared. No secret values printed.')
} else if (!args.includes('--apply')) {
  console.log(`Configured provider secret names: ${Object.keys(secrets).join(', ') || 'none'}. No upload. Add --apply to upload or --local to prepare local Worker preview.`)
} else if (!Object.keys(secrets).length) {
  console.log('No external provider keys are configured. No secrets uploaded. Workers AI uses its native binding, while plant scan/voice/weather require their separate keys.')
} else {
  const result = spawnSync('node_modules/.bin/wrangler', ['secret', 'bulk'], { input: JSON.stringify(secrets), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  if (result.status !== 0) {
    console.error('Cloudflare secret upload failed. Check Wrangler login and Worker permissions. Secret values have not been printed.')
    process.exit(1)
  }
  console.log(`Uploaded ${Object.keys(secrets).length} configured provider secrets. No Supabase or unrelated credentials were uploaded.`)
}
