// Unit tests only: fake storage and fake transport, not browser/offline end-to-end tests.
import test from 'node:test'
import assert from 'node:assert/strict'
import { notesKey, loadNotes, persistNotes, addNote, mergeServerNotes, syncPending, transcriptDraft } from '../utils/offline-notes.js'
const note = { id: 'b0d5e697-7807-412c-a59a-f8db01721094', title: 'Watered maize', body: 'North field' }
function fakeStorage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}
test('unit: namespaces never load another account queue', () => {
  const storage = fakeStorage()
  persistNotes(storage, 'farmer/a', addNote([], note))
  assert.notEqual(notesKey('farmer/a'), notesKey('farmer%2Fa'))
  assert.equal(loadNotes(storage, 'farmer/a').notes.length, 1)
  assert.deepEqual(loadNotes(storage, 'farmer/b').notes, [])
  assert.deepEqual(loadNotes(storage, '').notes, [])
})
test('unit: quota and unavailable storage report local-only without mutating notes', () => {
  const notes = addNote([], note)
  assert.match(persistNotes(null, 'a', notes), /open page only/)
  assert.match(persistNotes({ setItem() { throw Error('quota') } }, 'a', notes), /full/)
  assert.equal(notes[0].body, note.body)
  assert.match(loadNotes(null, 'a').error, /unavailable/)
  assert.match(loadNotes({ getItem: () => '{' }, 'a').error, /unreadable/)
})
test('unit: duplicate UUID is not added or overwritten', () => {
  const notes = addNote([], note)
  const same = addNote(notes, { ...note, body: 'changed' })
  assert.equal(same, notes)
  assert.equal(same.length, 1)
  assert.equal(same[0].body, note.body)
})
test('unit: failure retains queue and retry uses same UUID, skips synced notes', async () => {
  const notes = addNote([], note)
  const requests = []
  await assert.rejects(syncPending(notes, async n => { requests.push(n); throw Error('network') }))
  assert.equal(notes[0].status, 'pending')
  let persisted = 0
  await syncPending(notes, async n => requests.push(n), () => true, () => persisted++)
  assert.equal(notes[0].status, 'synced')
  assert.equal(requests[0].id, requests[1].id)
  await syncPending(notes, async () => assert.fail('must not resend synced notes'))
  assert.equal(persisted, 1)
})
test('unit: generation change cancels queue and ignores late completion', async () => {
  const notes = addNote(addNote([], note), { ...note, id: 'second' })
  let current = true, sent = 0
  await syncPending(notes, async () => { sent++; current = false }, () => current)
  assert.equal(sent, 1)
  assert.ok(notes.every(n => n.status === 'pending'))
})
test('unit: merging does not erase missing or pending local notes', () => {
  const notes = addNote([], note)
  const merged = mergeServerNotes(notes, [{ ...note, body: 'server body' }])
  assert.equal(merged[0].body, note.body)
  assert.equal(merged[0].status, 'pending')
  assert.equal(mergeServerNotes(notes, []).length, 1)
})
test('unit: server deletion removes synced copies but retains pending drafts', () => {
  const local = [{ ...note, status: 'synced' }, { ...note, id: 'pending-id', status: 'pending' }]
  const merged = mergeServerNotes(local, [])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].id, 'pending-id')
})
test('unit: transcript extraction never invents money or category', () => {
  const draft = transcriptDraft('Sold 4 goats for 2000. Buyer collected today.')
  assert.equal(draft.category, 'activity')
  assert.equal(draft.amount, '')
  assert.equal(draft.title, 'Sold 4 goats for 2000')
  assert.match(draft.note, /Buyer collected/)
})
