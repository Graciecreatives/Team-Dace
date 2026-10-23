<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { Sprout, Plus, Camera, Mic, ArrowUpRight, X, Leaf, Stethoscope, Volume2 } from 'lucide-vue-next'
const props = defineProps({ user: { type: Object, required: true } })
const status = ref(null)
const messages = ref([])
const question = ref('')
const task = ref(props.user.farmType === 'livestock' ? 'animal-health' : props.user.farmType === 'crops' ? 'plant-health' : 'chat')
const image = ref(null)
const filename = ref('')
const consent = ref(false)
const busy = ref(false)
const speaking = ref(false)
const error = ref('')
const audioUrl = ref('')
const picker = ref(null)
const thread = ref(null)
const draft = ref(null)
const farmLabel = computed(() => props.user.farmType === 'livestock' ? 'Livestock farm' : props.user.farmType === 'crops' ? 'Crop farm' : 'Mixed farm')
const starters = [
  { icon: Leaf, label: 'Check my crops', task: 'plant-health', text: 'I noticed a change in my crops. The crop is ... and the symptoms are ...' },
  { icon: Stethoscope, label: 'Care for my animals', task: 'animal-health', text: 'I need help with my animal. The animal is ... and I have noticed ...' },
  { icon: Sprout, label: 'Plan my next steps', task: 'chat', text: 'Help me plan my next farm tasks. I am growing or raising ...' }
]
function fillPrompt(starter) {
  if (busy.value || listening.value) return
  task.value = starter.task
  question.value = starter.text
  nextTick(() => draft.value?.focus())
}
async function scrollToLatest() {
  await nextTick()
  if (thread.value) thread.value.scrollTop = thread.value.scrollHeight
}
watch(() => messages.value[messages.value.length - 1], scrollToLatest)
watch(busy, scrollToLatest)
const dictationSupported = ref(false)
const listening = ref(false)
const dictationLanguage = ref('en-NG')
const dictationNotice = ref('')
const dictationLanguages = [
  { code: 'en-NG', label: 'English (Nigeria)' },
  { code: 'en-US', label: 'English (United States)' },
  { code: 'ha-NG', label: 'Hausa' },
  { code: 'yo-NG', label: 'Yoruba' },
  { code: 'ig-NG', label: 'Igbo' },
  { code: 'fr-FR', label: 'French' },
  { code: 'sw-KE', label: 'Swahili' }
]
let recognition
let dictationTimer
let disposed = false
let controller
let readGeneration = 0
let sessionGeneration = 0
function releaseDictation() {
  const active = recognition
  recognition = undefined
  clearTimeout(dictationTimer)
  listening.value = false
  if (active) {
    active.onresult = active.onerror = active.onend = null
    try { active.abort() } catch { /* Already ended. */ }
  }
}
function stopDictation() {
  if (!recognition) return
  dictationNotice.value = 'Finishing dictation. Review and edit the text before pressing Send.'
  try { recognition.stop() } catch { releaseDictation() }
  clearTimeout(dictationTimer)
  if (recognition) dictationTimer = setTimeout(releaseDictation, 3000)
}
function startDictation() {
  if (disposed || listening.value || busy.value || speaking.value || !dictationSupported.value) return
  if (question.value.length >= 4000) { dictationNotice.value = 'The question is full. Shorten it before dictating more.'; return }
  releaseDictation()
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  const generation = sessionGeneration
  try {
    const active = new Recognition()
    recognition = active
    active.lang = dictationLanguage.value
    active.continuous = true
    active.interimResults = false
    active.maxAlternatives = 1
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
    listening.value = true
    dictationNotice.value = 'Listening. Speech is added to your editable question, never sent automatically.'
    active.start()
    dictationTimer = setTimeout(stopDictation, 60000)
  } catch {
    releaseDictation()
    dictationNotice.value = 'Could not start microphone dictation. Please type your question instead.'
  }
}
function clearAudio() { if (audioUrl.value) URL.revokeObjectURL(audioUrl.value); audioUrl.value = '' }
function removeImage() { readGeneration++; image.value = null; filename.value = ''; consent.value = false; if (picker.value) picker.value.value = '' }
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
  if (!status.value?.chat || busy.value || speaking.value || listening.value || !question.value.trim() || (image.value && !consent.value)) return
  busy.value = true
  error.value = ''
  controller = new AbortController()
  const generation = sessionGeneration
  const content = question.value.trim()
  const history = [...messages.value.map(item => ({ role: item.role, content: item.content.slice(0, 4000) })), { role: 'user', content }].slice(-5)
  try {
    const result = await $fetch('/api/assistant/chat', { method: 'POST', body: { task: task.value, messages: history, ...(image.value ? { image: image.value } : {}) }, signal: controller.signal })
    if (disposed || generation !== sessionGeneration) return
    messages.value = [...messages.value, { role: 'user', content, photo: Boolean(image.value) }, { role: 'assistant', content: result.text, model: result.model }].slice(-16)
    question.value = ''
    removeImage()
  } catch (failure) { if (!disposed && generation === sessionGeneration) error.value = failure?.statusCode === 401 ? 'Please sign in again.' : failure?.statusCode === 503 ? 'AI chat has not been configured yet.' : 'Unable to get an answer. Check your connection or try again later.' }
  finally { if (generation === sessionGeneration) busy.value = false }
}
async function speak(message) {
  if (busy.value || speaking.value || listening.value) return
  speaking.value = true
  error.value = ''
  clearAudio()
  controller = new AbortController()
  const generation = sessionGeneration
  try {
    const blob = await $fetch('/api/assistant/speak', { method: 'POST', body: { text: message.content.slice(0, 4000) }, responseType: 'blob', signal: controller.signal })
    if (!disposed && generation === sessionGeneration) audioUrl.value = URL.createObjectURL(blob)
  } catch { if (!disposed && generation === sessionGeneration) error.value = 'Voice is unavailable. The written answer is still available.' }
  finally { if (generation === sessionGeneration) speaking.value = false }
}
function clearSession() { sessionGeneration++; releaseDictation(); dictationNotice.value = ''; error.value = ''; controller?.abort(); busy.value = false; speaking.value = false; messages.value = []; question.value = ''; removeImage(); clearAudio() }
watch(() => props.user.id, clearSession)
onMounted(async () => {
  dictationSupported.value = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  try { const result = await $fetch('/api/assistant/status'); if (!disposed) status.value = result }
  catch { error.value = 'Unable to check assistant availability. Please sign in and reload.' }
})
onBeforeUnmount(() => { disposed = true; clearSession() })
</script>

<template>
  <section aria-labelledby="farm-assistant-title" class="farm-companion" :class="{ 'has-thread': messages.length }">
    <header class="companion-bar">
      <div class="companion-brand"><span class="brand-icon"><Sprout :size="20" /></span><div><h2 id="farm-assistant-title">Farm assistant</h2><p><span class="status-dot" :class="{ ready: status?.chat }" />{{ status ? (status.chat ? 'AI companion · Available' : 'AI companion · Not configured') : 'Checking availability…' }}</p></div></div>
      <span class="farm-type">{{ farmLabel }}</span>
      <button type="button" class="new-conversation" @click="clearSession"><Plus :size="16" /> <span>New conversation</span></button>
    </header>

    <div class="companion-body">
      <p v-if="status && !status.chat" role="status" class="configuration-note">Chat and photo analysis are not configured. You can draft a question here. Ask your administrator to enable the provider.</p>
      <p v-else-if="status && !status.photo" class="configuration-note">Photo analysis is unavailable. You can still send a written question.</p>

      <div v-if="!messages.length" class="welcome">
        <div class="welcome-emblem" aria-hidden="true"><Sprout :size="36" :stroke-width="1.4" /></div>
        <p class="eyebrow">A little support for a growing day</p>
        <h3>What is happening on<br class="desktop-break"> your farm today?</h3>
        <p class="welcome-copy">From a change in your crops to an animal that needs care,<br class="desktop-break"> let’s work through your next steps together.</p>
        <div class="starter-prompts" aria-label="Question starters">
          <button v-for="starter in starters" :key="starter.task" type="button" :disabled="busy || listening" @click="fillPrompt(starter)"><component :is="starter.icon" :size="17" />{{ starter.label }}<ArrowUpRight :size="14" /></button>
        </div>
      </div>

      <ol v-else ref="thread" class="conversation" aria-label="Conversation" aria-live="polite" tabindex="0">
        <li v-for="(message, index) in messages" :key="index" class="message" :class="message.role">
          <p class="message-author">{{ message.role === 'user' ? 'You' : `Farm assistant · ${message.model}` }}</p>
          <p class="message-content">{{ message.content }}</p>
          <p v-if="message.photo" class="message-note">Photo shared with this question.</p>
          <button v-if="message.role === 'assistant' && status?.voice" type="button" class="read-aloud" :disabled="speaking || busy || listening" @click="speak(message)"><Volume2 :size="15" />Read aloud with YarnGPT{{ message.content.length > 4000 ? ' (first 4,000 characters)' : '' }}</button>
        </li>
        <li v-if="busy" class="message assistant pending" role="status">Looking into your question…</li>
      </ol>

      <div class="composer-area">
        <form class="composer" @submit.prevent="send">
          <div class="composer-heading"><label for="assistant-task">Help with</label><select id="assistant-task" v-model="task" :disabled="busy"><option value="chat">General farming</option><option value="plant-health">Plant health</option><option value="animal-health">Animal health</option><option value="identify-crop">Identify a crop</option></select><span>{{ question.length.toLocaleString() }} / 4,000</span></div>
          <label for="assistant-question" class="sr-only">Your question</label>
          <textarea id="assistant-question" ref="draft" v-model="question" maxlength="4000" rows="3" required :disabled="busy" placeholder="Tell me what you’ve noticed. What crop or animal, and for how long?" />
          <div v-if="image" class="photo-review"><div class="photo-caption"><img :src="image" alt="Selected farm photo preview"><span>{{ filename }}</span><button type="button" class="icon-button" aria-label="Remove photo" :disabled="busy" @click="removeImage"><X :size="17" /></button></div><label><input v-model="consent" type="checkbox" :disabled="busy"> I consent to send this photo to OpenAI only when I press Send. Avoid people or private details.</label></div>
          <div class="composer-actions">
            <div class="input-tools">
              <input id="assistant-photo" ref="picker" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" :disabled="busy || !status?.chat || !status?.photo" @change="chooseImage">
              <button type="button" class="icon-button" aria-label="Attach a photo, JPEG, PNG or WebP up to 3 MB" title="Attach photo · up to 3 MB" :disabled="busy || !status?.chat || !status?.photo" @click="picker?.click()"><Camera :size="20" /></button>
              <button type="button" class="icon-button" :class="{ recording: listening }" :aria-label="listening ? 'Stop dictation' : 'Start dictation'" :aria-pressed="listening" aria-describedby="assistant-dictation-privacy" :disabled="!dictationSupported || (!listening && (busy || speaking))" @click="listening ? stopDictation() : startDictation()"><Mic :size="20" /></button>
              <template v-if="dictationSupported"><label for="assistant-dictation-language" class="sr-only">Dictation language</label><select id="assistant-dictation-language" v-model="dictationLanguage" :disabled="listening || busy || speaking"><option v-for="language in dictationLanguages" :key="language.code" :value="language.code">{{ language.label }}</option></select></template>
              <span v-else class="typing-fallback">Type your question</span>
            </div>
            <button type="submit" class="send-button" :aria-label="image ? 'Send question and photo' : 'Send question'" :disabled="busy || speaking || listening || !status?.chat || !question.trim() || Boolean(image && !consent)"><span>Send</span><ArrowUpRight :size="19" /></button>
          </div>
        </form>
        <p v-if="dictationNotice" role="status" class="inline-notice">{{ dictationNotice }}</p>
        <p v-if="error" role="alert" class="inline-notice error-notice">{{ error }}</p>
        <p v-if="busy || speaking" role="status" class="inline-notice">{{ busy ? 'Asking the AI assistant…' : 'Preparing YarnGPT voice audio…' }}</p>
        <audio v-if="audioUrl" :src="audioUrl" controls aria-label="YarnGPT spoken answer" @error="error = 'Audio could not be played. Please use the written answer.'" />
        <details class="guidance-details"><summary>AI guidance, not a diagnosis · Safety &amp; privacy</summary><div><p>Photos can be misleading. For urgent animal distress or rapid disease spread, contact a qualified local expert immediately.</p><p>Conversation stays in this page’s memory only. Sending a question shares your farm profile and selected photo with OpenAI. Read aloud shares answer text with YarnGPT.</p><p id="assistant-dictation-privacy">Optional dictation uses your browser’s speech service, which may send audio to its provider and require internet. Language availability varies. Nothing is recorded until you press Start dictation. Review and edit the text, then press Send yourself. {{ !dictationSupported ? 'Browser dictation is not available here. Please type instead.' : '' }}</p><p>Optional photos: JPEG, PNG or WebP, maximum 3 MB. A photo is shared only with your consent when you press Send.</p></div></details>
      </div>
    </div>
  </section>
</template>

<style scoped>
.farm-companion {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  min-height: min(740px, calc(100dvh - 140px));
  color: #294638;
  background: radial-gradient(ellipse at 85% 80%, #f7f1d9 0, transparent 52%), linear-gradient(135deg, #eef4e9, #f7f8ef 60%, #edf2e4);
  border: 1px solid #dfe7d6;
  border-radius: 24px;
  overflow: hidden;
}
.farm-companion::before, .farm-companion::after {
  content: '';
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
.welcome { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; padding: 32px 0 36px; text-align: center; }
.welcome-emblem { display: grid; place-items: center; width: 72px; height: 72px; margin-bottom: 20px; border-radius: 26px; color: #52754b; background: linear-gradient(145deg, #ffffffc9, #e4edda); border: 1px solid #ffffff; box-shadow: 0 8px 24px #4f673510; transform: rotate(-6deg); }
.eyebrow { margin: 0 0 12px; color: #718265; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; font-weight: 600; }
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
.conversation { flex: 1; width: 100%; max-width: 760px; min-height: 180px; max-height: clamp(220px, 45dvh, 540px); overflow-y: auto; overscroll-behavior: contain; margin: 12px auto 20px; padding: 8px 6px; list-style: none; scrollbar-width: thin; }
.message { width: fit-content; max-width: 91%; margin: 0 0 18px; padding: 16px 20px; background: #ffffffb8; border: 1px solid #dfe6d8; border-radius: 17px 17px 17px 4px; }
.message.user { margin-left: auto; background: #e0ead6; border-color: #d4dfc8; border-radius: 17px 17px 4px 17px; }
.message-author { font-size: 10px; color: #64775c; font-weight: 600; margin-bottom: 7px; }
.message-content { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.8; }
.message-note { margin-top: 8px; color: #6b785f; font-size: 10px; }
.read-aloud { display: flex; align-items: center; gap: 6px; margin-top: 12px; font-size: 10px; color: #4f6e43; text-align: left; }
.pending { font-size: 12px; color: #65735c; }
audio { width: 100%; height: 38px; margin-top: 10px; }
@media (max-width: 640px) {
  .farm-companion { border-radius: 18px; }
  .companion-bar { padding: 15px; gap: 8px; flex-wrap: wrap; }
  .farm-type { display: none; }
  .new-conversation { margin-left: auto; font-size: 10px; padding: 8px; }
  .companion-body { padding: 12px 14px 14px; }
  .welcome { padding: 28px 0; }
  .welcome h3 { font-size: 30px; }
  .welcome-copy { font-size: 12px; max-width: 290px; }
  .desktop-break { display: none; }
  .eyebrow { font-size: 9px; letter-spacing: .09em; }
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
</style>
