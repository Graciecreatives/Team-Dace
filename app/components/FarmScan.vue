<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({ user: { type: Object, required: true } })
const emit = defineEmits(['ask-ai'])
function askAI() {
  if (!result.value || busy.value || !props.user?.id) return
  const candidate = currentCandidate.value
  const name = typeof candidate?.name === 'string' ? candidate.name.replace(/https?:\/\/\S+|data:\S+/gi, '').replace(/[<>\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180) : ''
  const score = Number.isFinite(candidate?.score) ? candidate.score.toFixed(3) : 'Not available'
  const summary = [
    'Pl@ntNet provider suggestion, not a diagnosis.',
    `Task: ${task.value === 'disease' ? 'Check a plant problem' : 'Name this plant'}.`,
    name ? `Selected suggestion: ${name}.` : 'No match found.',
    name ? `Model similarity score: ${score} (not disease probability).` : '',
    'What safe checks should I do next?'
  ].filter(Boolean).join('\n').slice(0, 500)
  emit('ask-ai', summary)
}
const task = ref('identify'), photos = ref([]), result = ref(null)
const selectedPhoto = ref(0), selectedCandidate = ref(0), selectedImage = ref(0), failedImages = ref([])
const currentCandidate = computed(() => candidates.value[selectedCandidate.value])
const referenceImages = computed(() => (Array.isArray(currentCandidate.value?.images) ? currentCandidate.value.images : []).filter(image => safeReferenceUrl(image?.url)).slice(0, 3))
const referenceImage = computed(() => referenceImages.value[selectedImage.value])
function safeReferenceUrl(value) { return typeof value === 'string' && !/\s/.test(value) && /^https:\/\/bs\.plantnet\.org\/image\/[smo]\/[a-f0-9]+$/.test(value) ? value : '' }
function selectCandidate(index) { if (!candidates.value[index]) return; selectedCandidate.value = index; selectedImage.value = 0 }
function selectImage(index) { if (referenceImages.value[index]) selectedImage.value = index }
function failReference(url) { if (!failedImages.value.includes(url)) failedImages.value = [...failedImages.value, url] }
function selectPhoto(index) { if (photos.value[index]) selectedPhoto.value = index }
function resetSelection() { selectedCandidate.value = 0; selectedImage.value = 0; failedImages.value = [] }
const organs = [{ value: 'auto', label: 'Not sure' }, { value: 'leaf', label: 'Leaf' }, { value: 'flower', label: 'Flower' }, { value: 'fruit', label: 'Fruit' }, { value: 'bark', label: 'Bark' }]
const photo = computed(() => photos.value[selectedPhoto.value]?.image || '')
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
function resetPhoto() { selectedPhoto.value = 0; resetSelection(); invalidate(); photos.value = []; result.value = null; error.value = ''; if (fileInput.value) fileInput.value.value = '' }
function removePhoto(index) { invalidate(); photos.value.splice(index, 1); selectedPhoto.value = Math.min(selectedPhoto.value, Math.max(0, photos.value.length - 1)); result.value = null; error.value = ''; if (!configured.value) checkConfiguration() }
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
    selectedPhoto.value = replacing ? replaceIndex : nextPhotos.length - prepared.length
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
watch(result, async value => { resetSelection(); if (value) { await Promise.resolve(); if (active && result.value === value) resultHeading.value?.focus({ preventScroll: true }) } }, { flush: 'post' })
watch(() => props.user?.id, () => { resetPhoto(); configured.value = false; if (active) checkConfiguration() }, { flush: 'sync' })
onMounted(() => { active = true; checkConfiguration() })
onBeforeUnmount(() => { active = false; resetPhoto(); configured.value = false })
</script>

<template>
  <section class="plant-scan" :class="{ 'scan-empty': !photos.length }" aria-label="Plant photo scanner">
    <header><h2>Meet your plants.</h2></header>
    <svg class="scan-symbols" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs><symbol id="scan-leaf" viewBox="0 0 80 80"><path d="M16 67C8 30 31 13 66 12c4 34-13 59-43 50" fill="#b6dcb4"/><path d="M15 70 55 24M29 55l-4-19m16 7 18-2" fill="none" stroke="#005f35" stroke-width="4" stroke-linecap="round"/></symbol><symbol id="scan-flower" viewBox="0 0 80 80"><path d="M40 72V38M40 60Q15 60 18 44q18-2 22 16" fill="#b6dcb4" stroke="#005f35" stroke-width="3"/><path d="M40 14C22-6 11 22 27 29 4 35 23 56 39 40c13 20 37 0 18-12 18-15-9-32-17-14" fill="#ffcd38"/><circle cx="40" cy="28" r="9" fill="#005f35"/></symbol><symbol id="scan-fruit" viewBox="0 0 80 80"><path d="M42 26Q38 9 53 7M43 19q17-16 25-3-10 15-25 3" fill="#b6dcb4" stroke="#005f35" stroke-width="3"/><path d="M40 28C3 12 7 67 35 72h12c28-6 29-59-7-44" fill="#ffcd38" stroke="#005f35" stroke-width="3"/></symbol><symbol id="scan-bark" viewBox="0 0 80 80"><path d="M21 8h38l5 65H16Z" fill="#d9bc8d"/><path d="m30 10-4 22 8 14-6 24M50 12l4 21-9 16 8 23" fill="none" stroke="#70553a" stroke-width="4"/></symbol><symbol id="scan-auto" viewBox="0 0 80 80"><path d="M24 26c0-24 36-24 36-2 0 12-20 12-20 27" fill="none" stroke="#005f35" stroke-width="6" stroke-linecap="round"/><circle cx="40" cy="66" r="4" fill="#005f35"/></symbol><symbol id="scan-camera" viewBox="0 0 80 80"><path d="m27 22 5-9h17l5 9h13v43H13V22Z" fill="#fff" stroke="#005f35" stroke-width="4" stroke-linejoin="round"/><circle cx="40" cy="43" r="13" fill="#ffcd38" stroke="#005f35" stroke-width="4"/></symbol></defs></svg>
    <div class="scan-modes" role="group" aria-label="What would you like to explore?"><button type="button" :aria-pressed="task === 'identify'" @click="selectTask('identify')"><svg aria-hidden="true" viewBox="0 0 80 80"><use href="#scan-leaf"/></svg>Name this plant</button><button type="button" :aria-pressed="task === 'disease'" @click="selectTask('disease')"><svg aria-hidden="true" viewBox="0 0 80 80"><use href="#scan-flower"/><circle cx="62" cy="60" r="13" fill="#fff" stroke="#005f35" stroke-width="3"/><path d="M62 52v16m-8-8h16" stroke="#005f35" stroke-width="3"/></svg>Check a problem</button></div>
    <p v-if="!checking && !configured" class="scan-notice" role="status">Scanner needs setup. No photo will be sent until the provider is connected. <button type="button" :disabled="busy" @click="checkConfiguration">Check availability</button></p>
    <div class="scan-photo">
      <template v-if="photos.length"><figure class="scan-main-photo"><img :src="photo" :alt="`Your plant photo ${selectedPhoto + 1}`"/><figcaption>Your photo {{ selectedPhoto + 1 }} / {{ photos.length }}</figcaption></figure><div class="scan-filmstrip" role="group" aria-label="Your photos"><button v-for="(item, index) in photos" :key="index" type="button" :aria-label="`Show photo ${index + 1}`" :aria-pressed="selectedPhoto === index" @click="selectPhoto(index)"><img :src="item.image" alt=""/></button></div><div class="scan-organs" role="group" aria-label="Which plant part is in this photo?"><button v-for="organ in organs" :key="organ.value" type="button" :aria-pressed="photos[selectedPhoto]?.organ === organ.value" @click="setOrgan(selectedPhoto, organ.value)"><svg aria-hidden="true" viewBox="0 0 80 80"><use :href="`#scan-${organ.value}`"/></svg>{{ organ.label }}</button></div><div class="scan-photo-actions"><label class="scan-file">Replace photo<input type="file" accept="image/jpeg,image/png" :aria-label="`Replace photo ${selectedPhoto + 1}`" @change="choosePhoto($event, selectedPhoto)"/></label><button type="button" @click="removePhoto(selectedPhoto)">Remove photo</button></div></template>
      <div v-else class="scan-placeholder"><svg aria-hidden="true" viewBox="0 0 320 200"><circle cx="160" cy="100" r="92" fill="#e1edda"/><use href="#scan-leaf" x="30" y="70" width="110" height="110" transform="rotate(-18 85 125)"/><use href="#scan-flower" x="190" y="12" width="100" height="150"/><use href="#scan-fruit" x="207" y="113" width="72" height="72"/><use href="#scan-camera" x="100" y="60" width="120" height="120"/></svg><strong>A photo starts here</strong><p>One plant. Up to 5 photos.</p></div>
      <div class="scan-pickers"><label v-if="photos.length < maxPhotos" class="scan-file scan-camera"> <svg aria-hidden="true" viewBox="0 0 80 80"><use href="#scan-camera"/></svg>Take a photo<input type="file" accept="image/jpeg,image/png" capture="environment" :disabled="preparing" aria-label="Take a plant photo with your camera" @change="choosePhoto($event)" /></label><label v-if="photos.length < maxPhotos" class="scan-file scan-gallery"><span aria-hidden="true">▧</span>{{ photo ? 'Add photos' : 'Pick photos' }}<input ref="fileInput" type="file" multiple accept="image/jpeg,image/png" :disabled="preparing" aria-label="Choose plant photos, JPEG or PNG up to 3 MB total" @change="choosePhoto($event)" /></label></div>
      <button v-if="preparing || sending" type="button" class="scan-remove" @click="resetPhoto">Cancel and clear</button>

    </div>
    <p v-if="photoLimitMessage" class="scan-notice" role="status">{{ photoLimitMessage }}</p>
    <p class="scan-disclosure">Scan sends photos to Pl@ntNet. Suggestions, not a diagnosis.</p>
    <button v-if="photos.length" class="scan-send" type="button" :disabled="!canSend" @click="scan">{{ sending ? 'Scanning…' : 'Scan with Pl@ntNet' }}</button>
    <p class="scan-status" role="status" aria-live="polite"><span v-if="sending" class="scan-pending" aria-hidden="true">◌ </span>{{ checking ? 'Checking scanner availability…' : preparing ? 'Preparing photo on this device…' : sending ? 'Waiting for Pl@ntNet…' : result ? 'Scan complete.' : photo ? 'Ready. Nothing sent yet.' : 'Nothing sent yet.' }}</p>
    <p v-if="error" role="alert" class="scan-error">{{ error }}</p>
    <section v-if="result" class="scan-results" aria-label="Photo suggestions"><h3 ref="resultHeading" tabindex="-1">{{ result.status === 'no-match' ? 'No match found' : 'Possible matches' }}</h3><template v-if="result.status === 'suggestions' && currentCandidate"><div class="scan-candidates" role="group" aria-label="Possible plants"><button v-for="(candidate, index) in candidates" :key="index" type="button" :aria-pressed="selectedCandidate === index" @click="selectCandidate(index)">{{ candidate.name }}</button></div><h3>{{ currentCandidate.name }}</h3><div class="scan-comparison"><figure><img :src="photo" alt="Your plant photo for comparison"/><figcaption>Your photo</figcaption></figure><figure><img v-if="referenceImage && !failedImages.includes(referenceImage.url)" :src="safeReferenceUrl(referenceImage.url)" :alt="`${currentCandidate.name}, Pl@ntNet reference`" referrerpolicy="no-referrer" loading="lazy" @error="failReference(referenceImage.url)"/><div v-else class="scan-no-image"><svg aria-hidden="true" viewBox="0 0 80 80"><use href="#scan-leaf"/></svg><span>Reference photo unavailable</span></div><figcaption>Pl@ntNet reference<span v-if="referenceImage" class="scan-credit">{{ referenceImage.author || 'Author not supplied' }} · Pl@ntNet · {{ referenceImage.license || 'License not supplied' }}</span></figcaption></figure></div><div v-if="referenceImages.length" class="scan-filmstrip scan-reference-thumbs" role="group" aria-label="Reference photos"><figure v-for="(image, index) in referenceImages" :key="image.url"><button type="button" :aria-label="`Show reference photo ${index + 1}`" :aria-pressed="selectedImage === index" @click="selectImage(index)"><img v-if="!failedImages.includes(image.url)" :src="safeReferenceUrl(image.url)" alt="" referrerpolicy="no-referrer" loading="lazy" @error="failReference(image.url)"/><span v-else aria-hidden="true">▧</span></button><figcaption class="scan-credit">{{ image.author || 'Author not supplied' }} · Pl@ntNet · {{ image.license || 'License not supplied' }}</figcaption></figure></div></template><p v-else>Try a clearer photo. No match does not mean your plant is healthy.</p><button type="button" class="scan-ask-ai" @click="askAI">Ask FarmBuddyAI</button></section>
    <details class="scan-details"><summary>Details</summary><p>Plants only. Animal photos are not supported. JPEG / PNG, up to 3 MB and 8 megapixels total.</p><dl v-if="currentCandidate"><template v-for="field in taxonomy(currentCandidate)" :key="field.label"><dt>{{ field.label }}</dt><dd>{{ field.name }}</dd></template><dt>Model score</dt><dd>{{ currentCandidate.score }}</dd></dl><p v-for="image in referenceImages" :key="image.url">{{ image.citation }}</p><p>Scan sends only the prepared photos, plant-part choices and selected task through our server to Pl@ntNet. Nothing uploads until you press Scan with Pl@ntNet. Photo metadata is stripped and images are resized to fit 1280 px. Photos and results are not saved by this scanner. No assistant prompt or location details are sent. Avoid people, labels and location clues in photos. Pl@ntNet processes photos under its own privacy policy.</p><p>Evidence basis: photo similarity to Pl@ntNet’s model reference coverage{{ result?.version ? ` (model ${result.version})` : '' }}. Similarity/model score, not chance of disease. Coverage is limited. No lab test or field examination was performed. Suggestions do not establish a diagnosis or treatment. Never eat a plant based on a match. For an animal health concern, contact a veterinarian.</p><p v-if="result?.notice">{{ result.notice }}</p><ul v-if="candidates.some(candidate => candidate.code)"><li v-for="(candidate, index) in candidates.filter(candidate => candidate.code)" :key="index">{{ candidate.name }} · EPPO: {{ candidate.code }}</li></ul></details>
  </section>
</template>

<style scoped>
.plant-scan{box-sizing:border-box;min-width:0;margin:auto;font-size:15px;line-height:1.6}.plant-scan *{box-sizing:border-box}.plant-scan h2{font-weight:750;line-height:1.15;letter-spacing:-.035em;text-wrap:balance}.plant-scan h3{font-size:19px;margin:0 0 8px;overflow-wrap:anywhere}.plant-scan p{margin:8px 0 16px}.scan-modes{margin-bottom:16px}.plant-scan button,.scan-file{border:1px solid #bacdb2;border-radius:12px;background:white;color:var(--green);padding:10px 16px;font:inherit;font-weight:700;cursor:pointer}.scan-photo{text-align:center}.scan-photo img{display:block;width:100%;object-fit:contain;border-radius:10px}.scan-placeholder{max-width:380px;margin:auto}.scan-placeholder strong{display:block}.scan-file{display:inline-flex;position:relative;align-items:center;justify-content:center;overflow:hidden;margin:4px}.scan-file input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}.plant-scan .scan-send{width:100%;background:var(--green);color:white}.plant-scan button:disabled{opacity:.55;cursor:not-allowed}.scan-notice{background:#fff5ce;border-radius:12px;padding:14px}.scan-notice button{margin-top:8px}.scan-error{overflow-wrap:anywhere}.scan-results{border-top:1px solid #cbd9be;padding:20px 0}.scan-photo-actions{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}.scan-photo-actions .scan-file{margin:0}.scan-photo-actions button,.scan-photo-actions .scan-file{padding:8px 10px;font-size:13px;flex:1}.scan-disclosure{font-size:13px;text-align:center}.scan-details{font-size:13px;color:#48634f}.scan-details summary{display:list-item;align-content:center;cursor:pointer;font-weight:700}.scan-details p{margin:12px 0}
.plant-scan{--green:#005f35;--yellow:#ffcd38;font-family:'Plus Jakarta Sans',sans-serif;color:var(--green);background:#fafbf6;padding:clamp(16px,3vw,28px);border-radius:28px;width:100%;max-width:900px}.scan-symbols{position:absolute;width:0;height:0;overflow:hidden}.plant-scan h2{font-size:clamp(28px,5vw,40px);margin:0 0 24px}.plant-scan button,.scan-file{min-height:48px;transition:background-color 160ms ease-out,transform 160ms ease-out}.plant-scan button:active,.scan-file:active{transform:scale(.98)}.plant-scan button:focus-visible,.scan-file:focus-within,.scan-details summary:focus-visible{outline:3px solid #a16d00;outline-offset:4px}.scan-modes{display:grid;grid-template-columns:1fr 1fr;gap:12px}.scan-modes button{display:flex;align-items:center;gap:12px;padding:16px;font-size:clamp(15px,2.5vw,19px);text-align:left;border:2px solid #d7e3d4;background:white;min-height:108px;border-radius:20px}.scan-modes svg{width:64px;height:64px;flex-shrink:0}.scan-modes [aria-pressed=true]{background:#e7f1dd;color:var(--green);border-color:var(--green)}.scan-photo{border:0;background:#f0f5e9;padding:16px;border-radius:24px}.scan-placeholder{padding:8px 0}.scan-placeholder>svg{display:block;width:100%;height:220px}.scan-placeholder strong{font-size:24px}.scan-pickers{display:flex;gap:12px;margin-top:16px}.scan-pickers .scan-file{margin:0;flex:1;gap:10px;min-height:64px;font-size:18px}.scan-pickers svg{height:36px;width:36px}.scan-pickers .scan-camera{background:var(--yellow);border-color:var(--yellow)}.scan-gallery span{font-size:30px}.scan-main-photo{margin:0}.scan-photo .scan-main-photo img{height:clamp(240px,45vw,420px);max-height:420px;margin:0;background:#e1e9d9;object-fit:contain}.scan-main-photo figcaption{padding:8px}.scan-filmstrip{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}.scan-filmstrip button{width:64px;height:64px;padding:3px;border:2px solid transparent;border-radius:12px;overflow:hidden}.plant-scan .scan-filmstrip img{width:100%;height:100%;max-height:none;object-fit:cover;margin:0;border-radius:6px}.plant-scan [aria-pressed=true]{border-color:var(--green);box-shadow:0 0 0 1px var(--green)}.scan-organs{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.scan-organs button{flex:1;min-width:72px;padding:8px 4px;font-size:13px;display:flex;flex-direction:column;align-items:center;gap:4px}.scan-organs svg{width:42px;height:42px}.scan-organs [aria-pressed=true]{background:#ffedac}.scan-photo-actions{justify-content:center}.scan-photo-actions>*{max-width:220px}.scan-send{min-height:60px!important;font-size:18px!important;border-radius:18px!important}.scan-status{font-size:13px;min-height:24px;text-align:center}.scan-disclosure{margin-top:20px!important}.scan-results{margin-top:24px}.scan-candidates{display:flex;gap:10px;margin:16px 0;flex-wrap:wrap}.scan-candidates button{flex:1;text-wrap:balance;min-width:120px}.scan-candidates [aria-pressed=true]{background:#e7f1dd}.scan-comparison{display:grid;grid-template-columns:1fr 1fr;gap:16px}.scan-comparison figure{margin:0;min-width:0}.scan-comparison img,.scan-no-image{width:100%;height:300px;object-fit:contain;background:#e7eddf;border-radius:18px;display:block}.scan-comparison figcaption{font-weight:700;padding:10px 0}.scan-reference-thumbs{align-items:flex-start}.scan-reference-thumbs figure{margin:0;flex:1;min-width:80px;max-width:180px}.scan-reference-thumbs figcaption{text-align:left}.scan-no-image{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px}.scan-no-image svg{width:96px;height:96px}.scan-credit{display:block;font-size:11px;line-height:1.5;font-weight:400;overflow-wrap:anywhere;margin:4px 0!important}.scan-details{border-top:1px solid #d7e3d4;margin-top:24px;padding-top:8px}.scan-details summary{min-height:48px}.scan-details dd{margin:0 0 8px}.scan-error{background:#fff0e4;padding:12px;border-radius:12px;color:#813500}.scan-notice{font-size:13px}.scan-file:has(input:disabled){opacity:.55;cursor:wait}@media(max-width:540px){.scan-modes button{flex-direction:column;align-items:flex-start;gap:6px;padding:12px}.scan-comparison{grid-template-columns:1fr}.scan-comparison img,.scan-no-image{height:280px}.scan-pickers{flex-direction:column}.scan-organs{gap:6px}.scan-organs button{min-width:48px;font-size:11px}.scan-organs svg{width:34px;height:34px}}@media(prefers-reduced-motion:reduce){.plant-scan *{transition:none!important;animation:none!important;scroll-behavior:auto!important}}

/* Keep the first photo invitation in view, rather than a tall form-like column. */
@media(min-width:760px){
  .scan-empty{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);column-gap:28px;align-items:start}
  .scan-empty>*{grid-column:1 / -1;min-width:0}
  .scan-empty>header{grid-column:1;grid-row:1}
  .scan-empty h2{margin:8px 0 16px}
  .scan-empty>.scan-modes{grid-column:1;grid-row:2;margin:0}
  .scan-empty .scan-modes button{flex-direction:column;align-items:flex-start;gap:6px;padding:12px;font-size:16px;min-height:112px}
  .scan-empty .scan-modes svg{width:52px;height:52px}
  .scan-empty>.scan-photo{grid-column:2;grid-row:1 / 4}
  .scan-empty .scan-placeholder>svg{height:150px}
  .scan-empty .scan-placeholder strong{font-size:21px}
  .scan-empty .scan-placeholder p{margin:4px 0 8px}
  .scan-empty>.scan-disclosure{grid-column:1;grid-row:3;text-align:left;margin:16px 0 0!important}
  .scan-empty .scan-pickers{gap:8px;margin-top:8px}
  .scan-empty .scan-pickers .scan-file{font-size:14px;padding:8px;gap:6px;min-height:56px}
  .scan-empty .scan-pickers svg{width:28px;height:28px}
  .scan-empty>.scan-status{margin:12px 0 0;min-height:20px}
  .scan-empty>.scan-details{margin-top:12px}
}
@media(max-width:540px){
  .plant-scan h2{margin-bottom:16px}
  .scan-modes{margin-bottom:12px;gap:8px}
  .scan-modes button{min-height:96px}
  .scan-modes svg{width:48px;height:48px}
  .scan-photo{padding:12px}
  .scan-placeholder{padding:0}
  .scan-placeholder>svg{height:140px}
  .scan-placeholder strong{font-size:21px}
  .scan-placeholder p{margin:4px 0 8px}
  .scan-pickers{flex-direction:row;gap:8px;margin-top:10px}
  .scan-pickers .scan-file{min-width:0;min-height:56px;padding:8px 6px;font-size:14px;gap:6px}
  .scan-pickers svg{width:28px;height:28px;flex-shrink:0}
  .scan-gallery span{font-size:26px}
  .scan-empty>.scan-disclosure{margin:12px 0 8px!important}
  .scan-empty>.scan-status{margin:8px 0;min-height:20px}
  .scan-empty>.scan-details{margin-top:12px}
}

.plant-scan .scan-ask-ai{display:block;width:100%;min-height:56px;margin-top:20px;background:var(--yellow);border-color:var(--yellow);font-size:18px;color:var(--green)}
</style>
