<script setup>
import { Sprout, Wheat, Beef, Layers, ArrowRight, Check } from 'lucide-vue-next'
useHead({ title: 'Make yourself at home | FarmBuddy' })
const requestFetch = useRequestFetch()
const user = ref(null)
const sessionError = ref('')
function destination(value) {
  return value.farmType === 'crops' ? '/dashboard/crops' : ['livestock', 'poultry'].includes(value.farmType) ? '/dashboard/livestock' : '/dashboard'
}
try {
  user.value = (await requestFetch('/api/auth/me')).user
} catch (cause) {
  if (cause?.statusCode === 401 || cause?.response?.status === 401) await navigateTo('/login', { replace: true })
  else sessionError.value = 'We could not load your farm. Please refresh to try again.'
}
if (user.value?.onboardingCompleted === true) await navigateTo(destination(user.value), { replace: true })
const form = reactive({ farmName: user.value?.farmName || '', farmType: user.value?.farmType === 'poultry' ? 'livestock' : ['crops', 'livestock', 'mixed'].includes(user.value?.farmType?.toLowerCase()) ? user.value.farmType.toLowerCase() : '', mainEnterprises: user.value?.mainEnterprises || '', location: user.value?.location || '', preferredLanguage: user.value?.preferredLanguage || '' })
const types = [{ value: 'crops', label: 'Crops', detail: 'From seed to harvest', icon: Wheat }, { value: 'livestock', label: 'Livestock', detail: 'Animals, including poultry', icon: Beef }, { value: 'mixed', label: 'Mixed farming', detail: 'A little of both', icon: Layers }]
const step = ref(1)
const busy = ref(false)
const error = ref('')
const errorBox = ref(null)
const heading = ref(null)
async function move(next) {
  error.value = ''
  step.value = next
  await nextTick()
  heading.value?.focus()
}
async function showError(message) {
  error.value = message
  await nextTick()
  errorBox.value?.focus()
}
async function submit() {
  if (busy.value) return
  if (!form.farmType || !form.farmName.trim()) return showError('Choose a farming type and enter your farm name.')
  if (step.value < 3) return move(step.value + 1)
  busy.value = true
  error.value = ''
  try {
    const response = await $fetch('/api/farm/profile', { method: 'PATCH', body: { ...form, onboardingCompleted: true } })
    await navigateTo(destination(response.user), { replace: true })
  } catch (cause) {
    if (cause?.statusCode === 401 || cause?.response?.status === 401) return navigateTo('/login')
    await showError(cause?.data?.statusMessage || cause?.data?.message || 'Your farm could not be saved. Your details are still here. Please try again.')
  } finally { busy.value = false }
}
</script>

<template>
  <main class="onboarding">
    <header class="topbar"><NuxtLink to="/" class="brand"><Sprout :size="27" aria-hidden="true" /> FarmBuddy<span class="brand-dot">.</span></NuxtLink><span>Your farm. Your way.</span></header>
    <div v-if="sessionError" class="session-error" role="alert">{{ sessionError }} <button type="button" @click="reloadNuxtApp()">Try again</button></div>
    <div v-else-if="user && !user.onboardingCompleted" class="layout">
      <aside class="intro"><span class="eyebrow">A GOOD PLACE TO GROW</span><h1>A little about<br />your farm.</h1><p>Let's make FarmBuddy feel like home. Just a few details to get you started.</p><div class="garden" aria-hidden="true"><Sprout :size="118" :stroke-width="1" /><span>Good things grow from here.</span></div><p class="privacy">Only share what you're comfortable with. No location access needed.</p></aside>
      <section class="card" aria-label="Farm setup">
        <ol class="progress" aria-label="Setup progress"><li v-for="(label, index) in ['Your farm', 'The details', 'Review']" :key="label" :class="{ active: step >= index + 1 }" :aria-current="step === index + 1 ? 'step' : undefined"><span><Check v-if="step > index + 1" :size="15" aria-hidden="true" /><template v-else>{{ index + 1 }}</template></span>{{ label }}</li></ol>
        <p class="step-count">STEP {{ step }} OF 3</p>
        <h2 ref="heading" tabindex="-1">{{ step === 1 ? 'What do you grow?' : step === 2 ? 'Make it your own.' : 'Ready to get growing?' }}</h2>
        <p class="description">{{ step === 1 ? 'Choose the best fit. Poultry belongs with livestock.' : step === 2 ? 'These details are optional. Add what matters to you.' : 'Check your details before opening your farm dashboard.' }}</p>
        <form :aria-busy="busy" @submit.prevent="submit">
          <div v-if="error" ref="errorBox" role="alert" tabindex="-1" class="error">{{ error }}</div>
          <div v-if="step === 1">
            <fieldset><legend>Farming type <span>(required)</span></legend><div class="type-grid"><label v-for="type in types" :key="type.value" class="type-option" :class="{ selected: form.farmType === type.value }"><input v-model="form.farmType" type="radio" name="farmType" :value="type.value" required /><component :is="type.icon" :size="27" aria-hidden="true" /><strong>{{ type.label }}</strong><small>{{ type.detail }}</small></label></div></fieldset>
            <label class="field" for="farm-name">Farm name <span>(required)</span><input id="farm-name" v-model="form.farmName" maxlength="150" required pattern=".*\S.*" autocomplete="organization" placeholder="e.g. Green Valley Farm" /></label>
          </div>
          <div v-else-if="step === 2">
            <label class="field" for="enterprises">Main crops or animals <span>(optional)</span><input id="enterprises" v-model="form.mainEnterprises" maxlength="500" placeholder="e.g. Maize, tomatoes, dairy cows" /><small>A simple list is all you need.</small></label>
            <label class="field" for="location">Location <span>(optional)</span><input id="location" v-model="form.location" maxlength="200" autocomplete="address-level2" placeholder="Your town, region or country" /><small>Type it yourself. We never request your device location.</small></label>
            <label class="field" for="language">Preferred language <span>(optional)</span><input id="language" v-model="form.preferredLanguage" maxlength="80" placeholder="e.g. English" /><small>Saved to your profile. This does not change the app language.</small></label>
          </div>
          <dl v-else class="review"><div><dt>Farm name</dt><dd>{{ form.farmName }}</dd></div><div><dt>Farming type</dt><dd>{{ types.find(type => type.value === form.farmType)?.label }}</dd></div><div><dt>Main crops or animals</dt><dd>{{ form.mainEnterprises || 'Not added' }}</dd></div><div><dt>Location</dt><dd>{{ form.location || 'Not added' }}</dd></div><div><dt>Preferred language</dt><dd>{{ form.preferredLanguage || 'Not added' }}</dd></div></dl>
          <div class="actions"><button v-if="step > 1" type="button" class="back" :disabled="busy" @click="move(step - 1)">Back</button><button class="primary" type="submit" :disabled="busy"><span aria-live="polite">{{ busy ? 'Saving your farm…' : step === 3 ? 'Save & open my farm' : 'Continue' }}</span><ArrowRight v-if="!busy" :size="18" aria-hidden="true" /></button></div>
          <button v-if="step === 2" type="button" class="skip" @click="move(3)">Skip optional details for now</button>
        </form>
        <p class="footnote">A simpler day on the farm starts here.</p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.onboarding{min-height:100vh;background:#f7f6ef;color:#243b2b;font-family:Arial,sans-serif;padding:28px 6vw 48px}.topbar{display:flex;justify-content:space-between;align-items:center;gap:20px;max-width:1200px;margin:auto}.topbar>span{font-size:13px;color:#6d776c}.brand{display:flex;align-items:center;gap:8px;color:#244c32;font-size:23px;font-weight:750;text-decoration:none}.brand-dot{color:#8b9e52;margin-left:-8px}.layout{display:grid;grid-template-columns:1fr 1.35fr;gap:70px;align-items:center;max-width:1100px;margin:65px auto 0}.eyebrow,.step-count{font-size:11px;font-weight:700;letter-spacing:1.8px;color:#6b805d}.intro h1{font-family:Georgia,serif;font-size:clamp(38px,4.8vw,62px);line-height:1.1;font-weight:400;margin:22px 0}.intro p{color:#6b756a;line-height:1.8;max-width:330px}.garden{margin:40px 0 26px;display:flex;align-items:center;gap:15px;color:#78905e}.garden span{font-family:Georgia,serif;font-style:italic;max-width:120px;line-height:1.6}.intro .privacy{font-size:12px;max-width:290px}.card{padding:36px;background:#fffefa;border:1px solid #e5e6db;border-radius:24px;box-shadow:0 15px 55px #30472d08}.progress{display:flex;list-style:none;padding:0;margin:0 0 35px;justify-content:space-between;gap:8px}.progress li{display:flex;align-items:center;gap:7px;font-size:12px;color:#899083}.progress li>span{border:1px solid #dce1d3;border-radius:50%;width:25px;height:25px;display:grid;place-items:center}.progress li.active{color:#355a37;font-weight:700}.progress li.active>span{background:#eaf0df;border-color:#b9caa2}h2{font-family:Georgia,serif;font-size:31px;font-weight:400;margin:12px 0}.description{font-size:14px;color:#737c6e;line-height:1.6;margin-bottom:26px}.step-count{margin:0}fieldset{border:0;padding:0;margin:0 0 24px}legend,.field{font-size:13px;font-weight:700}legend span,.field>span{font-weight:400;color:#818778}.type-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px}.type-option{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:10px;border:1px solid #dfe3d6;border-radius:12px;padding:18px 12px;color:#6f8061;cursor:pointer}.type-option input{position:absolute;right:10px;top:10px;accent-color:#355b35}.type-option strong{font-size:13px;color:#354c33}.type-option small{font-size:11px;line-height:1.4}.type-option.selected{background:#f0f5e8;border-color:#6e8d54}.type-option:focus-within{outline:2px solid #4d743f;outline-offset:3px}.field{display:block;margin:20px 0}.field input{display:block;width:100%;box-sizing:border-box;border:1px solid #dce1d3;border-radius:9px;background:#fff;padding:13px;margin-top:9px;font:400 14px Arial;color:#243b2b}.field small{display:block;color:#7b8274;font-size:11px;font-weight:400;line-height:1.5;margin-top:7px}input:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #8ba56a;outline-offset:3px}.actions{display:flex;gap:15px;margin-top:28px;align-items:center}.primary{margin-left:auto;display:flex;justify-content:center;align-items:center;gap:12px;background:#315735;color:white;border:0;border-radius:9px;padding:14px 22px;font-weight:700;cursor:pointer}.back,.skip{background:none;border:0;color:#58714a;cursor:pointer;padding:10px}.skip{display:block;margin:12px auto 0;font-size:12px;text-decoration:underline;text-underline-offset:3px}button:disabled{opacity:.6;cursor:wait}.footnote{border-top:1px solid #eceee4;padding-top:22px;margin:25px 0 0;text-align:center;color:#8a9180;font-size:11px}.review{margin:0}.review>div{padding:13px 0;border-bottom:1px solid #eceee4;display:grid;grid-template-columns:1fr 1.2fr;gap:16px}.review dt{font-size:12px;color:#7b8274}.review dd{font-size:14px;margin:0;overflow-wrap:anywhere}.error,.session-error{padding:14px;background:#fff0e9;color:#8b3928;border-radius:9px;font-size:14px;line-height:1.5}.session-error{max-width:600px;margin:60px auto}@media(max-width:800px){.layout{grid-template-columns:1fr;gap:22px;margin-top:40px;max-width:560px}.intro h1{font-size:38px;margin:12px 0}.intro h1 br{display:none}.intro p{max-width:none;margin:0}.garden,.intro .privacy{display:none}.card{padding:26px}.topbar>span{display:none}}@media(max-width:420px){.onboarding{padding:22px 16px}.card{padding:22px 16px}.type-grid{gap:7px}.type-option{padding:28px 9px 12px}.type-option strong{font-size:12px}.progress li{font-size:10px;gap:4px}.primary{padding:14px 16px}}
</style>
