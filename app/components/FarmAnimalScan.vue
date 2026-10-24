<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({ user: { type: Object, required: true } })
const emit = defineEmits(['ask-ai'])
const photo = ref(''), result = ref(null), error = ref('')
const configured = ref(false), checking = ref(false), preparing = ref(false), sending = ref(false)
const fileInput = ref(null), cameraInput = ref(null), resultHeading = ref(null)
const busy = computed(() => checking.value || preparing.value || sending.value)
const canSend = computed(() => !!props.user?.id && configured.value && !!photo.value && !busy.value)
let active = false, generation = 0
const controllers = new Set()
function invalidate() {
  generation++
  for (const controller of controllers) controller.abort()
  controllers.clear()
  checking.value = false; preparing.value = false; sending.value = false
}
function resetPhoto() {
  invalidate(); photo.value = ''; result.value = null; error.value = ''
  if (fileInput.value) fileInput.value.value = ''
  if (cameraInput.value) cameraInput.value.value = ''
}
async function checkConfiguration() {
  if (!active || !props.user?.id || checking.value) return
  const token = generation, controller = new AbortController()
  controllers.add(controller); checking.value = true; configured.value = false; error.value = ''
  try {
    const data = await $fetch('/api/animal-scan', { signal: controller.signal, timeout: 15000, retry: 0 })
    if (active && token === generation) configured.value = data?.configured === true && data.provider === 'Roboflow' && data.experimental === true && data.animal === 'cattle' && data.model === 'cattle-disease-detection/1'
  } catch { if (active && token === generation) error.value = 'Could not check scanner availability. Try again.' }
  finally { controllers.delete(controller); if (active && token === generation) checking.value = false }
}
async function preparePhoto(file, signal) {
  if (!file || !['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Choose a JPEG or PNG photo.')
  if (!file.size || file.size > 3 * 1024 * 1024) throw new Error('Choose a photo no larger than 3 MB.')
  const image = new Image(), url = URL.createObjectURL(file)
  let canvas
  try {
    await new Promise((resolve, reject) => {
      const cleanup = () => { image.onload = null; image.onerror = null; signal.removeEventListener('abort', cancel) }
      const cancel = () => { cleanup(); image.src = ''; reject(new Error('Photo preparation cancelled.')) }
      image.onload = () => { cleanup(); resolve() }
      image.onerror = () => { cleanup(); reject(new Error('This photo could not be opened. Try another photo.')) }
      signal.addEventListener('abort', cancel, { once: true }); image.src = url
      if (signal.aborted) cancel()
    })
    if (signal.aborted) throw new Error('Photo preparation cancelled.')
    const width = image.naturalWidth, height = image.naturalHeight
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width * height > 40000000) throw new Error('Choose a photo up to 40 megapixels.')
    const scale = Math.min(1, 1280 / width, 1280 / height)
    canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Your browser cannot prepare photos.')
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const data = canvas.toDataURL('image/jpeg', 0.85)
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(data) || Math.ceil((data.length - 23) * 3 / 4) > 3 * 1024 * 1024) throw new Error('Prepared photo is too large. Choose a smaller picture.')
    return data
  } finally { URL.revokeObjectURL(url); image.src = ''; if (canvas) { canvas.width = 0; canvas.height = 0 } }
}
async function choosePhoto(event) {
  const file = event.target.files?.[0]
  if (!file || !active || !props.user?.id) return
  resetPhoto(); event.target.value = ''
  const token = generation, controller = new AbortController()
  controllers.add(controller); preparing.value = true
  try { const data = await preparePhoto(file, controller.signal); if (active && token === generation) photo.value = data }
  catch (cause) { if (active && token === generation) error.value = cause.message || 'Could not prepare photo.' }
  finally { controllers.delete(controller); if (active && token === generation) { preparing.value = false; if (!configured.value) checkConfiguration() } }
}
function validResponse(data) {
  return data?.provider === 'Roboflow' && data.experimental === true && data.animal === 'cattle' && data.model === 'cattle-disease-detection/1' && ['regions', 'no-regions'].includes(data.status) && Array.isArray(data.regions) && data.regions.length <= 100 && (data.status === 'regions' ? data.regions.length > 0 : data.regions.length === 0) && data.regions.every(region => {
    const box = region?.box
    return region?.label === 'Model-highlighted area' && Number.isFinite(region.score) && region.score >= 0 && region.score <= 1 && box && ['left', 'top', 'width', 'height'].every(key => Number.isFinite(box[key])) && box.left >= 0 && box.top >= 0 && box.width > 0 && box.height > 0 && box.left + box.width <= 1 && box.top + box.height <= 1
  })
}
function boxStyle(box) { return { left: `${box.left * 100}%`, top: `${box.top * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` } }
async function scan() {
  if (!canSend.value || !active) return
  const token = generation, controller = new AbortController()
  controllers.add(controller); sending.value = true; result.value = null; error.value = ''
  try {
    const data = await $fetch('/api/animal-scan', { method: 'POST', body: { image: photo.value, animal: 'cattle' }, signal: controller.signal, timeout: 45000, retry: 0 })
    if (!active || token !== generation) return
    if (!validResponse(data)) throw new Error('Unexpected scanner response. Please try again.')
    result.value = data
  } catch { if (active && token === generation) error.value = 'Scan could not complete. Your photo is still here. Try scanning again.' }
  finally { controllers.delete(controller); if (active && token === generation) sending.value = false }
}
function askAI() {
  if (active && result.value?.status === 'regions' && result.value.regions.length) emit('ask-ai', 'An experimental cattle photo scan highlighted areas to review, not a diagnosis. What should I observe and discuss with a veterinarian?')
}
watch(result, async value => { if (value) { await Promise.resolve(); if (active && result.value === value) resultHeading.value?.focus() } }, { flush: 'post' })
watch(() => props.user?.id, () => { resetPhoto(); configured.value = false; if (active) checkConfiguration() }, { flush: 'sync' })
onMounted(() => { active = true; checkConfiguration() })
onBeforeUnmount(() => { active = false; resetPhoto(); configured.value = false })
</script>

<template>
  <section class="animal-scan" aria-label="Experimental cattle photo scanner">
    <header><span class="photo-icon" aria-hidden="true">📷</span><div><span class="badge">Experimental</span><h2>Check a cow photo</h2><p>Explore visible patterns in a cattle photo.</p></div></header>
    <p v-if="!checking && !configured" class="setup" role="status">Scanner needs setup. No photo will be sent until Roboflow is connected. <button type="button" :disabled="busy" @click="checkConfiguration">Check availability</button></p>
    <div class="scan-layout">
      <div class="photo-panel">
        <div v-if="photo" class="image-frame"><img :src="photo" alt="Your prepared cow photo" /><span v-for="(region, index) in result?.regions || []" :key="index" class="region-box" :style="boxStyle(region.box)" aria-hidden="true"><b>{{ index + 1 }}</b></span></div>
        <div v-else class="placeholder"><span aria-hidden="true">🐄</span><strong>One cow. One clear photo.</strong><p>Photograph the area you want to look at.</p></div>
        <div class="photo-actions"><button type="button" :disabled="!user?.id" @click="fileInput?.click()">{{ photo ? 'Replace photo' : 'Choose photo' }}</button><button type="button" :disabled="!user?.id" @click="cameraInput?.click()">Take a photo</button><button v-if="photo || preparing" type="button" @click="resetPhoto">Remove photo</button></div>
        <input ref="fileInput" class="file-input" type="file" accept="image/jpeg,image/png" aria-label="Choose cow photo" @change="choosePhoto" />
        <input ref="cameraInput" class="file-input" type="file" accept="image/jpeg,image/png" capture="environment" aria-label="Take cow photo" @change="choosePhoto" />
        <small>JPEG or PNG · up to 3 MB</small>
      </div>
      <div class="result-panel">
        <button class="scan-button" type="button" :disabled="!canSend" @click="scan">{{ sending ? 'Scanning…' : 'Scan with Roboflow' }}</button>
        <p class="sharing">Photo sent to Roboflow. Visual screening, not a diagnosis.</p>
        <p role="status" aria-live="polite">{{ checking ? 'Checking scanner availability…' : preparing ? 'Preparing photo on this device…' : sending ? 'Looking for regions… Remove the photo to cancel.' : photo ? 'Photo ready. Only Scan sends it.' : 'Choose a photo to begin.' }}</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <section v-if="result" aria-label="Scan results"><h3 ref="resultHeading" tabindex="-1">{{ result.status === 'regions' ? 'Areas to look at' : 'No regions returned' }}</h3><p>No regions does not mean healthy.</p><ol v-if="result.regions.length"><li v-for="(region, index) in result.regions" :key="index"><strong>{{ region.label }}</strong><span>Model score: {{ region.score.toFixed(2) }}</span></li></ol><p v-if="result.regions.length">Model score, not a probability of disease.</p><button v-if="result.regions.length" type="button" @click="askAI">Ask FarmBuddyAI</button></section>
        <details><summary>About this experimental scan</summary><p>Cattle only. Other animals are not supported. This is not universal animal disease diagnosis.</p><p>Roboflow model: cattle-disease-detection/1. Public dataset: 51 images, CC BY 4.0. Not clinically validated. A highlighted box may cover the whole animal, not a precisely located lesion. It does not confirm lumpy skin disease. No result establishes that an animal is healthy.</p><p>Photo metadata is stripped locally and the image resized to fit 1280 px. This scanner does not store photos or results locally. Roboflow processes the photo under its own provider policies. Avoid identifying details in the photo.</p><p>Ask FarmBuddyAI prepares a short question for you to review. It does not send the question or your photo.</p></details>
      </div>
    </div>
  </section>
</template>

<style scoped>
.animal-scan{color:#203b2b;background:transparent;border:0;border-radius:0;padding:clamp(18px,3vw,32px)}header{display:flex;align-items:center;gap:16px;margin-bottom:24px}h2{font-size:clamp(1.5rem,3vw,2rem);margin:5px 0}h3{font-size:1.35rem}p{line-height:1.55}header p{margin:0;color:#586b56}.photo-icon{font-size:2rem;background:#edf3df;padding:14px;border-radius:20px}.badge{font-size:.75rem;font-weight:700;background:#f7e8a7;border-radius:20px;padding:4px 9px}.scan-layout{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:28px}.photo-panel,.result-panel{min-width:0}.image-frame{position:relative;width:100%;line-height:0;overflow:hidden;border-radius:18px}.image-frame img{display:block;width:100%;height:auto}.region-box{position:absolute;box-sizing:border-box;border:3px solid #ffda36;pointer-events:none}.region-box b{display:inline-block;line-height:1.2;background:#ffda36;color:#203b2b;padding:3px;font-size:14px}.placeholder{min-height:230px;border:2px dashed #cad9b5;background:#f1f5e8;border-radius:18px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px}.placeholder>span{font-size:3rem}.placeholder p{margin-bottom:0}.photo-actions{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 8px}button{min-height:44px;border:1px solid #c5d6ba;border-radius:12px;background:#f1f6e9;color:#203b2b;padding:10px 15px;font:inherit;font-weight:650;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}button:focus-visible,summary:focus-visible{outline:3px solid #92731d;outline-offset:3px}.scan-button{background:#285a35;color:white;width:100%;border-color:#285a35}.sharing{font-size:.86rem;color:#53614d}small{color:#596954}.setup{padding:14px;background:#fff2bd;border-radius:14px}.setup button{margin-top:6px}.error{color:#922f21}ol{padding-left:24px}li{padding:10px 0}li span{display:block;font-size:.85rem;margin-top:4px}details{margin-top:24px;border-top:1px solid #dfe8d6;padding-top:16px;font-size:.88rem}summary{cursor:pointer;font-weight:650;min-height:44px;align-content:center}.file-input{display:none}@media(max-width:700px){.scan-layout{grid-template-columns:1fr;gap:20px}}
</style>
