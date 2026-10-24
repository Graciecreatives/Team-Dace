<script setup>
import { ArrowRight, Eye, EyeOff } from 'lucide-vue-next'
import AuthShell from '~/components/AuthShell.vue'

useHead({ title: 'Welcome back | FarmBuddy' })
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')
const errorBox = ref(null)
const confirmationNotice = ref('')
onMounted(() => {
  // Default Supabase confirmation links may carry tokens in the URL fragment.
  // This app signs in with a password, never trusts or stores fragment tokens.
  if (/^#(?:access_token=|error=)/.test(window.location.hash)) {
    const failed = window.location.hash.startsWith('#error=')
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    confirmationNotice.value = failed ? 'This email link could not be completed. Try the latest confirmation email, then sign in.' : 'Email confirmation returned. Sign in below to continue. An expired or unconfirmed email will be reported when you sign in.'
  }
})
const requestFetch = useRequestFetch()
let currentUser = null
try {
  const response = await requestFetch('/api/auth/me')
  currentUser = response?.user
} catch {
  // An unavailable or unauthenticated session must not prevent signing in.
}
function destination(user) {
  if (user?.onboardingCompleted !== true) return '/onboarding'
  return user.farmType === 'crops' ? '/dashboard/crops' : ['livestock', 'poultry'].includes(user.farmType) ? '/dashboard/livestock' : '/dashboard'
}
if (currentUser) await navigateTo(destination(currentUser), { replace: true })

async function submit() {
  if (loading.value) return
  error.value = ''
  loading.value = true
  try {
    const response = await $fetch('/api/auth/login', {
      method: 'POST',
      body: { email: email.value.trim(), password: password.value },
    })
    if (!response.user) throw new Error('No authenticated user returned')
    password.value = ''
    await navigateTo(destination(response.user))
  } catch (cause) {
    error.value = cause?.data?.message || cause?.data?.statusMessage || 'Unable to sign in. Please check your details and try again.'
    await nextTick()
    errorBox.value?.focus()
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthShell>
    <h1 class="auth-title">Good to see you again.</h1>
    <p class="auth-description">Sign in to FarmBuddy. Let's pick up where your farm left off.</p>
    <p v-if="confirmationNotice" role="status" class="rounded-xl border border-[#D6E1CB] bg-[#F1F5E9] p-4 text-sm leading-6 text-[#193D2B]">{{ confirmationNotice }}</p>
    <form class="auth-form" :aria-busy="loading" @submit.prevent="submit">
      <div v-if="error" ref="errorBox" class="error-message" role="alert" tabindex="-1">{{ error }}</div>
      <div class="field">
        <label for="login-email">Email address</label>
        <input id="login-email" v-model="email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" required :readonly="loading" />
      </div>
      <div class="field">
        <label for="login-password">Password</label>
        <div class="password-wrap">
          <input id="login-password" v-model="password" name="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" placeholder="Enter your password" required :readonly="loading" />
          <button class="reveal" type="button" :aria-label="showPassword ? 'Hide password' : 'Show password'" :aria-pressed="showPassword" aria-controls="login-password" @click="showPassword = !showPassword"><component :is="showPassword ? EyeOff : Eye" :size="19" aria-hidden="true" /></button>
        </div>
      </div>
      <button class="submit-button" type="submit" :disabled="loading"><span aria-live="polite">{{ loading ? 'Signing in…' : 'Sign in' }}</span><ArrowRight v-if="!loading" :size="18" aria-hidden="true" /></button>
    </form>
    <p class="switch-link">New to FarmBuddy? <NuxtLink to="/register">Create an account</NuxtLink></p>
  </AuthShell>
</template>
