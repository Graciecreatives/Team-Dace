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
const requestFetch = useRequestFetch()
let currentUser = null
try {
  const response = await requestFetch('/api/auth/me')
  currentUser = response?.user
} catch {
  // A missing session is expected when creating an account.
}
if (currentUser) await navigateTo('/dashboard', { replace: true })

async function submit() {
  if (loading.value) return
  error.value = ''
  loading.value = true
  try {
    await $fetch('/api/auth/register', {
      method: 'POST',
      body: { name: name.value.trim(), email: email.value.trim(), password: password.value, farmName: farmName.value.trim(), farmType: farmType.value },
    })
    await navigateTo('/dashboard')
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
    <form class="auth-form" :aria-busy="loading" @submit.prevent="submit">
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
      <button class="submit-button" type="submit" :disabled="loading"><span aria-live="polite">{{ loading ? 'Creating your account…' : 'Create account' }}</span><ArrowRight v-if="!loading" :size="18" aria-hidden="true" /></button>
    </form>
    <p class="switch-link">Already growing with us? <NuxtLink to="/login">Sign in</NuxtLink></p>
  </AuthShell>
</template>
