<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { Sprout, Plus, Camera, Mic, ArrowUpRight, X, Leaf, Stethoscope, Volume2, MessageCircle, PlugZap, Beef } from 'lucide-vue-next'
import FarmScan from './FarmScan.vue'
import FarmAnimalScan from './FarmAnimalScan.vue'
import { createChatRecorder } from '../utils/chat-recorder.js'
const props = defineProps({ user: { type: Object, required: true } })
const emit = defineEmits(['records-changed'])
const workspace = ref('chat')
const photoMode = ref(false)
const viewportHeight = ref(null)
const keyboardOpen = ref(false)
function updateChatViewport() {
  viewportHeight.value = window.visualViewport?.height || null
  keyboardOpen.value = Boolean(viewportHeight.value && window.innerHeight - viewportHeight.value > 120)
}
function changeWorkspace(value) {
  releaseDictation()
  clearAudio()
  workspace.value = value
  photoMode.value = false
}
async function choosePhotoMode() {
  if (!status.value?.photo) { changeWorkspace('scan'); return }
  changeWorkspace('chat')
  photoMode.value = true
  await nextTick()
  if (status.value?.chat && status.value?.photo) picker.value?.click()
  else draft.value?.focus()
}
async function askAboutPlant(value) {
  if (busy.value || speaking.value || typeof value !== 'string') return
  clearSession()
  changeWorkspace('chat')
  task.value = 'plant-health'
  question.value = value.slice(0, 4000)
  await nextTick()
  draft.value?.focus()
}
async function askAboutAnimal(value) {
  if (busy.value || speaking.value) return
  clearSession()
  changeWorkspace('chat')
  task.value = 'animal-health'
  question.value = String(value || 'What should I check about visible changes on my cow?').slice(0, 4000)
  await nextTick()
  draft.value?.focus()
}
const status = ref(null)
const checkingStatus = ref(false)
const statusError = ref('')
let statusController
let statusGeneration = 0
async function refreshStatus() {
  if (checkingStatus.value || disposed) return
  checkingStatus.value = true
  statusError.value = ''
  const generation = ++statusGeneration
  statusController = new AbortController()
  try {
    const result = await $fetch('/api/assistant/status', { signal: statusController.signal, timeout: 10000 })
    if (!disposed && generation === statusGeneration) status.value = result
  } catch {
    if (!disposed && generation === statusGeneration) statusError.value = 'Could not check the AI connection. Check your connection and try again.'
  } finally { if (!disposed && generation === statusGeneration) checkingStatus.value = false }
}
const messages = ref([])
const question = ref('')
const task = ref(props.user.farmType === 'livestock' ? 'animal-health' : props.user.farmType === 'crops' ? 'plant-health' : 'chat')
const image = ref(null)
const filename = ref('')
const includeFarmContext = ref(false)
function changeFarmContext(event) {
  const enabled = typeof event === 'boolean' ? event : event.target.checked
  clearSession()
  includeFarmContext.value = enabled
}
function safeSources(sources) {
  if (!Array.isArray(sources)) return []
  return sources.filter(source => source && typeof source.id === 'string' && source.id.length <= 100 && typeof source.title === 'string' && source.title.length <= 300 && typeof source.url === 'string' && source.url.length <= 1000 && /^https:\/\/(?:www\.fao\.org|agr\.wa\.gov)\//.test(source.url)).slice(0, 5)
}
const busy = ref(false)
const speaking = ref(false)
const error = ref('')
const audioUrl = ref('')
const picker = ref(null)
const draft = ref(null)
const historyPanel = ref(null)
async function revealLatestReply() {
  await nextTick()
  const panel = historyPanel.value
  if (panel) panel.scrollTo({ top: panel.scrollHeight, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth' })
}
const farmLabel = computed(() => props.user.farmType === 'livestock' ? 'Livestock farm' : props.user.farmType === 'crops' ? 'Crop farm' : 'Mixed farm')
const starters = [
  { icon: Leaf, label: 'Check my crops', task: 'plant-health', text: 'I noticed a change in my crops. The crop is ... and the symptoms are ...' },
  { icon: Stethoscope, label: 'Care for my animals', task: 'animal-health', text: 'I need help with my animal. The animal is ... and I have noticed ...' },
  { icon: Sprout, label: 'Plan my next steps', task: 'chat', text: 'Help me plan my next farm tasks. I am growing or raising ...' }
]
function fillPrompt(starter) {
  if (busy.value || dictationActive.value) return
  task.value = starter.task
  question.value = starter.text
  nextTick(() => draft.value?.focus())
}
const dictationSupported = ref(false)
const listening = ref(false)
const dictationPending = ref(false)
const dictationStopping = ref(false)
const dictationActive = computed(() => listening.value || dictationPending.value || dictationStopping.value)
const dictationSeconds = ref(0)
const dictationTime = computed(() => `${Math.floor(dictationSeconds.value / 60).toString().padStart(2, '0')}:${(dictationSeconds.value % 60).toString().padStart(2, '0')}`)
const dictationLanguage = ref('en-NG')
const dictationNotice = ref('')
const dictationLanguages = [
  { code: 'en-NG', label: 'English (Nigeria)' },
  { code: 'en-US', label: 'English (United States)' },
  { code: 'ha-NG', label: 'Hausa' },
  { code: 'yo-NG', label: 'Yoruba' },
  { code: 'fr-FR', label: 'French' },
  { code: 'sw-KE', label: 'Swahili' }
]
let recognition
let audioRecorder
let transcriptionController
let microphoneGeneration = 0
let dictationTimer
let dictationClock
let disposed = false
let controller
let readGeneration = 0
let sessionGeneration = 0
function releaseDictation() {
  microphoneGeneration++
  audioRecorder?.cancel()
  audioRecorder = undefined
  transcriptionController?.abort()
  transcriptionController = undefined
  const active = recognition
  recognition = undefined
  clearTimeout(dictationTimer)
  clearInterval(dictationClock)
  listening.value = false
  dictationPending.value = false
  dictationStopping.value = false
  dictationSeconds.value = 0
  if (active) {
    active.onstart = active.onresult = active.onerror = active.onend = null
    try { active.abort() } catch { /* Already ended. */ }
  }
}
function stopDictation() {
  if (audioRecorder) {
    if (dictationStopping.value) return
    if (dictationPending.value) { releaseDictation(); dictationNotice.value = 'Microphone cancelled.'; return }
    audioRecorder.stop()
    return
  }
  if (!recognition || dictationStopping.value) return
  if (dictationPending.value) { releaseDictation(); dictationNotice.value = 'Dictation cancelled. You can still type your question.'; return }
  dictationStopping.value = true
  listening.value = false
  clearInterval(dictationClock)
  dictationNotice.value = 'Finishing dictation. Review and edit the text before pressing Send.'
  try { recognition.stop() } catch { releaseDictation() }
  clearTimeout(dictationTimer)
  if (recognition) dictationTimer = setTimeout(releaseDictation, 3000)
}
function startDictation() {
  if (disposed || dictationActive.value || busy.value || speaking.value || !dictationSupported.value) return
  if (question.value.length >= 4000) { dictationNotice.value = 'The question is full. Shorten it before dictating more.'; return }
  releaseDictation()
  if (status.value?.transcription && navigator.mediaDevices?.getUserMedia && window.MediaRecorder) { startNativeDictation(); return }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  const generation = sessionGeneration
  try {
    const active = new Recognition()
    recognition = active
    active.lang = dictationLanguage.value
    active.continuous = true
    active.interimResults = false
    active.maxAlternatives = 1
    active.onstart = () => {
      if (disposed || generation !== sessionGeneration || recognition !== active || dictationStopping.value || listening.value) return
      clearTimeout(dictationTimer)
      dictationPending.value = false
      listening.value = true
      const started = Date.now()
      dictationClock = setInterval(() => { dictationSeconds.value = Math.min(60, Math.floor((Date.now() - started) / 1000)) }, 250)
      dictationNotice.value = 'Listening. Speech is added to your editable question, never sent automatically.'
      dictationTimer = setTimeout(stopDictation, 60000)
    }
    active.onresult = event => {
      if (disposed || generation !== sessionGeneration || recognition !== active) return
      for (let index = event.resultIndex; index < event.results.length; index++) {
        if (!event.results[index].isFinal) continue
        const transcript = event.results[index][0]?.transcript?.trim()
        if (transcript) question.value = `${question.value.trimEnd()}${question.value.trim() ? ' ' : ''}${transcript}`.slice(0, 4000)
      }
      if (question.value.length >= 4000) stopDictation()
    }
    active.onerror = event => {
      if (recognition !== active) return
      dictationNotice.value = ['not-allowed', 'service-not-allowed'].includes(event.error)
        ? 'Microphone permission was denied. You can still type your question.'
        : event.error === 'language-not-supported'
          ? 'This browser does not support the selected language. Choose another language or type your question.'
          : 'Dictation is unavailable or no speech was heard. Please type your question or try again.'
      releaseDictation()
    }
    active.onend = () => {
      if (recognition !== active) return
      releaseDictation()
      dictationNotice.value = 'Dictation stopped. Review and edit your question, then press Send when ready.'
    }
    dictationPending.value = true
    dictationNotice.value = 'Waiting for microphone permission. Allow access in your browser or cancel.'
    dictationTimer = setTimeout(() => { releaseDictation(); dictationNotice.value = 'Microphone did not start. Please try again or type your question.' }, 15000)
    active.start()
  } catch {
    releaseDictation()
    dictationNotice.value = 'Could not start microphone dictation. Please type your question instead.'
  }
}
async function startNativeDictation() {
  const generation = microphoneGeneration
  const current = () => !disposed && generation === microphoneGeneration
  audioRecorder = createChatRecorder({
    mediaDevices: navigator.mediaDevices, MediaRecorder: window.MediaRecorder,
    onState(state) {
      if (!current()) return
      dictationPending.value = state === 'permission'
      listening.value = state === 'recording'
      dictationStopping.value = state === 'processing'
      clearInterval(dictationClock)
      if (state === 'permission') dictationNotice.value = 'Allow microphone access, then speak.'
      if (state === 'recording') {
        const started = Date.now()
        dictationClock = setInterval(() => { dictationSeconds.value = Math.min(60, Math.floor((Date.now() - started) / 1000)) }, 250)
        dictationNotice.value = 'Listening. Stop to turn your recording into text.'
      }
    },
    onError() { if (current()) { releaseDictation(); dictationNotice.value = 'Microphone unavailable. Check permission or type your question.' } },
    async onAudio(blob) {
      if (!current()) return
      dictationStopping.value = true
      dictationNotice.value = 'Turning your recording into text…'
      transcriptionController = new AbortController()
      try {
        const audio = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = () => reject(new Error('Audio could not be read'))
          reader.readAsDataURL(new Blob([blob], { type: blob.type.split(';')[0] }))
        })
        if (!current()) return
        const result = await $fetch('/api/assistant/transcribe', { method: 'POST', retry: 0, timeout: 50000, signal: transcriptionController.signal, body: { audio, language: dictationLanguage.value.split('-')[0] } })
        if (!current()) return
        if (typeof result.text !== 'string') throw new Error('Invalid transcription')
        question.value = `${question.value.trimEnd()}${question.value.trim() && result.text.trim() ? ' ' : ''}${result.text.trim()}`.slice(0, 4000)
        dictationNotice.value = result.text.trim() ? 'Ready. Check the words, then Send.' : 'No words heard. Try again or type.'
        await nextTick()
        if (current()) draft.value?.focus({ preventScroll: true })
      } catch (failure) {
        if (current()) dictationNotice.value = failure?.data?.statusMessage || 'Could not turn the recording into text. Try again or type.'
      } finally { if (current()) { dictationStopping.value = false; audioRecorder = undefined; transcriptionController = undefined } }
    }
  })
  await audioRecorder.start()
}
function clearAudio() { if (audioUrl.value) URL.revokeObjectURL(audioUrl.value); audioUrl.value = '' }
function removeImage() { readGeneration++; image.value = null; filename.value = ''; if (picker.value) picker.value.value = '' }
async function chooseImage(event) {
  const file = event.target.files?.[0]
  removeImage()
  if (!file) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) { error.value = 'Choose a JPEG, PNG or WebP photo up to 3 MB.'; return }
  const generation = readGeneration
  const reader = new FileReader()
  reader.onload = () => { if (!disposed && generation === readGeneration) { image.value = reader.result; filename.value = file.name } }
  reader.onerror = () => { error.value = 'Could not read this photo.' }
  reader.readAsDataURL(file)
}
async function send() {
  if (!status.value?.chat || busy.value || speaking.value || dictationActive.value || !question.value.trim() || (image.value && !status.value?.photo)) return
  busy.value = true
  error.value = ''
  controller = new AbortController()
  const generation = sessionGeneration
  const content = question.value.trim()
  const history = [...messages.value.map(item => ({ role: item.role, content: item.content.slice(0, 4000) })), { role: 'user', content }].slice(-5)
  try {
    const result = await $fetch('/api/assistant/chat', { method: 'POST', timeout: 65000, retry: 0, body: { task: task.value, messages: history, includeFarmContext: includeFarmContext.value, ...(image.value ? { image: image.value } : {}) }, signal: controller.signal })
    if (disposed || generation !== sessionGeneration) return
    const panel = historyPanel.value
    const followReply = !messages.value.length || !panel || panel.scrollHeight - panel.scrollTop - panel.clientHeight < 96
    messages.value = [...messages.value, { role: 'user', content, photo: Boolean(image.value) }, { role: 'assistant', content: result.text, model: result.model, sources: safeSources(result.sources), contextUsed: result.contextUsed === true }].slice(-16)
    question.value = ''
    removeImage()
    if (followReply) await revealLatestReply()
  } catch (failure) { if (!disposed && generation === sessionGeneration) error.value = failure?.data?.statusMessage || (failure?.statusCode === 401 ? 'Please sign in again.' : 'Unable to get an answer. Check your connection or try again later.') }
  finally { if (generation === sessionGeneration) busy.value = false }
}
async function speak(message) {
  if (busy.value || speaking.value || dictationActive.value) return
  speaking.value = true
  error.value = ''
  clearAudio()
  controller = new AbortController()
  const generation = sessionGeneration
  try {
    const blob = await $fetch('/api/assistant/speak', { method: 'POST', timeout: 50000, retry: 0, body: { text: message.content.slice(0, 4000) }, responseType: 'blob', signal: controller.signal })
    if (!disposed && generation === sessionGeneration) audioUrl.value = URL.createObjectURL(blob)
  } catch (failure) { if (!disposed && generation === sessionGeneration) error.value = failure?.data?.statusMessage || 'Voice is unavailable. The written answer is still available.' }
  finally { if (generation === sessionGeneration) speaking.value = false }
}
function clearSession() { includeFarmContext.value = false; sessionGeneration++; releaseDictation(); dictationNotice.value = ''; error.value = ''; controller?.abort(); busy.value = false; speaking.value = false; messages.value = []; question.value = ''; removeImage(); clearAudio() }
watch(() => props.user.id, () => { statusController?.abort(); clearSession(); status.value = null; checkingStatus.value = false; refreshStatus() })
onMounted(() => {
  updateChatViewport()
  window.visualViewport?.addEventListener('resize', updateChatViewport)
  dictationSupported.value = Boolean((navigator.mediaDevices?.getUserMedia && window.MediaRecorder) || window.SpeechRecognition || window.webkitSpeechRecognition)
  refreshStatus()
})
onBeforeUnmount(() => { window.visualViewport?.removeEventListener('resize', updateChatViewport); disposed = true; statusController?.abort(); clearSession() })
</script>

<template>
  <section aria-labelledby="farm-assistant-title" class="farm-companion" :class="{ 'has-thread': messages.length, 'chat-workspace': workspace === 'chat', 'keyboard-open': keyboardOpen }" :style="viewportHeight ? { '--chat-viewport-height': `${viewportHeight}px` } : undefined">
    <header class="companion-bar">
      <div class="companion-brand"><span class="brand-icon"><Sprout :size="20" /></span><div><h2 id="farm-assistant-title">FarmBuddyAI</h2><p><span class="status-dot" :class="{ ready: status?.chat }" />{{ statusError ? 'Connection check failed' : status ? (status.chat ? 'AI chat configured' : 'Setup needed to send') : 'Checking availability…' }}</p></div></div>
      <span class="farm-type">{{ farmLabel }}</span>
      <button v-if="workspace === 'chat'" type="button" class="new-conversation" @click="clearSession"><Plus :size="16" /> <span>New conversation</span></button>
    </header>

    <nav class="workspace-switch" aria-label="FarmBuddyAI tools">
      <button type="button" aria-label="Ask FarmBuddyAI a question" :disabled="busy || speaking" :aria-pressed="workspace === 'chat' && !photoMode" @click="changeWorkspace('chat')"><MessageCircle :size="22" aria-hidden="true" /><span><strong>Ask a question</strong><small>Work through your next step</small></span><span class="mobile-tool-name">Chat</span></button>
      <button type="button" aria-label="Discuss a photo with FarmBuddyAI" :disabled="busy || speaking" :aria-pressed="photoMode" @click="choosePhotoMode"><Camera :size="22" aria-hidden="true" /><span><strong>Discuss a photo</strong><small>General AI guidance</small></span><span class="mobile-tool-name">Photo</span></button>
      <button type="button" aria-label="Turn voice into a farm record" :disabled="busy || speaking" :aria-pressed="workspace === 'voice'" @click="changeWorkspace('voice')"><Mic :size="22" aria-hidden="true" /><span><strong>Voice to farm record</strong><small>Speak, review, then save</small></span><span class="mobile-tool-name">Record</span></button>
      <button type="button" aria-label="Scan a plant with Pl@ntNet" :disabled="busy || speaking" :aria-pressed="workspace === 'scan'" @click="changeWorkspace('scan')"><Leaf :size="22" aria-hidden="true" /><span><strong>Scan a plant</strong><small>Specialist image recognition</small></span><span class="mobile-tool-name">Plants</span></button>
      <button type="button" aria-label="Experimental cattle photo check" :disabled="busy || speaking" :aria-pressed="workspace === 'animal-scan'" @click="changeWorkspace('animal-scan')"><Beef :size="22" aria-hidden="true" /><span><strong>Check a cow photo</strong><small>Experimental visual screening</small></span><span class="mobile-tool-name">Cattle</span></button>
    </nav>
    <FarmAnimalScan v-if="workspace === 'animal-scan'" :user="user" @ask-ai="askAboutAnimal" />
    <FarmScan v-if="workspace === 'scan'" :user="user" @ask-ai="askAboutPlant" />
    <div v-if="workspace === 'voice'" class="voice-workspace"><p class="voice-intro">Turn spoken farm updates into records. Review the transcript and confirm any income or expense before saving. Saved financial entries appear in Bookkeeping.</p><FarmNotes :user="user" mode="voice" @records-changed="emit('records-changed')" /></div>
    <div v-show="workspace === 'chat'" class="companion-body">
      <div ref="historyPanel" class="chat-history" tabindex="0" aria-label="Chat messages and help">
      <details class="connection-details">
        <summary><PlugZap :size="17" aria-hidden="true" /><span>{{ statusError ? 'Connection check failed' : !status ? 'Checking AI availability…' : status.chat ? 'AI chat configured' : 'AI connection needs setup' }}<small v-if="status">Photos {{ status.photo ? 'configured' : 'not verified' }} · Spoken replies {{ status.voice ? 'configured' : 'not configured' }}</small></span><span class="connection-action">Connection details</span></summary>
      <div class="configuration-note" role="status">
        <p v-if="status?.chat">Chat is configured. Availability is checked when you send a question, not guaranteed by this check.</p>
        <p v-if="statusError">{{ statusError }}</p>
        <template v-if="status">
          <p v-if="!status.chat"><strong>Chat needs the Cloudflare AI connection.</strong> Open the deployed app, or run <code>npm run cf:dev</code> for a local Worker preview. No Cloudflare Workers AI key is needed. Your question stays here until connected.</p>
          <p v-if="status.chat && !status.photo" class="mt-2">The Cloudflare model handles text. Use Scan a plant for specialist photo recognition, or describe the photo here.</p>
          <p v-if="!status.voice" class="mt-2">Spoken AI replies need <code>YARNGPT_API_KEY</code>. YarnGPT uses its default voice unless the site owner sets optional <code>YARNGPT_VOICE</code>. Browser dictation is separate and depends on your browser and microphone permission.</p>
        </template>
        <p class="mt-2">Never enter or share API keys in the chat. Phone microphone access may require HTTPS.</p>
        <button type="button" class="mt-3 rounded-lg border border-[#cad7c3] px-3 py-2 font-semibold" :disabled="checkingStatus" @click="refreshStatus">{{ checkingStatus ? 'Checking connection…' : 'Check connection again' }}</button>
      </div>
      </details>

      <div v-if="!messages.length" class="welcome">
        <div class="welcome-emblem" aria-hidden="true"><Sprout :size="36" :stroke-width="1.4" /></div>
        <p class="eyebrow">A little support for a growing day</p>
        <h3>What is happening on<br class="desktop-break"> your farm today?</h3>
        <p class="welcome-copy">From a change in your crops to an animal that needs care,<br class="desktop-break"> let’s work through your next steps together.</p>
        <div class="starter-prompts" aria-label="Question starters">
          <button v-for="starter in starters" :key="starter.task" type="button" :disabled="busy || dictationActive" @click="fillPrompt(starter)"><component :is="starter.icon" :size="17" />{{ starter.label }}<ArrowUpRight :size="14" /></button>
        </div>
      </div>

      <ol v-if="messages.length" class="conversation" aria-label="Conversation" aria-live="polite">
        <li v-for="(message, index) in messages" :key="index" class="message" :class="message.role">
          <p class="message-author">{{ message.role === 'user' ? 'You' : 'FarmBuddyAI' }}</p>
          <p class="message-content">{{ message.content }}</p>
          <p v-if="message.photo" class="message-note">Photo shared with this question.</p>
          <p v-if="message.role === 'assistant'" class="message-note">{{ message.contextUsed ? 'Used a limited snapshot of your own farm records.' : 'No farm-record snapshot shared for this answer.' }}</p>
          <details v-if="message.sources?.length" class="knowledge-sources"><summary>Agricultural references supplied to this answer</summary><p>General guidance, not live outbreak reports or confirmation of a diagnosis. Check the references and local advice.</p><ul><li v-for="source in message.sources" :key="source.id"><a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.id }} · {{ source.title }}</a></li></ul></details>
          <button v-if="message.role === 'assistant' && status?.voice" type="button" class="read-aloud" :disabled="speaking || busy || dictationActive" @click="speak(message)"><Volume2 :size="15" />Read aloud with YarnGPT{{ message.content.length > 4000 ? ' (first 4,000 characters)' : '' }}</button>
        </li>
        <li v-if="busy" class="message assistant pending" role="status">Looking into your question…</li>
      </ol>

      </div>
      <div class="composer-area">
        <p v-if="photoMode" class="photo-mode-hint"><Camera :size="18" aria-hidden="true" />{{ status?.photo ? 'Add a clear photo, then describe what changed. You review sharing before sending.' : 'Photo analysis is not verified yet. You can describe what you see instead.' }}</p>
        <div class="farm-context-control"><button type="button" :aria-pressed="includeFarmContext" :disabled="busy || speaking" @click="changeFarmContext(!includeFarmContext)">{{ includeFarmContext ? '✓ Using farm records' : '+ Use farm records' }}</button><details><summary>Sharing details</summary><p>Optional: sends a limited snapshot of your own crop/animal register, stock, reminders, seasons, tasks and observations to Cloudflare Workers AI when you press Send. Excludes finances, private notes, contacts and team details. Changing this starts a new conversation and does not undo earlier sharing.</p></details></div>
        <form class="composer" @submit.prevent="send">
          <div class="composer-heading"><label for="assistant-task">Help with</label><select id="assistant-task" v-model="task" :disabled="busy"><option value="chat">General farming</option><option value="plant-health">Plant health</option><option value="animal-health">Animal health</option><option value="identify-crop">Identify a crop</option></select><span>{{ question.length.toLocaleString() }} / 4,000</span></div>
          <label for="assistant-question" class="sr-only">Your question</label>
          <textarea id="assistant-question" ref="draft" v-model="question" maxlength="4000" rows="3" required :disabled="busy" placeholder="Tell me what you’ve noticed. What crop or animal, and for how long?" />
          <div v-if="image" class="photo-review"><div class="photo-caption"><img :src="image" alt="Selected farm photo preview"><span>{{ filename }}</span><button type="button" class="icon-button" aria-label="Remove photo" :disabled="busy" @click="removeImage"><X :size="17" /></button></div><p>Send shares this photo with Cloudflare Workers AI.</p></div>
          <div class="composer-actions">
            <div class="input-tools">
              <input id="assistant-photo" ref="picker" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" :disabled="busy || !status?.chat || !status?.photo" @change="chooseImage">
              <button v-if="status?.photo" type="button" class="icon-button labeled-tool" aria-label="Attach a photo, JPEG, PNG or WebP up to 3 MB" title="Attach photo · up to 3 MB" :disabled="busy || !status?.chat || !status?.photo" @click="picker?.click()"><Camera :size="20" /><span>Photo</span></button>
              <button v-else type="button" class="icon-button labeled-tool" aria-label="Scan a plant photo with Pl@ntNet" :disabled="busy || speaking" @click="changeWorkspace('scan')"><Camera :size="20" /><span>Photo</span></button>
              <button type="button" class="icon-button labeled-tool" :class="{ recording: listening }" :aria-label="dictationActive ? 'Stop dictation' : 'Start dictation'" :aria-pressed="dictationActive" aria-describedby="assistant-dictation-privacy" :disabled="!dictationSupported || (!dictationActive && (busy || speaking))" @click="dictationActive ? stopDictation() : startDictation()"><Mic :size="20" /><span>{{ dictationActive ? 'Stop dictation' : 'Dictate' }}</span></button>
              <template v-if="dictationSupported"><label for="assistant-dictation-language" class="sr-only">Dictation language</label><select id="assistant-dictation-language" v-model="dictationLanguage" :disabled="dictationActive || busy || speaking"><option v-for="language in dictationLanguages" :key="language.code" :value="language.code">{{ language.label }}</option></select></template>
              <span v-else class="typing-fallback">Type your question</span>
            </div>
            <button type="submit" class="send-button" :aria-label="image ? 'Send question and photo' : 'Send question'" :disabled="busy || speaking || dictationActive || !status?.chat || !question.trim() || Boolean(image && !status?.photo)"><span>Send</span><ArrowUpRight :size="19" /></button>
          </div>
        </form>
        <div v-if="dictationActive" class="dictation-session" :class="{ 'is-listening': listening }">
          <span v-if="listening" class="dictation-bars" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          <span v-else class="dictation-pending-dot" aria-hidden="true" />
          <strong>{{ dictationPending ? 'Microphone permission pending' : dictationStopping ? 'Finishing dictation…' : 'Listening to your question' }}</strong>
          <span v-if="listening || dictationStopping" class="dictation-time" aria-label="Elapsed dictation time">{{ dictationTime }}</span>
          <button type="button" :disabled="dictationStopping" @click="stopDictation">{{ dictationPending ? 'Cancel' : dictationStopping ? 'Stopping…' : 'Stop dictation' }}</button>
        </div>
        <p v-if="dictationNotice" role="status" class="inline-notice">{{ dictationNotice }}</p>
        <p v-if="error" role="alert" class="inline-notice error-notice">{{ error }}</p>
        <p v-if="busy || speaking" role="status" class="inline-notice">{{ busy ? 'Asking FarmBuddyAI…' : 'Preparing YarnGPT voice audio…' }}</p>
        <audio v-if="audioUrl" :src="audioUrl" controls aria-label="YarnGPT spoken answer" @error="error = 'Audio could not be played. Please use the written answer.'" />
        <details class="guidance-details"><summary>AI guidance, not a diagnosis · Safety &amp; privacy</summary><div><p>Photos can be misleading. For urgent animal distress or rapid disease spread, contact a qualified local expert immediately.</p><p>Conversation stays in this page’s memory only. Sending a question shares your farm profile and selected photo with Cloudflare Workers AI. Your saved farm records are included only if you opt in above. FarmBuddy retrieves short, sourced agricultural guidance to support answers. This app does not train or retrain a model on your chats. External provider retention and training policies still apply, so avoid sensitive details. Read aloud shares answer text with YarnGPT, using its default voice unless the site owner sets optional <code>YARNGPT_VOICE</code>.</p><p id="assistant-dictation-privacy">Optional dictation starts only when you press Dictate. With the Cloudflare AI connection, stopping sends up to 60 seconds of audio for Whisper transcription. Otherwise supported browsers use their speech service. Audio is not saved by FarmBuddy. Review the words, then press Send yourself. Language accuracy varies. {{ !dictationSupported ? 'Browser dictation is not available here. Please type instead.' : '' }}</p><p>Optional photos: JPEG, PNG or WebP, maximum 3 MB. A photo is shared with Cloudflare Workers AI only when you press Send.</p></div></details>
      </div>
    </div>
  </section>
</template>

<style scoped>
.farm-context-control>button{min-height:44px;padding:10px 14px;border:1px solid #cbdac2;border-radius:12px;background:#fff;color:#164e32;font-weight:700}.farm-context-control>button[aria-pressed=true]{background:#e5efd9;border-color:#638258}.farm-context-control summary { min-height:44px;font-size:12px; display:flex; align-items:center; text-decoration:underline; cursor:pointer; }
.farm-context-control input { width:18px; height:18px; flex-shrink:0; }
.farm-context-control{max-width:760px;margin:0 auto 12px;padding:0 4px;border:0;border-radius:0;background:transparent;font-size:12px;line-height:1.7}.farm-context-control label{display:flex;gap:10px;align-items:center;font-weight:700;color:#164e32}.farm-context-control p{margin-top:6px;color:#63765d}.farm-context-control input{accent-color:#066136}.knowledge-sources{font-size:12px;line-height:1.7;margin-top:10px;overflow-wrap:anywhere}.knowledge-sources summary{cursor:pointer;font-weight:700}.knowledge-sources a{color:#066136;text-decoration:underline}.knowledge-sources ul{padding-left:18px;list-style:disc}
.workspace-switch{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;padding:18px 26px;border-bottom:1px solid #375c3510;background:#fff}.workspace-switch button{display:flex;align-items:center;gap:12px;padding:16px;border:1px solid #d8e1cd;border-radius:14px;font-size:13px;text-align:left;background:#f6f8f2;min-width:0}.workspace-switch strong,.workspace-switch small{display:block}.workspace-switch strong{font-weight:700}.workspace-switch small{margin-top:5px;font-size:11px;line-height:1.5}.workspace-switch button[aria-pressed=true]{background:#066136;color:#fff;border-color:#066136;box-shadow:inset 0 -4px #F9C23C}.workspace-switch svg{flex-shrink:0}.voice-workspace{padding:clamp(12px,3vw,28px);min-width:0}.voice-intro{max-width:800px;font-size:13px;line-height:1.8;margin-bottom:16px}.voice-workspace :deep(.farm-notes){max-width:none}
.farm-companion {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  min-height: min(740px, calc(100dvh - 140px));
  min-width: 0;
  color: #294638;
  background: #f3f7ef;
  border: 1px solid #dfe7d6;
  border-radius: 24px;
  overflow: clip;
}
.farm-companion::before, .farm-companion::after {
  content: none;
  position: absolute;
  z-index: -1;
  width: 490px;
  height: 290px;
  border: 1px solid #78956c18;
  border-radius: 48% 52% 25% 75%;
  box-shadow: 0 0 0 22px #78956c08, 0 0 0 44px #78956c08, 0 0 0 66px #78956c08, 0 0 0 88px #78956c08;
  transform: rotate(-28deg);
  pointer-events: none;
}
.farm-companion::before { left: -350px; top: 35%; }
.farm-companion::after { right: -360px; bottom: 15%; transform: rotate(35deg); }
.companion-bar { display: flex; align-items: center; gap: 20px; padding: 20px 26px; border-bottom: 1px solid #375c3510; }
.companion-brand { display: flex; gap: 10px; align-items: center; }
.brand-icon { display: grid; place-items: center; width: 38px; height: 38px; background: #ffffff9c; border: 1px solid #dce5d5; border-radius: 13px; }
.companion-brand h2 { margin: 0; font-size: 14px; font-weight: 700; letter-spacing: -.02em; }
.companion-brand p { display: flex; align-items: center; gap: 5px; margin: 3px 0 0; font-size: 10px; color: #63705d; }
.status-dot { width: 5px; height: 5px; border-radius: 50%; background: #9b8756; }
.status-dot.ready { background: #4c8453; }
.farm-type { margin-left: auto; font-size: 11px; color: #65735c; border: 1px solid #d8e1cd; border-radius: 30px; padding: 5px 10px; }
.new-conversation { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 10px; border: 1px solid #d8e1cd; border-radius: 9px; font-size: 11px; background: #ffffff70; }
.companion-body { display: flex; flex: 1; flex-direction: column; width: 100%; max-width: 920px; margin: 0 auto; padding: 14px 36px 16px; }
.configuration-note { margin: 0 auto; max-width: 660px; color: #776638; font-size: 11px; line-height: 1.5; text-align: center; }
.connection-details { width:100%; border-bottom:1px solid #d8e1cd; color:#526C46; }
.connection-details summary { display:flex; align-items:center; gap:10px; min-height:52px; font-size:12px; padding:8px 0; }
.connection-details summary small { display:block; margin-top:3px; font-size:11px; }
.connection-action { margin-left:auto; font-weight:700; text-decoration:underline; }
.connection-details .configuration-note { padding:14px 0; font-size:12px; line-height:1.7; text-align:left; max-width:none; overflow-wrap:anywhere; }
.photo-mode-hint { display:flex; align-items:flex-start; gap:8px; padding:12px 4px; font-size:13px; line-height:1.6; }
.photo-mode-hint svg { flex-shrink:0; margin-top:2px; }
.welcome { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; padding: 32px 0 36px; text-align: center; }
.welcome-emblem { display: grid; place-items: center; width: 72px; height: 72px; margin-bottom: 20px; border-radius: 26px; color: #52754b; background: linear-gradient(145deg, #ffffffc9, #e4edda); border: 1px solid #ffffff; box-shadow: 0 8px 24px #4f673510; transform: rotate(-6deg); }
.eyebrow { margin: 0 0 12px; color: #526C46; font-size: 13px; font-weight: 600; }
.welcome h3 { margin: 0; font-size: clamp(28px, 3.1vw, 42px); font-weight: 500; letter-spacing: -.045em; line-height: 1.15; }
.welcome-copy { margin: 16px 0 0; font-size: 13px; line-height: 1.7; color: #6c7964; }
.starter-prompts { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; margin-top: 26px; }
.starter-prompts button { display: flex; align-items: center; gap: 9px; padding: 11px 13px; font-size: 11px; border-radius: 12px; background: #ffffff85; border: 1px solid #dce4d2; }
.starter-prompts button:hover:not(:disabled), .new-conversation:hover { background: #fff; border-color: #98b08a; }
.composer-area { width: 100%; max-width: 760px; margin: auto auto 0; }
.composer { background: #fffffff0; border: 1px solid #d6dfca; border-radius: 20px; padding: 14px 17px 12px; box-shadow: 0 10px 30px #455a2b08; }
.composer:focus-within { border-color: #8aa47a; box-shadow: 0 0 0 3px #648a4810; }
.composer-heading { display: flex; align-items: center; gap: 7px; color: #697661; font-size: 10px; }
.composer-heading > span { margin-left: auto; font-variant-numeric: tabular-nums; }
.composer select { max-width: 180px; background: transparent; border: 0; font-size: 11px; color: #405b38; padding: 5px 20px 5px 4px; }
.composer textarea { display: block; resize: vertical; min-height: 76px; max-height: 200px; width: 100%; border: 0; background: transparent; padding: 12px 0; color: #294638; font-size: 13px; line-height: 1.6; }
.composer textarea:focus { outline: none; box-shadow: none; }
.composer textarea::placeholder { color: #8b9683; }
.composer-actions, .input-tools { display: flex; align-items: center; gap: 6px; }
.composer-actions { justify-content: space-between; gap: 12px; }
.input-tools { min-width: 0; }
.input-tools select { max-width: 150px; font-size: 10px; }
.icon-button { display: inline-grid; place-items: center; width: 36px; height: 36px; flex-shrink: 0; border-radius: 10px; color: #607653; }
.icon-button:hover:not(:disabled) { background: #eef3e7; }
.icon-button.recording { color: #a13d30; background: #fbece6; }
.icon-button.labeled-tool { display:flex; width:auto; gap:6px; padding:8px; font-size:12px; }
.typing-fallback { color: #7a8570; font-size: 10px; }
.send-button { display: flex; align-items: center; justify-content: center; gap: 10px; background: #355e3d; color: #fff; border-radius: 12px; padding: 10px 14px; font-size: 12px; }
.send-button:hover:not(:disabled) { background: #244d2d; }
button:disabled { cursor: not-allowed; opacity: .45; }
button, select, summary { cursor: pointer; }
button:focus-visible, select:focus-visible, summary:focus-visible, input:focus-visible, .conversation:focus-visible { outline: 2px solid #497b40; outline-offset: 3px; }
.guidance-details { padding: 11px 6px 0; color: #737e68; font-size: 10px; line-height: 1.6; }
.guidance-details summary { width: fit-content; margin: auto; text-align: center; }
.guidance-details > div { padding: 8px 12px; margin-top: 8px; border: 1px solid #dce4d2; border-radius: 10px; background: #ffffff85; }
.guidance-details p + p { margin-top: 7px; }
.inline-notice { margin: 8px 4px 0; font-size: 11px; line-height: 1.5; }
.error-notice { color: #9c3b2d; }
.photo-review { margin: 4px 0 12px; padding: 10px; border-radius: 10px; background: #f0f4ea; font-size: 11px; }
.photo-caption { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.photo-caption img { width: 38px; height: 38px; object-fit: cover; border-radius: 7px; }
.photo-caption span { overflow-wrap: anywhere; flex: 1; }
.photo-review label { display: flex; gap: 8px; align-items: flex-start; line-height: 1.5; }
.photo-review input { margin-top: 2px; }
/* History scrolls independently so writing never requires finding the page bottom. */
.chat-workspace { height:calc(var(--chat-viewport-height, 100dvh) - 116px); min-height:0; }
.chat-workspace .companion-bar { padding-block:10px; flex-shrink:0; }
.chat-workspace .workspace-switch { padding-block:8px; flex-shrink:0; }
.chat-workspace .workspace-switch button { padding-block:8px; }
.chat-workspace .workspace-switch small { display:none; }
.chat-workspace .companion-body { min-height:0; overflow:hidden; padding-top:0; }
.chat-history { flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain; scrollbar-gutter:stable; }
.chat-history:focus-visible { outline:2px solid #638258; outline-offset:-2px; }
.chat-workspace .welcome { padding:20px 0; }
.chat-workspace .welcome-emblem,.chat-workspace .eyebrow,.chat-workspace .welcome-copy { display:none; }
.chat-workspace .welcome h3 { font-size:clamp(23px,3vw,34px); }
.chat-workspace .starter-prompts { margin-top:14px; }
.chat-workspace .composer-area { flex-shrink:0; margin:0 auto; padding-top:8px; padding-bottom:env(safe-area-inset-bottom,0px); max-height:60%; overflow-y:auto; }
.chat-workspace .composer textarea { resize:none; min-height:56px; height:56px; max-height:80px; }
.chat-workspace .farm-context-control { display:flex; align-items:center; gap:12px; margin-bottom:4px; }
.chat-workspace .farm-context-control details { min-width:0; }
.chat-workspace .guidance-details { padding-top:2px; }
.chat-workspace .connection-details summary small,.chat-workspace .connection-action { display:none; }
@media(max-width:640px) { .chat-workspace { height:calc(var(--chat-viewport-height, 100dvh) - 100px); } .chat-workspace .companion-bar { padding:8px 12px; } .chat-workspace .companion-body { padding:0 10px 8px; } .chat-workspace .workspace-switch button { min-height:52px; } .chat-workspace .composer { padding:6px 10px; } .chat-workspace .composer-heading { flex-wrap:nowrap; } .chat-workspace .composer-heading>span { display:none; } }
.chat-workspace.keyboard-open .companion-bar,.chat-workspace.keyboard-open .workspace-switch,.chat-workspace.keyboard-open .farm-context-control,.chat-workspace.keyboard-open .guidance-details { display:none; }
.chat-workspace.keyboard-open .composer-area { max-height:100%; }
.conversation { flex: 1; width: 100%; max-width: 760px; min-width: 0; margin: 12px auto 20px; padding: 8px 0; list-style: none; }
#assistant-question, #farm-assistant-title { scroll-margin-block: 100px; }
.farm-companion, .farm-companion * { box-sizing:border-box; }
.farm-companion button { transition:background-color 160ms ease-out, border-color 160ms ease-out, transform 160ms ease-out; }
.farm-companion button:active:not(:disabled) { transform:scale(.98); }
.farm-companion a:focus-visible { outline:2px solid #497b40; outline-offset:3px; }
.message { animation:assistant-message-in 180ms ease-out; }
@keyframes assistant-message-in { from { opacity:.7; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
.message { width: fit-content; max-width: 91%; margin: 0 0 18px; padding: 16px 20px; background: #ffffffb8; border: 1px solid #dfe6d8; border-radius: 17px 17px 17px 4px; }
.message.user { margin-left: auto; background: #e0ead6; border-color: #d4dfc8; border-radius: 17px 17px 4px 17px; }
.message-author { font-size: 10px; color: #64775c; font-weight: 600; margin-bottom: 7px; }
.message-content { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.8; }
.message-note { margin-top: 8px; color: #6b785f; font-size: 10px; }
.read-aloud { display: flex; align-items: center; gap: 6px; margin-top: 12px; font-size: 10px; color: #4f6e43; text-align: left; }
.pending { font-size: 12px; color: #65735c; }
audio { width: 100%; height: 38px; margin-top: 10px; }
button, summary, .composer select { min-height:44px; }
.icon-button { min-width:44px; height:44px; }
.composer textarea { font-size:16px; min-height:100px; }
.composer-heading { font-size:12px; flex-wrap:wrap; }
.composer-heading select { font-size:12px; }
.composer-actions, .input-tools { flex-wrap:wrap; }
.send-button { min-width:92px; background:#066136; font-weight:700; }
.farm-context-control label { min-height:44px; }
.dictation-session.is-listening { border:2px solid #066136; }
.mobile-tool-name{display:none}
@media (max-width: 640px) {
  .workspace-switch { grid-template-columns:repeat(5,minmax(0,1fr)); padding:10px 8px; gap:4px; }
  .workspace-switch button { flex-direction:column; align-items:center; justify-content:center; min-height:68px; padding:8px 2px; gap:5px; font-size:11px; }
  .workspace-switch button>span:not(.mobile-tool-name) { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
  .workspace-switch .mobile-tool-name{display:block;font-weight:700;line-height:1.4}
  .workspace-switch small { display:none; }
  .connection-details summary { flex-wrap:wrap; }
  .connection-action { margin-left:27px; }
  .farm-companion { border-radius: 18px; }
  .companion-bar { padding: 15px; gap: 8px; flex-wrap: wrap; }
  .farm-type { display: none; }
  .new-conversation { margin-left: auto; font-size: 10px; padding: 8px; }
  .companion-body { padding: 12px 14px 14px; }
  .welcome { padding: 28px 0; }
  .welcome h3 { font-size: 30px; }
  .welcome-copy { font-size: 12px; max-width: 290px; }
  .desktop-break { display: none; }
  .eyebrow { font-size: 12px; }
  .starter-prompts { gap: 7px; margin-top: 22px; }
  .starter-prompts button { padding: 9px 10px; font-size: 10px; }
  .composer { padding: 12px; border-radius: 16px; }
  .input-tools select { max-width: 95px; }
  .typing-fallback { display: none; }
  .send-button { padding: 10px; gap: 4px; }
  .message { max-width: 96%; padding: 13px; }
}
@media (max-height: 760px) and (min-width: 641px) {
  .welcome { padding: 20px 0; }
  .welcome-emblem { width: 52px; height: 52px; border-radius: 18px; margin-bottom: 12px; }
  .welcome h3 { font-size: 32px; }
  .welcome-copy { margin-top: 10px; }
  .starter-prompts { margin-top: 16px; }
  .composer textarea { min-height: 62px; height: 62px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation: none !important; transition: none !important; }
}
.dictation-session { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 12px; padding: 12px 14px; border: 1px solid #cdd7bf; border-radius: 12px; background: #f5f7ee; color: #36513a; font-size: 12px; }
.dictation-session.is-listening { background: #edf6e7; border-color: #91b579; }
.dictation-session strong { flex: 1; min-width: 125px; }
.dictation-session button { padding: 7px 11px; border-radius: 8px; background: #365b38; color: white; font-weight: 700; }
.dictation-session button:disabled { opacity: .6; }
.dictation-time { font-variant-numeric: tabular-nums; font-weight: 700; }
.dictation-pending-dot { width: 9px; height: 9px; border-radius: 50%; background: #c39427; }
.dictation-bars { display: flex; align-items: center; gap: 3px; height: 24px; }
.dictation-bars i { width: 4px; height: 18px; border-radius: 3px; background: #548345; animation: assistant-listening .8s ease-in-out infinite alternate; }
.dictation-bars i:nth-child(2) { animation-delay: -.3s; }
.dictation-bars i:nth-child(3) { animation-delay: -.6s; }
.dictation-bars i:nth-child(4) { animation-delay: -.2s; }
.dictation-bars i:nth-child(5) { animation-delay: -.5s; }
@keyframes assistant-listening { from { transform: scaleY(.3); } to { transform: scaleY(1); } }
@media (prefers-reduced-motion: reduce) { .dictation-bars i { animation: none; } .dictation-bars i:nth-child(even) { height: 10px; } }
</style>
