// Pure storage/queue helpers. Storage failures retain the caller's in-memory copy.
export const notesKey = userId => `farmbuddy:notes:v1:${encodeURIComponent(String(userId))}`
const valid = n => n && typeof n.id === 'string' && typeof n.title === 'string' && typeof n.body === 'string'
export function loadNotes(storage, userId) {
  if (!userId) return { notes: [], error: 'Sign in to save notes.' }
  try {
    if (!storage) throw new Error('unavailable')
    const data = JSON.parse(storage.getItem(notesKey(userId)) || '[]')
    if (!Array.isArray(data) || !data.every(valid)) throw new Error('invalid')
    return { notes: data.map(n => ({ ...n, status: n.status === 'synced' ? 'synced' : 'pending' })), error: '' }
  } catch { return { notes: [], error: 'Device storage is unavailable or unreadable. Notes stay in this open page only.' } }
}
export function persistNotes(storage, userId, notes) {
  try {
    if (!storage || !userId) throw new Error('unavailable')
    storage.setItem(notesKey(userId), JSON.stringify(notes))
    return ''
  } catch { return 'Device storage is unavailable or full. Notes stay in this open page only. Copy important text before leaving.' }
}
export function addNote(notes, note) {
  return notes.some(n => n.id === note.id) ? notes : [{ ...note, status: 'pending' }, ...notes]
}
export function mergeServerNotes(local, remote) {
  const result = [...local]
  for (const note of remote.filter(valid)) {
    const index = result.findIndex(n => n.id === note.id)
    if (index < 0) result.push({ ...note, status: 'synced' })
    // Pending client content is never overwritten by a remote response.
    else if (result[index].status === 'synced') result[index] = { ...note, status: 'synced' }
  }
  return result
}
export async function syncPending(notes, send, isCurrent = () => true, onSaved = () => {}) {
  for (const note of [...notes].filter(n => n.status === 'pending')) {
    if (!isCurrent()) break
    await send({ id: note.id, title: note.title, body: note.body })
    if (!isCurrent()) break
    const current = notes.find(n => n.id === note.id)
    if (current) current.status = 'synced'
    onSaved()
  }
  return notes
}
export function transcriptDraft(text) {
  const note = text.trim()
  // No currency or transaction classification is inferred from speech.
  return { category: 'activity', title: note.split(/[.!?\n]/)[0].slice(0, 160), amount: '', note }
}
