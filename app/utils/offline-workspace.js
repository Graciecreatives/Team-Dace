export function newCommandId(crypto) {
  if (crypto.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
export const offlineActions = ['event.create', 'tasks.complete', 'tasks.consume', 'harvest.create']
export const workspaceKey = (userId, farmId) => `farmbuddy:workspace:v1:${encodeURIComponent(userId)}:${encodeURIComponent(farmId)}`
const clone = value => JSON.parse(JSON.stringify(value))
export function readWorkspace(storage, userId, farmId) {
  try {
    const raw = storage.getItem(workspaceKey(userId, farmId))
    if (!raw) return { queue: [], cache: null }
    const value = JSON.parse(raw)
    if (!Array.isArray(value.queue) || value.queue.length > 200 || !value.queue.every(c => c && offlineActions.includes(c.action) && c.farmId === farmId && typeof c.commandId === 'string')) throw Error()
    return clone({ queue: value.queue, cache: value.cache || null })
  } catch { throw new Error('Device drafts cannot be read. Do not clear browser storage before recovering important records.') }
}
export function writeWorkspace(storage, userId, farmId, value) {
  if (!storage || !userId || !farmId || value.queue.length > 200) throw new Error('Device storage unavailable or draft limit reached')
  storage.setItem(workspaceKey(userId, farmId), JSON.stringify(value))
}
export function enqueueCommand(queue, command) {
  if (!offlineActions.includes(command.action)) throw new Error('This action requires an online connection')
  if (queue.some(row => row.commandId === command.commandId)) return clone(queue)
  if (queue.length >= 200) throw new Error('Sync or remove drafts before adding more')
  return [...clone(queue), clone(command)]
}
export async function replayCommands(queue, send, current = () => true, saved = () => {}) {
  for (const command of [...queue]) {
    if (!current()) break
    const response = await send(clone(command))
    if (!current()) break
    saved(command.commandId, response)
  }
}
