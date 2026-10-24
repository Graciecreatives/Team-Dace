<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { Bot, Camera, Volume2, CloudSun, RefreshCw } from 'lucide-vue-next'
import FbBadge from './ui/FbBadge.vue'
import FbButton from './ui/FbButton.vue'
import FbPanel from './ui/FbPanel.vue'
const props = defineProps({ userId: { type: String, default: '' } })
const status = ref(null)
const loading = ref(false)
const error = ref('')
let generation = 0
let controller
const services = computed(() => [
  { id: 'text', title: 'AI conversations', provider: 'OpenRouter', icon: Bot },
  { id: 'photos', title: 'Photo guidance', provider: 'Compatible vision model', icon: Camera },
  { id: 'plantScan', title: 'Specialist plant scanner', provider: 'Pl@ntNet image recognition', icon: Camera },
  { id: 'animalScan', title: 'Experimental cattle scanner', provider: 'Roboflow skin-lesion screening', icon: Camera },
  { id: 'voice', title: 'Spoken replies', provider: 'YarnGPT', icon: Volume2 },
  { id: 'weather', title: 'Weather advice', provider: 'OpenWeather', icon: CloudSun },
])
async function load() {
  if (loading.value || !props.userId) return
  const current = ++generation
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  error.value = ''
  status.value = null
  try {
    const result = await $fetch('/api/services/status', { signal: controller.signal, timeout: 15000, retry: 0 })
    if (current !== generation) return
    if (result?.configurationOnly !== true || services.value.some(item => typeof result.services?.[item.id] !== 'boolean')) throw new Error('Invalid service response')
    status.value = result.services
  } catch {
    if (current === generation) error.value = 'Could not check service configuration. Try again.'
  } finally { if (current === generation) loading.value = false }
}
watch(() => props.userId, () => {
  generation++
  controller?.abort()
  loading.value = false
  status.value = null
  error.value = ''
  load()
}, { flush: 'sync' })
onMounted(load)
onUnmounted(() => { generation++; controller?.abort() })
</script>

<template>
  <FbPanel title="Connected services" class="service-panel" :aria-busy="loading">
    <template #actions><FbButton variant="ghost" :busy="loading" :disabled="!userId" aria-label="Refresh service configuration" @click="load"><RefreshCw :size="15" aria-hidden="true" />Refresh</FbButton></template>
    <p class="service-intro">See which services the site owner has configured.</p>
    <p v-if="error" role="alert" class="service-error">{{ error }}</p>
    <div class="service-grid">
      <div v-for="item in services" :key="item.id" class="service-card">
        <span class="service-icon"><component :is="item.icon" :size="19" aria-hidden="true" /></span>
        <div><h3>{{ item.title }}</h3><p>{{ item.provider }}</p></div>
        <FbBadge :tone="status ? status[item.id] ? 'success' : 'warning' : 'neutral'">{{ loading ? 'Checking' : status ? status[item.id] ? 'Configured' : 'Setup needed' : 'Not checked' }}</FbBadge>
      </div>
    </div>
    <details class="service-details"><summary>What these statuses mean</summary><p>Configured means the required server settings are present, not that a live provider request has passed. Provider access, quota, supported models and network availability can still affect requests.</p><p>Ask the site owner to complete missing services. Keep API keys on the server, never in your farm profile. Photo guidance needs a supported vision model. Browser voice typing depends on your browser and microphone permission, separately from YarnGPT spoken replies.</p></details>
  </FbPanel>
</template>

<style scoped>
.service-intro { margin: 0 0 18px; color: #62745f; font-size: 13px; line-height: 1.6; }
.service-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.service-card { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; border: 1px solid #e0e7d8; border-radius: 16px; padding: 15px; min-width: 0; }
.service-card > div { flex: 1; min-width: 100px; }
.service-card h3 { margin: 0; font-size: 13px; font-weight: 700; }
.service-card p { margin: 4px 0 0; font-size: 11px; color: #62745f; }
.service-icon { display: grid; place-items: center; background: #edf2e5; color: #066136; width: 36px; height: 36px; border-radius: 11px; }
.service-details { margin-top: 18px; color: #62745f; font-size: 12px; line-height: 1.7; }
.service-details summary { cursor: pointer; font-weight: 700; color: #426441; }
.service-details p { margin: 10px 0 0; }
.service-error { background: #fff1ed; border-radius: 10px; padding: 12px; color: #963c2d; font-size: 13px; }
@media(max-width: 600px) { .service-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
