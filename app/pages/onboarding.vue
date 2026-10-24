<script setup>
import { Sprout, Wheat, Beef, Layers, ArrowRight, ArrowLeft, Check, ShieldCheck, Sun, Leaf } from 'lucide-vue-next'
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
      <aside class="intro">
        <span class="eyebrow"><span></span> YOUR NEXT CHAPTER STARTS HERE</span>
        <h1>Big plans. <br />Strong roots. <br /><span>Your farm.</span></h1>
        <p>A space for everything you grow and care for. Let's set up a dashboard that feels like yours.</p>
        <div class="garden" aria-hidden="true">
          <Sun class="garden-sun" :size="56" :stroke-width="1.5" />
          <div class="garden-cloud"></div><div class="garden-hill hill-back"></div><div class="garden-hill hill-front"></div>
          <div class="garden-crops"><Wheat :size="76" :stroke-width="1.3" /><Wheat :size="98" :stroke-width="1.3" /><Sprout :size="86" :stroke-width="1.3" /></div>
          <span class="garden-label"><Leaf :size="15" /> Good things grow from here.</span>
        </div>
        <p class="privacy"><ShieldCheck :size="19" aria-hidden="true" /><span>Your farm, your details. Share only what you need. No device location access.</span></p>
      </aside>
      <section class="card" aria-label="Farm setup">
        <ol class="progress" aria-label="Setup progress"><li v-for="(label, index) in ['Your farm', 'The details', 'Review']" :key="label" :class="{ active: step >= index + 1, current: step === index + 1 }" :aria-current="step === index + 1 ? 'step' : undefined"><span><Check v-if="step > index + 1" :size="15" aria-hidden="true" /><template v-else>{{ index + 1 }}</template></span>{{ label }}</li></ol>
        <p class="step-count">STEP {{ step }} OF 3</p>
        <h2 ref="heading" tabindex="-1">{{ step === 1 ? 'What do you grow?' : step === 2 ? 'Make it your own.' : 'Ready to get growing?' }}</h2>
        <p class="description">{{ step === 1 ? 'Choose the best fit. Poultry belongs with livestock.' : step === 2 ? 'These details are optional. Add what matters to you.' : 'Check your details before opening your farm dashboard.' }}</p>
        <form :aria-busy="busy" :aria-describedby="error ? 'setup-error' : undefined" @submit.prevent="submit">
          <div v-if="error" ref="errorBox" id="setup-error" role="alert" tabindex="-1" class="error">{{ error }}</div>
          <div v-if="step === 1">
            <fieldset><legend>Farming type <span>(required)</span></legend><div class="type-grid"><label v-for="type in types" :key="type.value" class="type-option" :class="{ selected: form.farmType === type.value }"><input v-model="form.farmType" type="radio" name="farmType" :value="type.value" required /><component :is="type.icon" :size="27" aria-hidden="true" /><strong>{{ type.label }}</strong><small>{{ type.detail }}</small></label></div></fieldset>
            <label class="field" for="farm-name">Farm name <span>(required)</span><input id="farm-name" v-model="form.farmName" maxlength="150" required pattern=".*\S.*" autocomplete="organization" placeholder="e.g. Green Valley Farm" /></label>
          </div>
          <div v-else-if="step === 2">
            <label class="field" for="enterprises">Main crops or animals <span>(optional)</span><input id="enterprises" v-model="form.mainEnterprises" maxlength="500" aria-describedby="enterprises-hint" placeholder="e.g. Maize, tomatoes, dairy cows" /><small id="enterprises-hint">A simple list is all you need.</small></label>
            <label class="field" for="location">Location <span>(optional)</span><input id="location" v-model="form.location" maxlength="200" autocomplete="address-level2" aria-describedby="location-hint" placeholder="Your town, region or country" /><small id="location-hint">Type it yourself. We never request your device location.</small></label>
            <label class="field" for="language">Preferred language <span>(optional)</span><input id="language" v-model="form.preferredLanguage" maxlength="80" aria-describedby="language-hint" placeholder="e.g. English" /><small id="language-hint">Saved to your profile. This does not change the app language.</small></label>
          </div>
          <dl v-else class="review"><div><dt>Farm name</dt><dd>{{ form.farmName }}</dd></div><div><dt>Farming type</dt><dd>{{ types.find(type => type.value === form.farmType)?.label }}</dd></div><div><dt>Main crops or animals</dt><dd>{{ form.mainEnterprises || 'Not added' }}</dd></div><div><dt>Location</dt><dd>{{ form.location || 'Not added' }}</dd></div><div><dt>Preferred language</dt><dd>{{ form.preferredLanguage || 'Not added' }}</dd></div></dl>
          <div class="actions"><button v-if="step > 1" type="button" class="back" :disabled="busy" @click="move(step - 1)"><ArrowLeft :size="17" aria-hidden="true" /> Back</button><button class="primary" type="submit" :disabled="busy"><span aria-live="polite">{{ busy ? 'Saving your farm…' : step === 3 ? 'Save & open my farm' : 'Continue' }}</span><ArrowRight v-if="!busy" :size="18" aria-hidden="true" /></button></div>
          <button v-if="step === 2" type="button" class="skip" @click="move(3)">Skip optional details for now</button>
        </form>
        <p class="footnote"><ShieldCheck :size="14" aria-hidden="true" /> A simpler day on the farm starts here.</p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.onboarding {
  --green: #066136;
  --yellow: #F9C23C;
  min-height: 100vh;
  padding: 28px clamp(20px, 5vw, 80px) 48px;
  background: #f5f7f5;
  color: #183b2c;
  font-family: inherit;
}
.onboarding *, .onboarding *::before, .onboarding *::after { box-sizing: border-box; }
button, input { font: inherit; }
button, a, input { -webkit-tap-highlight-color: transparent; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 20px; max-width: 1200px; margin: auto; }
.topbar > span { font-size: 12px; color: #5c7065; }
.brand { display: inline-flex; align-items: center; gap: 9px; color: var(--green); font-size: 25px; font-weight: 800; letter-spacing: -1px; text-decoration: none; }
.brand-dot { color: #b47b00; margin-left: -9px; }
.layout { display: grid; grid-template-columns: minmax(0, .95fr) minmax(0, 1.2fr); gap: clamp(36px, 6vw, 86px); align-items: center; max-width: 1160px; margin: 46px auto 0; }
.intro { padding: 24px 0; }
.eyebrow, .step-count { color: var(--green); font-size: 10px; font-weight: 800; letter-spacing: 1.7px; }
.eyebrow { display: flex; align-items: center; gap: 9px; }
.eyebrow > span { width: 8px; height: 8px; border-radius: 50%; background: var(--yellow); box-shadow: 0 0 0 4px #f9c23c25; flex-shrink: 0; }
.intro h1 { font-size: clamp(42px, 4.7vw, 66px); font-weight: 800; line-height: 1.08; letter-spacing: -3px; margin: 24px 0 20px; }
.intro h1 > span { color: var(--green); position: relative; display: inline-block; isolation: isolate; }
.intro h1 > span::after { content: ''; position: absolute; z-index: -1; height: 11px; bottom: 3px; left: 0; right: -5px; background: var(--yellow); border-radius: 5px; transform: rotate(-2deg); }
.intro > p { color: #52685b; font-size: 14px; line-height: 1.8; max-width: 370px; }
.garden { position: relative; height: 220px; max-width: 390px; margin: 28px 0 20px; overflow: hidden; border: 1px solid #d8e7da; border-radius: 24px; background: #e7f0e8; }
.garden-sun { position: absolute; top: 23px; right: 45px; color: #a76b00; fill: var(--yellow); }
.garden-cloud { position: absolute; width: 72px; height: 16px; top: 47px; left: 45px; border-radius: 30px; background: #fff9; }
.garden-cloud::before { content: ''; position: absolute; width: 30px; height: 30px; border-radius: 50%; bottom: 0; left: 16px; background: #ffffffb3; }
.garden-hill { position: absolute; width: 145%; height: 180px; border-radius: 50% 50% 0 0; }
.hill-back { background: #b6d2af; transform: rotate(-13deg); top: 104px; left: -90px; }
.hill-front { background: var(--green); transform: rotate(15deg); top: 157px; left: -22px; }
.garden-crops { position: absolute; display: flex; align-items: flex-end; gap: 8px; left: 30px; bottom: 50px; color: #066136; }
.garden-crops > :nth-child(2) { color: #8c6511; }
.garden-crops > :last-child { color: #154d2e; }
.garden-label { position: absolute; bottom: 16px; left: 24px; display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; color: white; }
.intro .privacy { display: flex; align-items: flex-start; gap: 9px; max-width: 360px; font-size: 11px; line-height: 1.7; }
.privacy svg { flex-shrink: 0; color: var(--green); margin-top: 1px; }
.card { padding: clamp(26px, 3vw, 40px); background: white; border: 1px solid #e0e8e1; border-radius: 24px; box-shadow: 0 16px 48px #143d2810; min-width: 0; }
.progress { display: grid; grid-template-columns: repeat(3, 1fr); list-style: none; padding: 0 0 25px; margin: 0 0 28px; border-bottom: 1px solid #e8eee9; }
.progress li { position: relative; display: flex; flex-direction: column; align-items: center; gap: 9px; font-size: 11px; font-weight: 600; color: #617269; }
.progress li::before { content: ''; position: absolute; top: 16px; height: 2px; background: #e5ebe6; width: 100%; left: -50%; }
.progress li:first-child::before { display: none; }
.progress li > span { z-index: 1; width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid #dce5de; border-radius: 50%; background: white; font-size: 12px; }
.progress li.active { color: var(--green); }
.progress li.active::before { background: var(--green); }
.progress li.active > span { background: var(--green); border-color: var(--green); color: white; }
.progress li.current > span { background: var(--yellow); color: #25422d; border-color: var(--yellow); box-shadow: 0 0 0 4px #f9c23c22; }
.step-count { margin: 0; font-size: 10px; }
h2 { font-size: clamp(24px, 2.5vw, 30px); font-weight: 800; line-height: 1.25; letter-spacing: -1px; margin: 10px 0; }
.description { color: #5b6d62; font-size: 12px; line-height: 1.8; margin: 0 0 25px; }
fieldset { border: 0; padding: 0; margin: 0 0 24px; min-width: 0; }
legend, .field { font-size: 12px; font-weight: 700; }
legend span, .field > span { color: #617369; font-size: 11px; font-weight: 400; }
.type-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
.type-option { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 10px; min-height: 145px; padding: 19px 12px 14px; border: 1px solid #dce5de; border-radius: 12px; background: #fff; color: var(--green); cursor: pointer; transition: border-color .15s, background .15s; }
.type-option:hover { border-color: var(--green); background: #f8fbf8; }
.type-option input { position: absolute; top: 12px; right: 10px; width: 15px; height: 15px; margin: 0; accent-color: var(--green); }
.type-option strong { font-size: 12px; line-height: 1.4; color: #203e2e; }
.type-option small { font-size: 10px; line-height: 1.6; color: #576d5f; }
.type-option.selected { border-color: var(--green); background: #eef6ef; box-shadow: inset 0 0 0 1px var(--green); }
.type-option:focus-within { outline: 3px solid var(--green); outline-offset: 3px; }
.field { display: block; margin: 20px 0; }
.field input { display: block; width: 100%; border: 1px solid #d4dfd7; border-radius: 10px; background: #fcfdfc; padding: 13px 14px; margin-top: 9px; color: #183b2c; font-size: 13px; font-weight: 400; min-height: 48px; }
.field input::placeholder { color: #6a7b70; opacity: 1; }
.field input:hover { border-color: #91ab9a; }
.field small { display: block; color: #617369; font-size: 10px; font-weight: 400; line-height: 1.7; margin-top: 7px; }
input:focus-visible, button:focus-visible, a:focus-visible, h2:focus-visible, .error:focus { outline: 3px solid var(--green); outline-offset: 4px; }
.actions { display: flex; align-items: center; gap: 16px; margin-top: 28px; }
.primary { margin-left: auto; display: flex; align-items: center; justify-content: center; gap: 14px; min-height: 48px; padding: 13px 22px; border: 1px solid var(--green); border-radius: 10px; background: var(--green); color: white; font-size: 12px; font-weight: 700; cursor: pointer; transition: background .15s, box-shadow .15s; }
.primary:hover:not(:disabled) { background: #044b29; box-shadow: 0 4px 12px #06613624; }
.actions > .primary:only-child { width: 100%; }
.back, .skip { border: 0; background: none; color: var(--green); font-size: 12px; cursor: pointer; min-height: 44px; padding: 10px; }
.back { display: inline-flex; align-items: center; gap: 6px; }
.skip { display: block; margin: 8px auto 0; font-size: 11px; text-decoration: underline; text-underline-offset: 4px; }
button:disabled { opacity: .65; cursor: wait; }
.footnote { display: flex; align-items: center; justify-content: center; gap: 7px; border-top: 1px solid #e8eee9; padding-top: 20px; margin: 24px 0 0; font-size: 10px; color: #617369; line-height: 1.6; }
.footnote svg { flex-shrink: 0; color: var(--green); }
.review { margin: 0; border: 1px solid #e0e8e1; border-radius: 12px; padding: 0 16px; background: #f8fbf8; }
.review > div { display: grid; grid-template-columns: 1fr 1.2fr; gap: 16px; padding: 15px 0; border-bottom: 1px solid #e0e8e1; }
.review > div:last-child { border-bottom: 0; }
.review dt { color: #617369; font-size: 11px; }
.review dd { margin: 0; font-size: 12px; font-weight: 600; overflow-wrap: anywhere; }
.error, .session-error { border: 1px solid #e7b9ad; border-left: 4px solid #a63520; padding: 14px; margin-bottom: 20px; background: #fff4ef; color: #8b2d1d; border-radius: 9px; font-size: 12px; line-height: 1.7; }
.session-error { max-width: 600px; margin: 60px auto; }
.session-error button { color: inherit; background: white; border: 1px solid currentColor; border-radius: 6px; padding: 8px 12px; margin: 8px; cursor: pointer; }
@media (max-width: 900px) {
  .layout { gap: 30px; grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); }
  .intro h1 { font-size: 46px; letter-spacing: -2px; }
  .card { padding: 26px; }
  .type-option { padding: 30px 10px 12px; }
}
@media (max-width: 720px) {
  .onboarding { padding: 22px 20px 36px; }
  .layout { grid-template-columns: 1fr; gap: 24px; max-width: 560px; margin-top: 32px; }
  .intro { padding: 0; }
  .intro h1 { font-size: 38px; letter-spacing: -1.8px; margin: 16px 0; }
  .intro h1 br { display: none; }
  .intro h1 > span { margin-left: 8px; }
  .intro > p { max-width: none; margin: 0; font-size: 13px; }
  .garden, .intro .privacy { display: none; }
  .card { padding: 28px; }
}
@media (max-width: 420px) {
  .onboarding { padding: 20px 14px 30px; }
  .topbar > span { display: none; }
  .brand { font-size: 23px; }
  .eyebrow { font-size: 9px; letter-spacing: 1.3px; }
  .intro h1 { font-size: 33px; }
  .card { border-radius: 18px; padding: 24px 18px; }
  .type-grid { gap: 8px; }
  .type-option strong { font-size: 11px; }
  .type-option small { font-size: 10px; }
  .progress { margin-bottom: 24px; }
  .progress li { font-size: 10px; }
  .primary { padding: 13px 15px; }
  .review > div { grid-template-columns: 1fr; gap: 5px; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; } }
</style>
