import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { serializeSnapshot } from '../server/utils/database.js'

const args = process.argv.slice(2)
if (args.some(arg => !['--remote', '--apply'].includes(arg))) throw new Error('Usage: node scripts/cloudflare-smoke-cleanup.mjs [--remote] [--apply]')
const location = args.includes('--remote') ? '--remote' : '--local'
const manifest = JSON.parse(await readFile('.data/cloudflare-smoke-account.json', 'utf8'))
if (!/^[a-f0-9-]{36}$/.test(manifest.ownerId) || !/^cloudflare-qa-[a-f0-9-]{36}@example\.test$/.test(manifest.email)) throw new Error('Refusing non-disposable account manifest')
const cli = (...command) => {
  const result = spawnSync('node_modules/.bin/wrangler', command, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  if (result.status !== 0) throw new Error('Wrangler cleanup operation failed. No private output printed. Inspect privately.')
  return result.stdout
}
const response = JSON.parse(cli('d1', 'execute', 'farmbuddy-db', location, '--json', '--command=SELECT revision, snapshot FROM app_state WHERE id=1'))
const row = response[0]?.results?.[0]
if (!row || !Number.isSafeInteger(row.revision)) throw new Error('No initialized state available')
const data = JSON.parse(row.snapshot)
const matches = data.users.filter(user => user.id === manifest.ownerId && user.email === manifest.email && user.name === 'Cloudflare validation')
if (matches.length !== 1) throw new Error('Exact disposable account not found. Nothing removed.')
const ownImages = (data.marketplaceImages || []).filter(asset => asset.ownerId === manifest.ownerId)
if (ownImages.some(asset => asset.id !== manifest.imageId)) throw new Error('Unexpected disposable images, refusing automatic cleanup')
if ((data.farmWorkspaces || []).some(workspace => workspace.id === manifest.ownerId && workspace.members.length)) throw new Error('Disposable account has team members, refusing cleanup')
for (const [key, values] of Object.entries(data)) {
  if (!Array.isArray(values)) continue
  data[key] = values.filter(value => !(key === 'users' && value.id === manifest.ownerId) && value.userId !== manifest.ownerId && value.ownerId !== manifest.ownerId)
}
const text = serializeSnapshot(data)
const sql = `UPDATE app_state SET snapshot=CAST(X'${Buffer.from(text).toString('hex')}' AS TEXT), revision=revision+1 WHERE id=1 AND revision=${row.revision};\n`
if (Buffer.byteLength(sql) > 90000) throw new Error('Cleanup snapshot too large for this deliberately narrow operator tool')
if (!args.includes('--apply')) {
  console.log(`Validated one disposable account and ${ownImages.length} disposable image(s). No writes. Add --apply to remove only this test data.`)
} else {
  await mkdir('.data', { recursive: true, mode: 0o700 })
  const stamp = randomUUID()
  await writeFile(`.data/pre-smoke-cleanup-${stamp}.json`, row.snapshot, { mode: 0o600, flag: 'wx' })
  const file = `.data/smoke-cleanup-${stamp}.sql`
  await writeFile(file, sql, { mode: 0o600, flag: 'wx' })
  const result = JSON.parse(cli('d1', 'execute', 'farmbuddy-db', location, '--json', `--file=${file}`))
  if (result[0]?.meta?.changes !== 1) throw new Error('Cleanup revision changed, refusing image deletion. Recheck current state.')
  for (const image of ownImages) {
    if (!/^[a-f0-9]{32}\/[a-f0-9-]{36}\.jpg$/.test(image.key) || image.backend !== 'cloudflare') throw new Error('Unexpected test object metadata')
    cli('r2', 'object', 'delete', `farmbuddy-products/${image.key}`, location)
  }
  await unlink('.data/cloudflare-smoke-account.json')
  console.log(`Removed exactly one disposable account and ${ownImages.length} disposable image(s). Other account data preserved. Private pre-cleanup backup retained.`)
}
