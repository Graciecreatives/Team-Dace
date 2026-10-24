<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({ user: { type: Object, required: true } })
const task = ref('disease'), photos = ref([]), result = ref(null)
const organs = [{ value: 'auto', label: 'Not sure' }, { value: 'leaf', label: 'Leaf' }, { value: 'flower', label: 'Flower' }, { value: 'fruit', label: 'Fruit' }, { value: 'bark', label: 'Bark' }]
const photo = computed(() => photos.value[0]?.image || '')
const configured = ref(false), checking = ref(false), preparing = ref(false), sending = ref(false), error = ref('')
const resultHeading = ref(null), fileInput = ref(null)
const busy = computed(() => checking.value || preparing.value || sending.value)
const maxPhotos = computed(() => 5)
const photoLimitMessage = computed(() => photos.value.length > maxPhotos.value ? `Scan accepts up to 5 photos. Remove ${photos.value.length - maxPhotos.value} photo to scan. Your photos are still here.` : '')
const canSend = computed(() => !!props.user?.id && configured.value && photos.value.length > 0 && photos.value.length <= maxPhotos.value && !busy.value)
const candidates = computed(() => [...(result.value?.candidates || [])].sort((a, b) => b.score - a.score).slice(0, 3))
function taxonomy(candidate) {
  return [['Scientific name', candidate.scientificName], ['Genus', candidate.genus], ['Family', candidate.family]].flatMap(([label, value]) => {
    const name = typeof value === 'string' ? value : value?.scientificName || value?.scientificNameWithoutAuthor
    return typeof name === 'string' && name.trim() ? [{ label, name: name.trim() }] : []
  })
}
let active = false, generation = 0
const controllers = new Set()
function invalidate() { generation++; for (const controller of controllers) controller.abort(); controllers.clear(); checking.value = false; preparing.value = false; sending.value = false }
function resetPhoto() { invalidate(); photos.value = []; result.value = null; error.value = ''; if (fileInput.value) fileInput.value.value = '' }
function removePhoto(index) { invalidate(); photos.value.splice(index, 1); result.value = null; error.value = ''; if (!configured.value) checkConfiguration() }
function setOrgan(index, value) { if (!organs.some(organ => organ.value === value) || !photos.value[index]) return; invalidate(); photos.value[index].organ = value; result.value = null; if (!configured.value) checkConfiguration() }
async function checkConfiguration() {
  if (!active || !props.user?.id || checking.value) return
  const token = generation, controller = new AbortController(); controllers.add(controller)
  checking.value = true; configured.value = false; error.value = ''
  try {
    const data = await $fetch('/api/plant-scan', { signal: controller.signal, timeout: 15000, retry: 0 })
    if (active && token === generation) configured.value = data?.configured === true
  } catch { if (active && token === generation) error.value = 'Could not check scanner availability. Try again.' }
  finally { controllers.delete(controller); if (active && token === generation) checking.value = false }
}
async function preparePhoto(file, signal) {
  if (!file || !['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Choose a JPEG or PNG photo. Export HEIC photos as JPEG first.')
  if (!file.size || file.size > 3 * 1024 * 1024) throw new Error('Choose a photo no larger than 3 MB.')
  const image = new Image(), url = URL.createObjectURL(file)
  let canvas
  try {
    await new Promise((resolve, reject) => {
      const cleanup = () => { image.onload = null; image.onerror = null; signal.removeEventListener('abort', cancel) }
      const cancel = () => { cleanup(); image.src = ''; reject(new Error('Photo preparation cancelled.')) }
      image.onload = () => { cleanup(); resolve() }
      image.onerror = () => { cleanup(); reject(new Error('This photo could not be opened. Try another JPEG or PNG.')) }
      signal.addEventListener('abort', cancel, { once: true }); image.src = url
      if (signal.aborted) cancel()
    })
    if (signal.aborted) throw new Error('Photo preparation cancelled.')
    const width = image.naturalWidth, height = image.naturalHeight
    if (!width || !height || width * height > 40000000) throw new Error('Choose a photo under 40 megapixels.')
    const scale = Math.min(1, 1280 / width, 1280 / height)
    canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Your browser cannot prepare photos. Try another browser.')
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const data = canvas.toDataURL('image/jpeg', 0.85)
    if (!data.startsWith('data:image/jpeg;base64,') || Math.ceil((data.length - 23) * 3 / 4) > 3 * 1024 * 1024) throw new Error('Photo is still too large. Choose a smaller picture.')
    return { image: data, pixels: canvas.width * canvas.height }
  } finally { URL.revokeObjectURL(url); image.src = ''; if (canvas) { canvas.width = 0; canvas.height = 0 } }
}
async function choosePhoto(event, replaceIndex = null) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!files.length) return
  const replacing = Number.isInteger(replaceIndex)
  if (files.length > (replacing ? 1 : maxPhotos.value - photos.value.length)) { error.value = `Choose up to ${maxPhotos.value} photos of the same plant.`; return }
  invalidate(); result.value = null; error.value = ''
  const token = generation, controller = new AbortController(); controllers.add(controller); preparing.value = true
  try {
    const prepared = []
    for (const file of files) {
      const preparedPhoto = await preparePhoto(file, controller.signal)
      if (!active || token !== generation) return
      prepared.push({ ...preparedPhoto, organ: 'auto' })
    }
    const nextPhotos = replacing ? photos.value.map((item, index) => index === replaceIndex ? prepared[0] : item) : [...photos.value, ...prepared]
    const bytes = nextPhotos.reduce((total, item) => { const base64 = item.image.split(',')[1]; return total + base64.length * 3 / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0) }, 0)
    if (nextPhotos.reduce((total, item) => total + item.pixels, 0) > 8000000) throw new Error('Keep all photos together under 8 megapixels. Use smaller photos or remove one.')
    if (bytes > 3 * 1024 * 1024) throw new Error('Keep all photos together under 3 MB. Use smaller photos or remove one.')
    photos.value = nextPhotos
  } catch (cause) { if (active && token === generation) error.value = cause.message || 'Could not prepare this photo.' }
  finally { controllers.delete(controller); if (active && token === generation) { preparing.value = false; if (!configured.value && photo.value) checkConfiguration() } }
}
function selectTask(value) { if (task.value === value) return; invalidate(); task.value = value; result.value = null; error.value = ''; if (!configured.value) checkConfiguration() }
async function scan() {
  if (!canSend.value) return
  const token = generation, controller = new AbortController(); controllers.add(controller); sending.value = true; result.value = null; error.value = ''
  try {
    const data = await $fetch('/api/plant-scan', { method: 'POST', body: { task: task.value, images: photos.value.map(item => item.image), organs: photos.value.map(item => item.organ), consent: true }, signal: controller.signal, timeout: 45000, retry: 0 })
    if (!active || token !== generation) return
    if (!['suggestions', 'no-match'].includes(data?.status) || data.task !== task.value || data.provider !== 'Pl@ntNet' || !Array.isArray(data.candidates) || data.candidates.some(item => typeof item.name !== 'string' || item.name.trim() === '' || item.name.length > 180 || !Number.isFinite(item.score) || item.score < 0 || item.score > 1)) throw new Error('Unexpected scanner response. Please try again.')
    result.value = data
  } catch (cause) { if (active && token === generation) error.value = cause?.data?.statusMessage || cause?.message || 'Scan failed. Your photo is still here. Please try again.' }
  finally { controllers.delete(controller); if (active && token === generation) sending.value = false }
}
watch(result, async value => { if (value) { await Promise.resolve(); if (active && result.value === value) resultHeading.value?.focus() } }, { flush: 'post' })
watch(() => props.user?.id, () => { resetPhoto(); configured.value = false; if (active) checkConfiguration() }, { flush: 'sync' })
onMounted(() => { active = true; checkConfiguration() })
onBeforeUnmount(() => { active = false; resetPhoto(); configured.value = false })
</script>

<template>
  <section class="plant-scan" aria-label="Plant photo scanner">
    <header><span class="scan-eyebrow">Plant scanner</span><h2>What’s growing here?</h2><p>Add up to {{ maxPhotos }} photos of the same plant.</p></header>
    <ol class="scan-steps" aria-label="Scan steps"><li :aria-current="!photo ? 'step' : undefined">1 · Photo</li><li :aria-current="photo && !result ? 'step' : undefined">2 · Preview</li><li :aria-current="result ? 'step' : undefined">3 · Scan</li></ol>
    <div class="scan-modes" role="group" aria-label="What would you like to explore?"><button type="button" :aria-pressed="task === 'disease'" @click="selectTask('disease')">Visual disease check</button><button type="button" :aria-pressed="task === 'identify'" @click="selectTask('identify')">Identify plant</button></div>
    <p v-if="!checking && !configured" class="scan-notice" role="status">Scanner needs setup. No photo will be sent until the provider is connected. <button type="button" :disabled="busy" @click="checkConfiguration">Check availability</button></p>
    <div class="scan-photo">
      <div v-if="photos.length" class="scan-previews"><figure v-for="(item, index) in photos" :key="index"><img :src="item.image" :alt="`Plant photo ${index + 1} for review`" /><figcaption><label>Photo {{ index + 1 }} shows<select :value="item.organ" @change="setOrgan(index, $event.target.value)"><option v-for="organ in organs" :key="organ.value" :value="organ.value">{{ organ.label }}</option></select></label><div class="scan-photo-actions"><label class="scan-file">Replace<input type="file" accept="image/jpeg,image/png" :aria-label="`Replace photo ${index + 1}`" @change="choosePhoto($event, index)" /></label><button type="button" :aria-label="`Remove photo ${index + 1}`" @click="removePhoto(index)">Remove</button></div></figcaption></figure></div>
      <div v-else class="scan-placeholder"><svg aria-hidden="true" viewBox="0 0 64 64" width="54" height="54"><path d="M14 51V35m0 8c-3-16 10-24 34-28 1 25-11 39-29 30m-5-2L39 25" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><strong>Show a leaf, flower or whole plant.</strong><p>Use a clear, close photo in daylight.</p></div>
      <label v-if="photos.length < maxPhotos" class="scan-file">{{ photo ? 'Add photo' : 'Choose photos' }}<input ref="fileInput" type="file" multiple accept="image/jpeg,image/png" :disabled="preparing" aria-label="Choose plant photos, JPEG or PNG up to 3 MB total" @change="choosePhoto($event)" /></label>
      <label v-if="photos.length < maxPhotos" class="scan-file">Take a photo<input type="file" accept="image/jpeg,image/png" capture="environment" :disabled="preparing" aria-label="Take a plant photo with your camera" @change="choosePhoto($event)" /></label>
      <button v-if="preparing || sending" type="button" class="scan-remove" @click="resetPhoto">Cancel and clear</button>
      <small>JPEG / PNG · 3 MB / 8 MP total · same plant only</small>
    </div>
    <p v-if="photoLimitMessage" class="scan-notice" role="status">{{ photoLimitMessage }}</p>
    <p class="scan-disclosure">Photo sent to Pl@ntNet. Suggestions, not a diagnosis.</p>
    <button class="scan-send" type="button" :disabled="!canSend" @click="scan">{{ sending ? 'Scanning…' : 'Scan with Pl@ntNet' }}</button>
    <p class="scan-status" role="status" aria-live="polite"><span v-if="sending" class="scan-pending" aria-hidden="true">◌ </span>{{ checking ? 'Checking scanner availability…' : preparing ? 'Preparing photo on this device…' : sending ? 'Waiting for Pl@ntNet…' : result ? 'Scan complete.' : photo ? 'Ready. Nothing sent yet.' : 'Nothing sent yet.' }}</p>
    <p v-if="error" role="alert" class="scan-error">{{ error }}</p>
    <section v-if="result" class="scan-results" aria-label="Photo suggestions"><h3 ref="resultHeading" tabindex="-1">{{ result.status === 'no-match' ? 'No match found' : 'Possible matches' }}</h3><ol v-if="result.status === 'suggestions' && candidates.length"><li v-for="(candidate, index) in candidates" :key="index"><strong>{{ candidate.name }}</strong><span>Model score: {{ candidate.score }}</span><details v-if="taxonomy(candidate).length" class="scan-details scan-taxonomy"><summary>Plant details</summary><dl><template v-for="field in taxonomy(candidate)" :key="field.label"><dt>{{ field.label }}</dt><dd>{{ field.name }}</dd></template></dl></details></li></ol><p v-else>Try a clearer photo. No match does not mean your plant is healthy.</p></section>
    <p class="scan-limit">Plants only. Animal photos are not supported.</p>
    <details class="scan-details"><summary>Details</summary><p>Scan sends only the prepared photos, plant-part choices and selected task through our server to Pl@ntNet. Nothing uploads until you press Scan with Pl@ntNet. Photo metadata is stripped and images are resized to fit 1280 px. Photos and results are not saved by this scanner. No assistant prompt or location details are sent. Avoid people, labels and location clues in photos. Pl@ntNet processes photos under its own privacy policy.</p><p>Evidence basis: photo similarity to Pl@ntNet’s model reference coverage{{ result?.version ? ` (model ${result.version})` : '' }}. Similarity/model score, not chance of disease. Coverage is limited. No lab test or field examination was performed. Suggestions do not establish a diagnosis or treatment. Never eat a plant based on a match. For an animal health concern, contact a veterinarian.</p><p v-if="result?.notice">{{ result.notice }}</p><ul v-if="candidates.some(candidate => candidate.code)"><li v-for="(candidate, index) in candidates.filter(candidate => candidate.code)" :key="index">{{ candidate.name }} · EPPO: {{ candidate.code }}</li></ul></details>
  </section>
</template>

<style scoped>
.plant-scan{--green:#235936;--yellow:#f5d85d;color:#244432;background:transparent;border:0;border-radius:0;padding:clamp(16px,3vw,32px);max-width:100%;min-width:0;margin:auto;font-size:15px;line-height:1.6}.plant-scan *{box-sizing:border-box}.plant-scan h2{font-weight:750;font-size:clamp(26px,5vw,38px);line-height:1.15;letter-spacing:-.035em;margin:8px 0 12px;text-wrap:balance}.plant-scan h3{font-size:19px;margin:0 0 8px}.plant-scan p{margin:8px 0 16px}.scan-eyebrow{color:var(--green);font-size:12px;text-transform:uppercase;font-weight:800;letter-spacing:.12em}.scan-steps{display:flex;gap:8px;list-style:none;padding:0;margin:24px 0;font-size:12px;flex-wrap:wrap}.scan-steps li{padding:6px 10px;border-radius:20px;background:#edf2e4}.scan-steps [aria-current]{background:var(--yellow);font-weight:700}.scan-modes{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}.plant-scan button,.scan-file{min-height:44px;border:1px solid #bacdb2;border-radius:12px;background:white;color:var(--green);padding:10px 16px;font:inherit;font-weight:700;cursor:pointer}.scan-modes button{flex:1}.scan-modes [aria-pressed=true]{background:var(--green);color:white;border-color:var(--green)}.scan-photo{padding:16px;background:#eff4e6;border:1px dashed #b3c5a2;border-radius:18px;text-align:center}.scan-photo img{display:block;width:100%;max-height:350px;object-fit:contain;border-radius:10px;margin-bottom:16px}.scan-placeholder{padding:20px 0;max-width:380px;margin:auto}.scan-placeholder>span{display:block;font-size:46px;color:var(--green)}.scan-placeholder strong{display:block;font-size:20px}.scan-file{display:inline-flex;position:relative;align-items:center;justify-content:center;overflow:hidden;margin:4px}.scan-file input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}.scan-photo small{display:block;margin-top:12px}.plant-scan .scan-send{width:100%;background:var(--green);color:white}.plant-scan button:disabled{opacity:.55;cursor:not-allowed}.scan-notice,.scan-limit{background:#fff5ce;border-radius:12px;padding:14px}.scan-notice button{margin-top:8px}.scan-status{min-height:26px;font-size:14px}.scan-error{color:#842d23;background:#fff0e9;padding:14px;border-radius:12px;overflow-wrap:anywhere}.scan-results{border-top:1px solid #cbd9be;padding:20px 0}.scan-results ol{padding-left:24px}.scan-results li{padding:12px 0;border-bottom:1px solid #e0e8d6;overflow-wrap:anywhere}.scan-results li span{display:block;font-size:14px;font-variant-numeric:tabular-nums}.scan-limit{font-size:14px}.plant-scan button:focus-visible,.plant-scan input:focus-visible,.scan-file:focus-within,.scan-results h3:focus-visible{outline:3px solid #976d00;outline-offset:3px}.scan-pending{display:inline-block;animation:scan-turn 1.2s linear infinite}@keyframes scan-turn{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.scan-pending{animation:none}}@media(max-width:360px){.scan-modes{display:grid}.scan-file{display:flex}.plant-scan{border-radius:16px}}
.scan-previews{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:16px;margin-bottom:12px;text-align:left}.scan-previews figure{min-width:0;margin:0}.scan-previews img{height:180px;object-fit:contain;background:#fff}.scan-previews label{display:block;font-size:13px;font-weight:700}.scan-previews select{display:block;width:100%;min-height:44px;margin-top:4px;padding:8px;border:1px solid #bacdb2;border-radius:10px;background:white;color:var(--green);font:inherit}.scan-photo-actions{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}.scan-photo-actions .scan-file{margin:0}.scan-photo-actions button,.scan-photo-actions .scan-file{padding:8px 10px;font-size:13px;flex:1}.scan-disclosure{font-size:13px;text-align:center}.scan-details{font-size:13px;color:#48634f}.scan-details summary{min-height:44px;display:list-item;align-content:center;cursor:pointer;font-weight:700}.scan-details p{margin:12px 0}.scan-previews select:focus-visible,.scan-details summary:focus-visible{outline:3px solid #976d00;outline-offset:3px}.scan-results li:first-child strong{font-size:22px}.scan-limit{background:transparent;padding:0;font-size:13px}
.scan-taxonomy dl{margin:0 0 8px}.scan-taxonomy dt{font-weight:700}.scan-taxonomy dd{margin:0 0 8px;overflow-wrap:anywhere}
</style>
