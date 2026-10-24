<script setup>
import { NotebookPen, Plus, CloudCheck, CloudOff, RefreshCw, Copy, Trash2, Mic, FileCheck } from 'lucide-vue-next'
import { addNote, loadNotes, persistNotes, mergeServerNotes, syncPending, transcriptDraft } from '../utils/offline-notes.js'
const props = defineProps({ user: { type: Object, default: () => ({}) }, mode: { type: String, default: 'notes' } })
const emit = defineEmits(['records-changed'])
const notes = ref([])
const composing = ref(false)
const editorElement = ref(null)
watch(composing, open => { if (open) nextTick(() => editorElement.value?.querySelector('input')?.focus()) })
const pendingCount = computed(() => notes.value.filter(note => note.status !== 'synced').length)
const title = ref('')
const body = ref('')
const transcript = ref('')
const language = ref('en-NG')
const online = ref(false)
const busy = ref(false)
const recordBusy = ref(false)
const listening = ref(false)
const microphonePending = ref(false)
const elapsedSeconds = ref(0)
let listeningTimer
const elapsedLabel = computed(() => `${Math.floor(elapsedSeconds.value / 60).toString().padStart(2, '0')}:${(elapsedSeconds.value % 60).toString().padStart(2, '0')}`)
function endIndicator() { clearInterval(listeningTimer); listeningTimer = undefined; listening.value = false; microphonePending.value = false }
const supported = ref(false)
const error = ref('')
const storageWarning = ref('')
const feedback = ref('')
const reviewed = ref(false)
const record = reactive(transcriptDraft(''))
let storage, recognition, mounted = false, generation = 0, controller
const owner = computed(() => props.user?.id ? String(props.user.id) : '')
function persist() { storageWarning.value = persistNotes(storage, owner.value, notes.value) }
function stopListening() { if (recognition) { recognition.onstart = null; recognition.onresult = null; recognition.onend = null; recognition.onerror = null; recognition.abort(); recognition = null } endIndicator() }
function resetUser() {
  generation++; controller?.abort(); stopListening(); busy.value = false; recordBusy.value = false
  notes.value = []; title.value = ''; body.value = ''; transcript.value = ''; error.value = ''; feedback.value = ''; reviewed.value = false
  composing.value = false
  Object.assign(record, transcriptDraft(''))
  if (!mounted || props.mode === 'voice') return
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
  finally { if (token === generation) { busy.value = false; if (mounted && online.value && !error.value && notes.value.some(note => note.status === 'pending')) nextTick(() => { if (mounted && token === generation) sync() }) } }
}
function saveNote() {
  if (!owner.value || !title.value.trim() || !body.value.trim()) return
  if (title.value.trim().length > 160 || body.value.trim().length > 3000) { error.value = 'Use a title up to 160 characters and note text up to 3,000 characters.'; return }
  if (!globalThis.crypto?.randomUUID) { error.value = 'Secure note IDs are unavailable in this browser. Copy your draft and use a secure HTTPS connection.'; return }
  notes.value = addNote(notes.value, { id: crypto.randomUUID(), title: title.value.trim(), body: body.value.trim() })
  persist(); title.value = ''; body.value = ''; composing.value = false; feedback.value = 'Note saved on this page. Pending notes sync when connected.'; sync()
}
async function deleteNote(note) {
  if (!online.value || busy.value || !window.confirm('Delete this note from this device and your account?')) return
  const token = generation
  busy.value = true; error.value = ''
  try {
    await $fetch(`/api/tools/notes/${encodeURIComponent(note.id)}`, { method: 'DELETE' })
    if (token === generation) { notes.value = notes.value.filter(n => n.id !== note.id); persist() }
  } catch (cause) { if (token === generation) { if (note.status === 'pending' && (cause?.statusCode === 404 || cause?.response?.status === 404)) { notes.value = notes.value.filter(n => n.id !== note.id); persist(); feedback.value = 'Unsynced note removed from this device.' } else error.value = 'Could not delete. The note has been kept. Retry online.' } }
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
    transcript.value = `${transcript.value} ${text}`.trim().slice(0, 2000)
  }
  recognition.onstart = () => {
    if (token !== generation) return
    microphonePending.value = false; listening.value = true; elapsedSeconds.value = 0
    const started = Date.now()
    listeningTimer = setInterval(() => { elapsedSeconds.value = Math.floor((Date.now() - started) / 1000) }, 250)
  }
  recognition.onerror = () => { if (token === generation) { error.value = 'Browser dictation could not continue. Check microphone permission or type below.'; endIndicator() } }
  recognition.onend = () => { if (token === generation) endIndicator() }
  try { microphonePending.value = true; recognition.start() } catch { endIndicator(); error.value = 'Could not start dictation. You can always type below.' }
}
function prepareRecord() { Object.assign(record, transcriptDraft(transcript.value)); reviewed.value = false; feedback.value = 'Draft prepared. Choose a category and review every field before confirming.' }
watch(record, () => { reviewed.value = false }, { flush: 'sync' })
async function saveRecord() {
  if (!reviewed.value || !online.value || !owner.value || !record.title.trim() || recordBusy.value) return
  if (record.category !== 'activity' && (!Number.isFinite(Number(record.amount)) || Number(record.amount) <= 0)) { error.value = 'Enter a positive amount for income or expense.'; return }
  if (record.note.length > 2000) { error.value = 'Shorten the record note to 2,000 characters before saving.'; return }
  const token = generation
  recordBusy.value = true; error.value = ''
  try {
    await $fetch('/api/farm/records', { method: 'POST', body: { ...record, title: record.title.trim(), amount: record.category === 'activity' ? 0 : Number(record.amount) } })
    if (token === generation) { feedback.value = 'Farm record saved.'; Object.assign(record, transcriptDraft('')); reviewed.value = false; emit('records-changed') }
  } catch { if (token === generation) error.value = 'Record save was not confirmed. Check farm records before retrying to avoid duplicates. Your draft is kept.' }
  finally { if (token === generation) recordBusy.value = false }
}
function connectionChanged() { online.value = navigator.onLine; if (online.value && props.mode !== 'voice') sync() }
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
    <header class="notebook-header"><div class="notebook-title"><NotebookPen :size="32" aria-hidden="true" /><div><h2>{{ mode === 'voice' ? 'Speak it. Review it. Save it.' : 'Your field notebook' }}</h2><p>{{ mode === 'voice' ? 'From spoken observation to a checked farm record.' : 'Small observations. A clearer picture of your farm.' }}</p></div></div><span class="connection" :class="{ offline: !online }"><component :is="online ? CloudCheck : CloudOff" :size="18" aria-hidden="true" />{{ online ? 'Connected' : 'Offline' }}</span></header>
    <template v-if="mode !== 'voice'">
    <p class="notice"><strong>Device privacy:</strong> Notes are stored unencrypted in this browser for your account. Anyone using this device may access browser storage. Avoid sensitive information on shared devices. Signing out does not erase saved notes.</p>
    <p>Saved notes are accessible while this page remains open. Reopening offline is not guaranteed. {{ online ? 'Connected' : 'Offline' }}.</p>
    </template>
    <p v-if="mode === 'voice'" class="notice">Transcripts are drafts on this page, not saved audio. Review before saving. {{ online ? 'Connected. Confirmed records save to your account.' : 'Offline. Reconnect before saving a record.' }} Leaving this tool clears unsaved drafts.</p>
    <p v-if="storageWarning" role="alert" class="notice">{{ storageWarning }}</p>
    <p v-if="error" role="alert" class="notice">{{ error }}</p>
    <p role="status" aria-live="polite">{{ feedback }}</p>
    <template v-if="mode === 'voice'">
      <p>Browser dictation uses your browser's speech service, not YarnGPT. Your browser may send audio to its provider and may need internet. YarnGPT voice AI is a separate assistant feature.</p>
      <label>Dictation language<select v-model="language" :disabled="listening || microphonePending"><option value="en-NG">English (Nigeria)</option><option value="en-GB">English (UK)</option><option value="yo-NG">Yorùbá</option><option value="ha-NG">Hausa</option><option value="ig-NG">Igbo</option></select></label>
      <p v-if="!supported">Browser dictation is unavailable. Type or paste your transcript below.</p>
      <button v-if="supported" type="button" :disabled="!owner" @click="listening || microphonePending ? stopListening() : startListening()"><Mic :size="18" aria-hidden="true" />{{ listening ? 'Stop dictation' : microphonePending ? 'Cancel microphone request' : 'Enable microphone and start browser dictation' }}</button>
      <p v-if="microphonePending" role="status">Waiting for microphone permission. Dictation has not started.</p>
      <div v-if="listening" class="listening-panel">
        <span class="listening-dot" aria-hidden="true" />
        <div><strong role="status">Listening. Speak now.</strong><p>Your words will appear in the transcript below.</p></div>
        <span class="voice-bars" aria-hidden="true"><i v-for="bar in 5" :key="bar" :style="{ animationDelay: `${bar * 110}ms` }" /></span>
        <time aria-label="Elapsed dictation time">{{ elapsedLabel }}</time>
        <button type="button" @click="stopListening">Stop</button>
      </div>
      <label>Transcript (editable)<textarea v-model="transcript" maxlength="2000" rows="4" /></label>
      <button type="button" :disabled="!transcript.trim()" @click="prepareRecord"><FileCheck :size="18" aria-hidden="true" />Prepare record draft</button>
      <form :aria-busy="recordBusy" @submit.prevent="saveRecord">
        <h3>Review record draft</h3><p>No money or currency is inferred. Activity is the default. Financial amounts use your farm account's currency.</p>
        <label>Category<select v-model="record.category"><option value="activity">Activity (no money)</option><option value="income">Income</option><option value="expense">Expense</option></select></label>
        <label>Record title<input v-model="record.title" required maxlength="160"></label>
        <label v-if="record.category !== 'activity'">Amount in account currency<input v-model="record.amount" type="number" required min="0.01" step="0.01" inputmode="decimal"></label>
        <label>Record note<textarea v-model="record.note" maxlength="2000" rows="3" /></label>
        <label class="check"><input v-model="reviewed" type="checkbox" required> I reviewed the category, title, amount and note.</label>
        <button :disabled="!reviewed || !online || recordBusy || !owner">{{ recordBusy ? 'Saving…' : 'Confirm and save farm record' }}</button>
      </form>
    </template>
    <template v-else>
      <p v-if="!owner" class="notice">Sign in to keep notes for your account.</p>
      <div class="notebook-workspace">
      <aside class="capture-dock"><NotebookPen :size="40" aria-hidden="true" /><h3>What did you notice?</h3><p>Capture a field check, a crop change or a thought for tomorrow.</p><button type="button" :disabled="!owner" :aria-expanded="composing" aria-controls="note-editor" @click="composing = true"><Plus :size="20" aria-hidden="true" />Write a field note</button><p class="capture-hint">Text notes work offline while this page is open.</p></aside>
      <div class="notebook-pages">
      <form v-if="composing" id="note-editor" ref="editorElement" class="note-editor" @submit.prevent="saveNote">
        <h3>New field observation</h3><p>Edit before saving. Saved notes are immutable to avoid offline conflicts. To change one, copy it into a new draft and delete the old note online.</p>
        <label>Note title<input v-model="title" required maxlength="160" :disabled="!owner" placeholder="e.g. North field after the rain"></label>
        <label>Note text<textarea v-model="body" required maxlength="3000" rows="6" :disabled="!owner" placeholder="What changed? What needs checking next?" /></label>
        <div class="note-actions"><button :disabled="!owner || !title.trim() || !body.trim()"><NotebookPen :size="18" aria-hidden="true" />Save note on device</button><button class="secondary" type="button" @click="composing = false">Close draft</button></div><p>Closing keeps this draft on this page. Leaving or switching accounts clears it.</p>
      </form>
      <div class="page-heading"><div><h3>Your observations</h3><p>{{ notes.length - pendingCount }} saved to account · {{ pendingCount }} device-only, awaiting sync</p></div><button class="secondary" type="button" :disabled="busy || !online || !owner" :aria-busy="busy" @click="sync"><RefreshCw :size="18" aria-hidden="true" />{{ busy ? 'Syncing…' : 'Retry / refresh sync' }}</button></div>
      <div v-if="!notes.length" class="notebook-empty"><NotebookPen :size="36" aria-hidden="true" /><h3>A season starts with an observation.</h3><p>Your saved field notes will collect here. Write your first note to get started.</p></div>
      <ul class="notes-list"><li v-for="note in notes" :key="note.id" :class="{ pending: note.status !== 'synced' }"><p class="save-state"><component :is="note.status === 'synced' ? CloudCheck : CloudOff" :size="18" aria-hidden="true" />{{ note.status === 'synced' ? 'Saved to account' : 'Device only · Not synced' }}</p><h3>{{ note.title }}</h3><p class="note-body">{{ note.body }}</p><div class="note-actions"><button class="secondary" type="button" @click="title = note.title; body = note.body; composing = true"><Copy :size="16" aria-hidden="true" />Copy to new draft</button><button class="secondary" type="button" :disabled="!online || busy" @click="deleteNote(note)"><Trash2 :size="16" aria-hidden="true" />Delete online</button></div></li></ul>
      </div></div>
    </template>
  </section>
</template>

<style scoped>
.listening-panel{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:16px 0;padding:16px;border:1px solid #a4c8ad;border-radius:14px;background:#edf7ee}.listening-panel p{font-size:12px;margin:3px 0}.listening-panel time{font-variant-numeric:tabular-nums;font-weight:700}.listening-dot{width:10px;height:10px;background:#066136;border-radius:50%;animation:record-pulse 1.2s ease-in-out infinite}.voice-bars{display:flex;align-items:center;gap:3px;height:30px;margin-left:auto}.voice-bars i{display:block;width:4px;height:24px;border-radius:4px;background:#066136;animation:voice-wave .8s ease-in-out infinite alternate}@keyframes voice-wave{from{transform:scaleY(.25)}to{transform:scaleY(1)}}@keyframes record-pulse{50%{opacity:.35}}@media(prefers-reduced-motion:reduce){.listening-dot,.voice-bars i{animation:none}}
.farm-notes{background:#fff;border:1px solid #dce5da;border-radius:20px;padding:clamp(16px,4vw,32px);color:#213b27;max-width:900px}.farm-notes h2{font-size:1.5rem;font-weight:700}.farm-notes h3{font-weight:700;margin-top:12px}.farm-notes p{margin:10px 0;line-height:1.6}.notice{padding:12px;border-radius:10px;background:#fff5d7}.farm-notes form{display:grid;gap:14px;margin:20px 0}.farm-notes label{display:grid;gap:6px;font-weight:600;margin:10px 0}.farm-notes input:not([type=checkbox]),.farm-notes textarea,.farm-notes select{width:100%;min-width:0;border:1px solid #91a58e;border-radius:9px;padding:10px;background:white;color:#213b27}.farm-notes button{border-radius:9px;background:#285c34;color:white;padding:11px 16px;font-weight:600;min-height:44px;white-space:normal}.farm-notes button:disabled{opacity:.5;cursor:not-allowed}.farm-notes :focus-visible{outline:3px solid #c18420;outline-offset:3px}.farm-notes .check{display:flex;align-items:center;gap:10px}.notes-list{display:grid;gap:16px;margin-top:20px}.notes-list li{border:1px solid #dce5da;padding:16px;border-radius:12px;overflow-wrap:anywhere}.note-body{white-space:pre-wrap}@media(max-width:480px){.notes-list button{width:100%;margin-top:8px}}
</style>
<style scoped>
.farm-notes{font-family:'Plus Jakarta Sans',sans-serif;max-width:none;background:#f5f8f0;border-radius:28px}.notebook-header,.notebook-title,.page-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.notebook-title{justify-content:flex-start;flex-wrap:nowrap}.notebook-title>svg{flex-shrink:0;color:#356440}.notebook-header h2{font-size:clamp(1.5rem,4vw,2rem);font-weight:800}.notebook-header p{color:#52684d}.connection,.save-state{display:flex;align-items:center;gap:8px;font-size:.8rem;font-weight:700;color:#285c34}.connection{background:#e1edd9;border-radius:24px;padding:10px 14px}.connection.offline{background:#f8e6a3;color:#684b13}.notebook-workspace{display:grid;grid-template-columns:minmax(200px,.7fr) minmax(0,1.7fr);gap:28px;margin-top:28px}.capture-dock{align-self:start;background:#e6efd9;padding:24px;border-radius:24px;position:sticky;top:20px}.capture-dock>svg{color:#376540;margin-bottom:16px}.capture-dock h3{font-size:1.4rem;line-height:1.3}.capture-dock .capture-hint{font-size:.8rem;margin-top:18px}.notebook-pages{min-width:0}.farm-notes .note-editor{background:white;border:2px solid #c8d8b9;border-radius:22px;padding:24px;margin-top:0}.farm-notes button{display:inline-flex;justify-content:center;align-items:center;gap:8px;min-width:44px}.farm-notes button.secondary{background:white;border:1px solid #a7ba9b;color:#315c36}.farm-notes input:not([type=checkbox]),.farm-notes select{min-height:44px}.farm-notes .check{min-height:44px}.farm-notes .check input{width:24px;height:24px;flex-shrink:0}.notes-list{padding:0;list-style:none}.notes-list li{background:white;border-radius:4px 22px 22px 4px;border-left:5px solid #699661;padding:24px}.notes-list li.pending{border-left-color:#dfb43b;background:#fffdf1}.notes-list .pending .save-state{color:#745611}.notes-list h3{font-size:1.2rem}.note-body{line-height:1.8!important;padding:12px 0}.note-actions{display:flex;gap:10px;flex-wrap:wrap}.notebook-empty{padding:40px 20px;text-align:center;border:1px dashed #abbf9b;border-radius:24px;margin-top:20px}.notebook-empty>svg{margin:auto;color:#678658}.farm-notes .notice{font-size:.85rem}.farm-notes :deep(svg){flex-shrink:0}@media(max-width:700px){.notebook-workspace{grid-template-columns:1fr;gap:20px}.capture-dock{position:static}.capture-dock>svg{display:none}.capture-dock h3{margin-top:0}.page-heading{align-items:flex-start}.notes-list li,.farm-notes .note-editor{padding:16px}.notebook-title{align-items:flex-start}.note-actions button{flex:1 1 160px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style>
