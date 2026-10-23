<script setup>
import { addNote, loadNotes, persistNotes, mergeServerNotes, syncPending, transcriptDraft } from '../utils/offline-notes.js'
const props = defineProps({ user: { type: Object, default: () => ({}) }, mode: { type: String, default: 'notes' } })
const emit = defineEmits(['records-changed'])
const notes = ref([])
const title = ref('')
const body = ref('')
const transcript = ref('')
const language = ref('en-NG')
const online = ref(false)
const busy = ref(false)
const recordBusy = ref(false)
const listening = ref(false)
const supported = ref(false)
const error = ref('')
const storageWarning = ref('')
const feedback = ref('')
const reviewed = ref(false)
const record = reactive(transcriptDraft(''))
let storage, recognition, mounted = false, generation = 0, controller
const owner = computed(() => props.user?.id ? String(props.user.id) : '')
function persist() { storageWarning.value = persistNotes(storage, owner.value, notes.value) }
function stopListening() { if (recognition) { recognition.onresult = null; recognition.onend = null; recognition.onerror = null; recognition.abort(); recognition = null } listening.value = false }
function resetUser() {
  generation++; controller?.abort(); stopListening(); busy.value = false; recordBusy.value = false
  notes.value = []; title.value = ''; body.value = ''; transcript.value = ''; error.value = ''; feedback.value = ''; reviewed.value = false
  Object.assign(record, transcriptDraft(''))
  if (!mounted) return
  const loaded = loadNotes(storage, owner.value)
  notes.value = loaded.notes; storageWarning.value = loaded.error
  if (owner.value) sync()
}
watch(owner, resetUser, { flush: 'sync' })
async function sync() {
  if (busy.value || !online.value || !owner.value) return
  const token = generation
  const current = () => mounted && token === generation && online.value
  controller = new AbortController()
  const signal = controller.signal
  busy.value = true; error.value = ''
  try {
    // Local persistence happens before every network attempt, including retries.
    persist()
    await syncPending(notes.value, note => $fetch('/api/tools/notes', { method: 'POST', body: note, signal }), current, persist)
    if (!current()) return
    const data = await $fetch('/api/tools', { signal })
    if (current()) { notes.value = mergeServerNotes(notes.value, data.notes || []); persist() }
  } catch { if (token === generation) error.value = 'Sync failed. Your notes are retained. Reconnect and retry.' }
  finally { if (token === generation) busy.value = false }
}
function saveNote() {
  if (!owner.value || !title.value.trim() || !body.value.trim()) return
  if (!globalThis.crypto?.randomUUID) { error.value = 'Secure note IDs are unavailable in this browser. Copy your draft and use a secure HTTPS connection.'; return }
  notes.value = addNote(notes.value, { id: crypto.randomUUID(), title: title.value.trim(), body: body.value.trim() })
  persist(); title.value = ''; body.value = ''; feedback.value = 'Note saved on this page. Pending notes sync when connected.'; sync()
}
async function deleteNote(note) {
  if (!online.value || busy.value || !window.confirm('Delete this note from this device and your account?')) return
  const token = generation
  busy.value = true; error.value = ''
  try {
    await $fetch(`/api/tools/notes/${encodeURIComponent(note.id)}`, { method: 'DELETE' })
    if (token === generation) { notes.value = notes.value.filter(n => n.id !== note.id); persist() }
  } catch { if (token === generation) error.value = 'Could not delete. The note has been kept. Retry online.' }
  finally { if (token === generation) busy.value = false }
}
function startListening() {
  error.value = ''
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Recognition) return
  stopListening()
  const token = generation
  recognition = new Recognition(); recognition.lang = language.value; recognition.interimResults = false
  recognition.onresult = event => {
    if (token !== generation) return
    const text = Array.from(event.results).map(result => result[0].transcript).join(' ')
    transcript.value = `${transcript.value} ${text}`.trim()
  }
  recognition.onerror = () => { if (token === generation) { error.value = 'Browser dictation could not continue. Check microphone permission or type below.'; listening.value = false } }
  recognition.onend = () => { if (token === generation) listening.value = false }
  try { recognition.start(); listening.value = true } catch { error.value = 'Could not start dictation. You can always type below.' }
}
function prepareRecord() { Object.assign(record, transcriptDraft(transcript.value)); reviewed.value = false; feedback.value = 'Draft prepared. Choose a category and review every field before confirming.' }
watch(record, () => { reviewed.value = false }, { flush: 'sync' })
async function saveRecord() {
  if (!reviewed.value || !online.value || !owner.value || !record.title.trim() || recordBusy.value) return
  if (record.category !== 'activity' && (!Number.isFinite(Number(record.amount)) || Number(record.amount) <= 0)) { error.value = 'Enter a positive amount for income or expense.'; return }
  const token = generation
  recordBusy.value = true; error.value = ''
  try {
    await $fetch('/api/farm/records', { method: 'POST', body: { ...record, title: record.title.trim(), amount: record.category === 'activity' ? 0 : Number(record.amount) } })
    if (token === generation) { feedback.value = 'Farm record saved.'; Object.assign(record, transcriptDraft('')); reviewed.value = false; emit('records-changed') }
  } catch { if (token === generation) error.value = 'Record save was not confirmed. Check farm records before retrying to avoid duplicates. Your draft is kept.' }
  finally { if (token === generation) recordBusy.value = false }
}
function connectionChanged() { online.value = navigator.onLine; if (online.value) sync() }
onMounted(() => {
  mounted = true
  try { storage = window.localStorage } catch { storage = null }
  supported.value = !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  online.value = navigator.onLine
  window.addEventListener('online', connectionChanged); window.addEventListener('offline', connectionChanged)
  resetUser()
})
onUnmounted(() => { mounted = false; generation++; controller?.abort(); stopListening(); window.removeEventListener('online', connectionChanged); window.removeEventListener('offline', connectionChanged) })
</script>

<template>
  <section class="farm-notes" :aria-label="mode === 'voice' ? 'Voice to farm record' : 'Offline notes'">
    <h2>{{ mode === 'voice' ? 'Speak it. Review it. Save it.' : 'Your farm notebook' }}</h2>
    <p class="notice"><strong>Device privacy:</strong> Notes are stored unencrypted in this browser for your account. Anyone using this device may access browser storage. Avoid sensitive information on shared devices. Signing out does not erase saved notes.</p>
    <p>Saved notes are accessible while this page remains open. Reopening offline is not guaranteed. {{ online ? 'Connected' : 'Offline' }}.</p>
    <p v-if="storageWarning" role="alert" class="notice">{{ storageWarning }}</p>
    <p v-if="error" role="alert" class="notice">{{ error }}</p>
    <p role="status" aria-live="polite">{{ feedback }}</p>
    <template v-if="mode === 'voice'">
      <p>Browser dictation uses your browser's speech service, not YarnGPT. Your browser may send audio to its provider and may need internet. YarnGPT voice AI is a separate assistant feature.</p>
      <label>Dictation language<select v-model="language" :disabled="listening"><option value="en-NG">English (Nigeria)</option><option value="en-GB">English (UK)</option><option value="yo-NG">Yorùbá</option><option value="ha-NG">Hausa</option><option value="ig-NG">Igbo</option></select></label>
      <p v-if="!supported">Browser dictation is unavailable. Type or paste your transcript below.</p>
      <button v-if="supported" type="button" :disabled="!owner" @click="listening ? stopListening() : startListening()">{{ listening ? 'Stop dictation' : 'Enable microphone and start browser dictation' }}</button>
      <p role="status">{{ listening ? 'Listening. Speak now.' : '' }}</p>
      <label>Transcript (editable)<textarea v-model="transcript" rows="4" /></label>
      <button type="button" :disabled="!transcript.trim()" @click="prepareRecord">Prepare record draft</button>
      <form :aria-busy="recordBusy" @submit.prevent="saveRecord">
        <h3>Review record draft</h3><p>No money or currency is inferred. Activity is the default. Financial amounts use your farm account's currency.</p>
        <label>Category<select v-model="record.category"><option value="activity">Activity (no money)</option><option value="income">Income</option><option value="expense">Expense</option></select></label>
        <label>Record title<input v-model="record.title" required maxlength="160"></label>
        <label v-if="record.category !== 'activity'">Amount in account currency<input v-model="record.amount" type="number" required min="0.01" step="0.01" inputmode="decimal"></label>
        <label>Record note<textarea v-model="record.note" rows="3" /></label>
        <label class="check"><input v-model="reviewed" type="checkbox" required> I reviewed the category, title, amount and note.</label>
        <button :disabled="!reviewed || !online || recordBusy || !owner">{{ recordBusy ? 'Saving…' : 'Confirm and save farm record' }}</button>
      </form>
    </template>
    <template v-else>
      <form @submit.prevent="saveNote">
        <h3>New note draft</h3><p>Edit before saving. Saved notes are immutable to avoid offline conflicts. To change one, copy it into a new draft and delete the old note online.</p>
        <label>Note title<input v-model="title" required maxlength="160" :disabled="!owner"></label>
        <label>Note text<textarea v-model="body" required rows="4" :disabled="!owner" /></label>
        <button :disabled="!owner || !title.trim() || !body.trim()">Save note on device</button>
      </form>
      <button type="button" :disabled="busy || !online || !owner" :aria-busy="busy" @click="sync">{{ busy ? 'Syncing…' : 'Retry / refresh sync' }}</button>
      <p v-if="!notes.length">No saved notes yet.</p>
      <ul class="notes-list"><li v-for="note in notes" :key="note.id"><h3>{{ note.title }}</h3><p class="note-body">{{ note.body }}</p><p>{{ note.status === 'synced' ? 'Synced' : 'Pending sync' }}</p><button type="button" @click="title = note.title; body = note.body">Copy to new draft</button> <button type="button" :disabled="!online || busy" @click="deleteNote(note)">Delete online</button></li></ul>
    </template>
  </section>
</template>

<style scoped>
.farm-notes{background:#fff;border:1px solid #dce5da;border-radius:20px;padding:clamp(16px,4vw,32px);color:#213b27;max-width:900px}.farm-notes h2{font-size:1.5rem;font-weight:700}.farm-notes h3{font-weight:700;margin-top:12px}.farm-notes p{margin:10px 0;line-height:1.6}.notice{padding:12px;border-radius:10px;background:#fff5d7}.farm-notes form{display:grid;gap:14px;margin:20px 0}.farm-notes label{display:grid;gap:6px;font-weight:600;margin:10px 0}.farm-notes input:not([type=checkbox]),.farm-notes textarea,.farm-notes select{width:100%;min-width:0;border:1px solid #91a58e;border-radius:9px;padding:10px;background:white;color:#213b27}.farm-notes button{border-radius:9px;background:#285c34;color:white;padding:11px 16px;font-weight:600;min-height:44px;white-space:normal}.farm-notes button:disabled{opacity:.5;cursor:not-allowed}.farm-notes :focus-visible{outline:3px solid #c18420;outline-offset:3px}.farm-notes .check{display:flex;align-items:center;gap:10px}.notes-list{display:grid;gap:16px;margin-top:20px}.notes-list li{border:1px solid #dce5da;padding:16px;border-radius:12px;overflow-wrap:anywhere}.note-body{white-space:pre-wrap}@media(max-width:480px){.notes-list button{width:100%;margin-top:8px}}
</style>
