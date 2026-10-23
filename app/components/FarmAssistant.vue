<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
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
  if (busy.value || speaking.value || listening.value || !question.value.trim() || (image.value && !consent.value)) return
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
  } catch (failure) { if (!disposed) error.value = failure?.statusCode === 401 ? 'Please sign in again.' : failure?.statusCode === 503 ? 'AI chat has not been configured yet.' : 'Unable to get an answer. Check your connection or try again later.' }
  finally { busy.value = false }
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
  } catch { if (!disposed) error.value = 'Voice is unavailable. The written answer is still available.' }
  finally { speaking.value = false }
}
function clearSession() { sessionGeneration++; releaseDictation(); dictationNotice.value = ''; controller?.abort(); messages.value = []; question.value = ''; removeImage(); clearAudio() }
watch(() => props.user.id, clearSession)
onMounted(async () => {
  dictationSupported.value = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  try { const result = await $fetch('/api/assistant/status'); if (!disposed) status.value = result }
  catch { error.value = 'Unable to check assistant availability. Please sign in and reload.' }
})
onBeforeUnmount(() => { disposed = true; clearSession() })
</script>

<template>
  <section aria-labelledby="farm-assistant-title" class="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 id="farm-assistant-title" class="text-xl font-bold text-emerald-950">Farm assistant</h2>
      <button type="button" class="rounded-lg border px-3 py-2 text-sm" :disabled="busy || speaking" @click="clearSession">Clear conversation</button>
    </div>
    <p class="mt-2 text-sm text-slate-600">AI guidance, not a professional diagnosis. Photos can be misleading. For urgent animal distress or rapid disease spread, contact a qualified local expert immediately.</p>
    <p class="mt-2 text-xs text-slate-500">Conversation stays in this page's memory only. Sending a question shares your farm profile and selected photo with OpenAI. Read aloud shares answer text with YarnGPT.</p>
    <p v-if="status && !status.chat" role="status" class="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Real AI chat and photo analysis are not configured. Ask the administrator to enable the provider.</p>
    <ol aria-label="Conversation" aria-live="polite" class="my-4 max-h-96 space-y-3 overflow-y-auto">
      <li v-for="(message, index) in messages" :key="index" class="rounded-xl p-3" :class="message.role === 'user' ? 'bg-emerald-50' : 'bg-slate-50'">
        <p class="text-xs font-semibold text-slate-600">{{ message.role === 'user' ? 'You' : `AI · ${message.model}` }}</p>
        <p class="mt-1 whitespace-pre-wrap text-sm text-slate-800">{{ message.content }}</p>
        <p v-if="message.photo" class="mt-1 text-xs text-slate-500">Photo was shared for this question.</p>
        <button v-if="message.role === 'assistant' && status?.voice" type="button" class="mt-2 rounded-lg border px-3 py-2 text-sm" :disabled="speaking || busy || listening" @click="speak(message)">Read aloud with YarnGPT{{ message.content.length > 4000 ? ' (first 4,000 characters)' : '' }}</button>
      </li>
    </ol>
    <form class="space-y-3" @submit.prevent="send">
      <label class="block text-sm font-medium" for="assistant-task">Help with</label>
      <select id="assistant-task" v-model="task" class="w-full rounded-lg border p-2" :disabled="busy">
        <option value="chat">General farming question</option><option value="plant-health">Plant health</option><option value="animal-health">Animal health</option><option value="identify-crop">Identify a crop</option>
      </select>
      <label class="block text-sm font-medium" for="assistant-question">Your question</label>
      <textarea id="assistant-question" v-model="question" maxlength="4000" rows="3" required class="w-full rounded-lg border p-3" :disabled="busy" placeholder="Describe your crop or animal, symptoms, and how long this has been happening." />
      <div class="space-y-2 rounded-lg border border-slate-200 p-3">
        <p id="assistant-dictation-privacy" class="text-xs text-slate-600">Optional microphone dictation uses your browser's speech service, which may send audio to its provider and require internet. Language availability varies by browser. Nothing is recorded until you press Start dictation. Review the editable text and press Send yourself.</p>
        <template v-if="dictationSupported">
          <label for="assistant-dictation-language" class="block text-sm font-medium">Dictation language</label>
          <select id="assistant-dictation-language" v-model="dictationLanguage" class="w-full rounded-lg border p-2" :disabled="listening || busy || speaking">
            <option v-for="language in dictationLanguages" :key="language.code" :value="language.code">{{ language.label }}</option>
          </select>
          <button v-if="!listening" type="button" class="rounded-lg border px-3 py-2 text-sm" :disabled="busy || speaking" aria-describedby="assistant-dictation-privacy" @click="startDictation">Start dictation</button>
          <button v-else type="button" class="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-800" @click="stopDictation">Stop dictation</button>
        </template>
        <p v-else class="text-sm text-slate-600">Browser dictation is not available here. Type your question in the text box above.</p>
        <p v-if="dictationNotice" role="status" aria-live="polite" class="text-sm text-emerald-900">{{ dictationNotice }}</p>
      </div>
      <label for="assistant-photo" class="block text-sm font-medium">Optional photo: JPEG, PNG or WebP, maximum 3 MB</label>
      <input id="assistant-photo" ref="picker" type="file" accept="image/jpeg,image/png,image/webp" :disabled="busy || !status?.photo" class="block w-full text-sm" @change="chooseImage">
      <div v-if="image" class="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
        <p>{{ filename }}</p><button type="button" class="underline" @click="removeImage">Remove photo</button>
        <label class="flex gap-2"><input v-model="consent" type="checkbox" :disabled="busy"> I consent to send this photo to OpenAI only when I press Send. Avoid photos containing people or private details.</label>
      </div>
      <p v-if="error" role="alert" class="text-sm text-red-700">{{ error }}</p>
      <p v-if="busy || speaking" role="status" class="text-sm text-emerald-800">{{ busy ? 'Asking the AI assistant…' : 'Preparing voice audio…' }}</p>
      <button type="submit" class="rounded-lg bg-emerald-700 px-5 py-2.5 font-semibold text-white disabled:opacity-50" :disabled="busy || speaking || listening || !status?.chat || !question.trim() || Boolean(image && !consent)">Send question{{ image ? ' and photo' : '' }}</button>
    </form>
    <audio v-if="audioUrl" :src="audioUrl" controls class="mt-4 w-full" aria-label="YarnGPT spoken answer" @error="error = 'Audio could not be played. Please use the written answer.'" />
  </section>
</template>
