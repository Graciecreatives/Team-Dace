<script setup>
import { ArrowRight, Eye, EyeOff } from 'lucide-vue-next'
import AuthShell from '~/components/AuthShell.vue'

useHead({ title: 'Create your account | FarmBuddy' })
const name = ref('')
const email = ref('')
const password = ref('')
const farmName = ref('')
const farmType = ref('mixed')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')
const errorBox = ref(null)
const confirmation = ref('')
const confirmationBox = ref(null)
const requestFetch = useRequestFetch()
const { data: authConfiguration } = await useFetch('/api/auth/config')
const setupRequired = computed(() => authConfiguration.value?.mode === 'supabase' && authConfiguration.value.configured === false)
let currentUser = null
try {
  const response = await requestFetch('/api/auth/me')
  currentUser = response?.user
} catch {
  // A missing session is expected when creating an account.
}
function destination(user) {
  if (user?.onboardingCompleted !== true) return '/onboarding'
  return user.farmType === 'crops' ? '/dashboard/crops' : ['livestock', 'poultry'].includes(user.farmType) ? '/dashboard/livestock' : '/dashboard'
}
if (currentUser) await navigateTo(destination(currentUser), { replace: true })

async function submit() {
  if (loading.value || setupRequired.value) return
  error.value = ''
  confirmation.value = ''
  loading.value = true
  try {
    const response = await $fetch('/api/auth/register', {
      method: 'POST',
      body: { name: name.value.trim(), email: email.value.trim(), password: password.value, farmName: farmName.value.trim(), farmType: farmType.value },
    })
    password.value = ''
    if (response.requiresEmailConfirmation) {
      confirmation.value = 'Check your email for a confirmation link. If this address is eligible, confirm it, then return here to sign in. No dashboard session has been created yet.'
      await nextTick()
      confirmationBox.value?.focus()
      return
    }
    if (!response.user) throw new Error('No authenticated user returned')
    await navigateTo(destination(response.user))
  } catch (cause) {
    error.value = cause?.data?.message || cause?.data?.statusMessage || 'Unable to create your account. Please try again.'
    await nextTick()
    errorBox.value?.focus()
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthShell mode="register">
    <h1 class="auth-title">Good things start here.</h1>
    <p class="auth-description">Create your account and make a little more room for growth.</p>
    <div v-if="confirmation" ref="confirmationBox" role="status" tabindex="-1" class="confirmation-message"><strong>One more step: confirm your email.</strong><p>{{ confirmation }}</p><NuxtLink to="/login">Go to sign in <ArrowRight :size="16" aria-hidden="true" /></NuxtLink></div>
    <form v-if="!confirmation" class="auth-form" :aria-busy="loading" @submit.prevent="submit">
      <div v-if="setupRequired" class="error-message" role="alert">Supabase setup is incomplete. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to the private .env file and restart the server. Use your project's publishable key, not its service-role key. Updating .env.example alone does not configure the app.</div>
      <div v-if="error" ref="errorBox" class="error-message" role="alert" tabindex="-1">{{ error }}</div>
      <div class="field">
        <label for="register-name">Your name</label>
        <input id="register-name" v-model="name" name="name" autocomplete="name" placeholder="Your full name" required pattern=".*\S.*" :readonly="loading" />
      </div>
      <div class="field">
        <label for="register-email">Email address</label>
        <input id="register-email" v-model="email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" required :readonly="loading" />
      </div>
      <div class="field">
        <label for="register-password">Password</label>
        <div class="password-wrap">
          <input id="register-password" v-model="password" name="password" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="Create a strong password" required minlength="10" maxlength="128" aria-describedby="password-hint" :readonly="loading" />
          <button class="reveal" type="button" :aria-label="showPassword ? 'Hide password' : 'Show password'" :aria-pressed="showPassword" aria-controls="register-password" @click="showPassword = !showPassword"><component :is="showPassword ? EyeOff : Eye" :size="19" aria-hidden="true" /></button>
        </div>
        <p id="password-hint" class="field-hint">Use 10–128 characters. A few unrelated words work well.</p>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="register-farm">Farm name</label>
          <input id="register-farm" v-model="farmName" name="farmName" autocomplete="organization" placeholder="Your farm's name" required pattern=".*\S.*" :readonly="loading" />
        </div>
        <div class="field">
          <label for="register-type">Farm type</label>
          <select id="register-type" v-model="farmType" name="farmType" :disabled="loading"><option value="mixed">Mixed farming</option><option value="crops">Crops</option><option value="livestock">Livestock</option><option value="poultry">Poultry</option></select>
        </div>
      </div>
      <button class="submit-button" type="submit" :disabled="loading || setupRequired"><span aria-live="polite">{{ loading ? 'Creating your account…' : 'Create account' }}</span><ArrowRight v-if="!loading" :size="18" aria-hidden="true" /></button>
    </form>
    <p class="switch-link">Already growing with us? <NuxtLink to="/login">Sign in</NuxtLink></p>
  </AuthShell>
</template>

<style scoped>
.confirmation-message{margin:20px 0;padding:20px;border:1px solid #c6dcb8;border-radius:16px;background:#f0f7e9;color:#193d2b;font-size:14px;line-height:1.7}.confirmation-message p{margin:8px 0 14px}.confirmation-message a{display:inline-flex;align-items:center;gap:8px;font-weight:700;color:#066136}.confirmation-message:focus-visible{outline:3px solid #f9c23c;outline-offset:3px}
</style>
