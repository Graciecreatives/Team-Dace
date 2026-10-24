<script setup>
import FarmServiceStatus from './FarmServiceStatus.vue'
import { Settings, LogOut, LoaderCircle, ShieldCheck, Pencil, X, Sprout, MapPin, Languages } from 'lucide-vue-next'
const props = defineProps({ user: { type: Object, required: true }, loggingOut: Boolean, onProfileSaved: { type: Function, required: true } })
defineEmits(['logout'])
const form = reactive({ farmName: '', farmType: '', mainEnterprises: '', location: '', preferredLanguage: '' })
const saving = ref(false)
const editorOpen = ref(false)
const editorHeading = ref(null)
const editButton = ref(null)
async function openEditor() {
  populate(props.user)
  editorOpen.value = true
  await nextTick()
  editorHeading.value?.focus()
}
async function closeEditor() {
  if (saving.value) return
  populate(props.user)
  editorOpen.value = false
  await nextTick()
  editButton.value?.focus()
}
const error = ref('')
const success = ref('')
const errorBox = ref(null)
function populate(user) {
  Object.assign(form, {
    farmName: user.farmName || '',
    farmType: user.farmType === 'poultry' ? 'livestock' : user.farmType || '',
    mainEnterprises: Array.isArray(user.mainEnterprises) ? user.mainEnterprises.join(', ') : user.mainEnterprises || '',
    location: user.location || '', preferredLanguage: user.preferredLanguage || '',
  })
}
watch(() => props.user, populate, { immediate: true })
async function save() {
  if (saving.value || props.loggingOut) return
  error.value = ''; success.value = ''
  if (!form.farmName.trim()) error.value = 'Enter your farm name.'
  else if (Object.values(form).some(value => /[<>\u0000-\u001f\u007f]/.test(value))) error.value = 'Use plain text without angle brackets or control characters.'
  if (error.value) { await nextTick(); errorBox.value?.focus(); return }
  saving.value = true
  let persisted = false
  try {
    const result = await $fetch('/api/farm/profile', { method: 'PATCH', body: { ...form, onboardingCompleted: true } })
    persisted = true
    await props.onProfileSaved(result.user)
    populate(result.user)
    success.value = 'Your farm settings have been saved.'
    editorOpen.value = false
    await nextTick()
    editButton.value?.focus()
  } catch (cause) {
    error.value = persisted ? 'Your changes were saved, but the dashboard could not refresh. Reload the page to continue.' : cause?.data?.statusMessage || cause?.data?.message || 'Could not save your settings. Please try again.'
    await nextTick(); errorBox.value?.focus()
  } finally { saving.value = false }
}
</script>

<template>
  <section class="farm-settings max-w-3xl space-y-6" aria-labelledby="settings-title">
    <header><div class="flex items-center gap-3"><span class="rounded-xl bg-[#F9C23C] p-2.5"><Settings :size="22" aria-hidden="true" /></span><h1 id="settings-title" class="text-2xl font-bold">Settings</h1></div><p class="mt-3 text-sm leading-6 text-[#526C46]">Keep your farm details up to date and manage your session.</p></header>
    <p v-if="error" ref="errorBox" role="alert" tabindex="-1" class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{{ error }}</p>
    <p v-if="success" role="status" class="rounded-xl border border-[#CFE1C4] bg-[#E8F2E0] p-4 text-sm text-[#32673B]">{{ success }}</p>
    <section class="profile-overview" aria-labelledby="profile-overview-title">
      <div class="profile-identity"><span class="profile-mark"><Sprout :size="32" aria-hidden="true" /></span><div><p>Your farm profile</p><h2 id="profile-overview-title">{{ user.farmName || 'Your farm' }}</h2><p>{{ user.farmType === 'crops' ? 'Crop farm' : ['livestock', 'poultry'].includes(user.farmType) ? 'Livestock farm' : user.farmType === 'mixed' ? 'Mixed farm' : 'Farm type not set' }}</p></div></div>
      <dl class="profile-facts"><div><dt><MapPin :size="17" aria-hidden="true" />Based in</dt><dd>{{ user.location || 'Add your town or region' }}</dd></div><div><dt><Sprout :size="17" aria-hidden="true" />Growing &amp; raising</dt><dd>{{ Array.isArray(user.mainEnterprises) ? user.mainEnterprises.join(', ') || 'Not added yet' : user.mainEnterprises || 'Not added yet' }}</dd></div><div><dt><Languages :size="17" aria-hidden="true" />Language preference</dt><dd>{{ user.preferredLanguage || 'Not set' }}</dd></div></dl>
      <div class="profile-footer"><p>Your language preference is saved only. It does not translate the app.</p><button ref="editButton" type="button" :aria-expanded="editorOpen" aria-controls="profile-editor" :disabled="saving || loggingOut" @click="editorOpen ? closeEditor() : openEditor()"><Pencil :size="17" aria-hidden="true" />{{ editorOpen ? 'Close editor' : 'Edit farm profile' }}</button></div>
    </section>
    <form v-if="editorOpen" id="profile-editor" class="settings-panel" :aria-busy="saving" @submit.prevent="save">
      <div class="editor-heading"><h2 ref="editorHeading" tabindex="-1" class="text-lg font-bold">Edit farm profile</h2><button type="button" :disabled="saving" @click="closeEditor"><X :size="18" aria-hidden="true" />Cancel</button></div><p class="mt-2 text-sm leading-6 text-[#526C46]">Changing your farm type takes you to the matching dashboard. Your existing records stay with your account.</p>
      <fieldset :disabled="saving || loggingOut" class="mt-6 grid min-w-0 gap-5 sm:grid-cols-2">
        <div class="sm:col-span-2"><label for="settings-farm-name">Farm name</label><input id="settings-farm-name" v-model="form.farmName" required maxlength="150" autocomplete="organization"></div>
        <div><label for="settings-farm-type">Farm type</label><select id="settings-farm-type" v-model="form.farmType" required><option value="" disabled>Choose your farm type</option><option value="crops">Crops</option><option value="livestock">Livestock (including poultry)</option><option value="mixed">Mixed farming</option></select></div>
        <div><label for="settings-location">Location (optional)</label><input id="settings-location" v-model="form.location" maxlength="200" placeholder="e.g. Ibadan, Oyo State" aria-describedby="settings-location-hint"><p id="settings-location-hint" class="field-hint">A town or region is enough. No precise address is needed.</p></div>
        <div class="sm:col-span-2"><label for="settings-enterprises">Main crops or animals (optional)</label><input id="settings-enterprises" v-model="form.mainEnterprises" maxlength="500" placeholder="e.g. Maize, tomatoes, dairy cows"></div>
        <div class="sm:col-span-2"><label for="settings-language">Preferred language (optional)</label><input id="settings-language" v-model="form.preferredLanguage" maxlength="80" placeholder="e.g. English" aria-describedby="settings-language-hint"><p id="settings-language-hint" class="field-hint">Saved as a profile preference. This does not translate the app or enable notifications.</p></div>
      </fieldset>
      <button type="submit" :disabled="saving || loggingOut" class="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-[#066136] px-5 py-3 text-sm font-bold text-white hover:bg-[#084D2E] disabled:opacity-50"><LoaderCircle v-if="saving" :size="17" class="animate-spin" aria-hidden="true" />{{ saving ? 'Saving…' : 'Save farm settings' }}</button>
    </form>
    <FarmServiceStatus :user-id="user.id || ''" />
    <section class="settings-panel" aria-labelledby="account-title"><h2 id="account-title" class="text-lg font-bold">Your account</h2><dl class="mt-4 grid gap-4 sm:grid-cols-2"><div><dt class="text-xs text-[#526C46]">Account email (read only)</dt><dd class="mt-1 break-words text-sm font-semibold">{{ user.email || 'Not provided' }}</dd></div><div><dt class="text-xs text-[#526C46]">Role</dt><dd class="mt-1 text-sm font-semibold">Farm owner</dd></div></dl><p class="mt-4 text-sm leading-6 text-[#526C46]">Account name and email changes are not available here. Team contacts do not grant access to your account.</p><div class="mt-5 flex items-start gap-3 rounded-xl bg-[#F1F5E9] p-4 text-sm leading-6 text-[#526C46]"><ShieldCheck :size="20" class="mt-1 shrink-0" aria-hidden="true" /><p>These settings update your farm profile only. They do not publish a nearby-farmer profile or change its visibility. Manage location sharing in Nearby farmers. Reminders stay in your dashboard, with no email or push notifications enabled.</p></div><button type="button" :disabled="loggingOut || saving" class="mt-6 inline-flex items-center gap-2 rounded-xl border border-[#D6E1CB] px-5 py-3 text-sm font-bold text-[#066136] hover:bg-[#EDF1E6] disabled:opacity-50" @click="$emit('logout')"><LogOut :size="18" aria-hidden="true" />{{ loggingOut ? 'Signing out…' : 'Log out' }}</button></section>
  </section>
</template>

<style scoped>
.farm-settings { width:100%; min-width:0; color:#193D2B; }
.profile-overview { overflow:hidden; border-radius:24px; border:1px solid #cbdcc9; background:#f2f7ef; }
.profile-identity { display:flex; gap:18px; align-items:center; padding:28px; background:#066136; color:white; }
.profile-mark { display:grid; place-items:center; width:64px; height:64px; flex-shrink:0; border-radius:50%; background:#F9C23C; color:#193D2B; }
.profile-identity h2 { font-size:clamp(24px,4vw,34px); font-weight:700; line-height:1.2; overflow-wrap:anywhere; margin:5px 0; }
.profile-identity p { font-size:13px; color:#e0eddd; }
.profile-facts { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:24px; padding:26px; }
.profile-facts dt { display:flex; align-items:center; gap:7px; font-size:12px; color:#526C46; }
.profile-facts dd { margin-top:10px; font-weight:600; font-size:15px; overflow-wrap:anywhere; }
.profile-footer { display:flex; align-items:center; gap:20px; justify-content:space-between; padding:18px 26px; border-top:1px solid #d6e1cb; }
.profile-footer p { max-width:36ch; font-size:12px; line-height:1.6; color:#526C46; }
.profile-footer button { background:#F9C23C; border-radius:12px; padding:10px 16px; font-weight:700; flex-shrink:0; }
button { min-height:44px; display:inline-flex; align-items:center; justify-content:center; gap:8px; }
input, select { min-height:44px; }
.editor-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.editor-heading button { font-size:13px; }
@media(max-width:560px) { .profile-facts { grid-template-columns:1fr; gap:20px; padding:22px; } .profile-footer { align-items:stretch; flex-direction:column; padding:20px; gap:12px; } .profile-identity { padding:22px; gap:12px; } .profile-mark { width:48px; height:48px; } }
.settings-panel { padding: 24px; border: 1px solid #E0E7D8; border-radius: 20px; background: white; }
label { display: block; margin-bottom: 8px; font-size: 12px; font-weight: 700; color: #526C46; }
input, select { width: 100%; min-width: 0; border: 1px solid #D6E1CB; border-radius: 11px; background: white; padding: 12px; font: inherit; font-size: 14px; color: #193D2B; }
.field-hint { margin-top: 8px; font-size: 12px; line-height: 1.6; color: #526C46; }
input:focus-visible, select:focus-visible, button:focus-visible { outline: 2px solid #066136; outline-offset: 3px; }
fieldset:disabled { opacity: .7; }
@media (max-width: 480px) { .settings-panel { padding: 18px; } }
@media (prefers-reduced-motion: reduce) { .animate-spin { animation: none; } }
</style>
