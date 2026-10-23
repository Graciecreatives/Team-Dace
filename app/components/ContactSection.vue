<script setup>
import { ArrowUpRight, Copy, MessageCircle, Sprout, Users, LifeBuoy } from 'lucide-vue-next'
const name = ref('')
const email = ref('')
const topic = ref('General question')
const message = ref('')
const status = ref('')
const manualCopy = ref(false)
const preparedMessage = ref('')
const busy = ref(false)
async function copyMessage() {
  busy.value = true
  status.value = ''
  manualCopy.value = false
  preparedMessage.value = `FarmBuddy enquiry: ${topic.value}\n\nFrom: ${name.value.trim()}\nEmail: ${email.value.trim()}\n\n${message.value.trim()}`
  try {
    await navigator.clipboard.writeText(preparedMessage.value)
    status.value = 'Message copied. It has not been sent. Keep it ready for when our contact channels open.'
  } catch {
    manualCopy.value = true
    status.value = 'Automatic copying is unavailable. Select and copy your prepared message below. It has not been sent.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section id="contact" aria-labelledby="contact-heading" class="scroll-mt-28 bg-white px-5 py-16 sm:px-6 sm:py-24">
    <div class="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:gap-20">
      <div>
        <p class="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#066136]"><span class="h-2 w-2 rounded-full bg-[#F9C23C]" />Let’s grow a conversation</p>
        <h2 id="contact-heading" class="mt-5 text-4xl font-bold leading-[1.15] tracking-tight text-[#193D2B] sm:text-5xl">Good farming starts<br>with <span class="text-[#066136]">a conversation.</span></h2>
        <p class="mt-5 max-w-md text-base leading-7 text-slate-600">Have a question, an idea, or a way we can grow together? There’s a place for your voice at FarmBuddy.</p>
        <div class="mt-9 space-y-6">
          <div v-for="item in [
            { icon: LifeBuoy, title: 'Questions about FarmBuddy', text: 'Learn more about farm guidance, records, and reminders.' },
            { icon: Users, title: 'Partnerships & community', text: 'For cooperatives, agricultural experts, and people building a better farming future.' },
            { icon: MessageCircle, title: 'Ideas & feedback', text: 'Tell us what would make FarmBuddy more useful on your farm.' },
          ]" :key="item.title" class="flex items-start gap-4">
            <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EEF4E9] text-[#066136]"><component :is="item.icon" :size="21" aria-hidden="true" /></span>
            <div><h3 class="text-sm font-bold text-[#193D2B]">{{ item.title }}</h3><p class="mt-1 max-w-sm text-sm leading-6 text-slate-500">{{ item.text }}</p></div>
          </div>
        </div>
        <div class="mt-9 flex items-start gap-3 rounded-2xl border border-[#E8DFC5] bg-[#FFFAEE] p-4 text-sm leading-6 text-[#74613B]"><Sprout class="mt-1 shrink-0" :size="19" aria-hidden="true" /><p>Our direct contact channels are coming soon. In the meantime, prepare a message to keep or share later.</p></div>
      </div>
      <form class="rounded-[2rem] border border-[#DDE5D9] bg-[#F7F8F3] p-6 sm:p-8" @submit.prevent="copyMessage">
        <h3 class="text-2xl font-bold tracking-tight text-[#193D2B]">What’s on your mind?</h3>
        <p class="mt-2 text-sm leading-6 text-slate-500">Prepare your message here. No information is submitted or sent.</p>
        <div class="mt-7 grid gap-5 sm:grid-cols-2">
          <div><label for="contact-name" class="contact-label">Your name</label><input id="contact-name" v-model="name" name="name" autocomplete="name" required maxlength="120" placeholder="Your name" class="contact-input"></div>
          <div><label for="contact-email" class="contact-label">Email address</label><input id="contact-email" v-model="email" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com" class="contact-input"></div>
        </div>
        <div class="mt-5"><label for="contact-topic" class="contact-label">I’d like to talk about</label><select id="contact-topic" v-model="topic" name="topic" class="contact-input"><option>General question</option><option>Using FarmBuddy</option><option>Partnerships & community</option><option>Ideas & feedback</option></select></div>
        <div class="mt-5"><label for="contact-message" class="contact-label">Your message</label><textarea id="contact-message" v-model="message" name="message" required maxlength="5000" rows="5" placeholder="Tell us a little about what you have in mind…" class="contact-input resize-y" /></div>
        <button type="submit" :disabled="busy" class="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-full bg-[#066136] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-[#084D2E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#066136] disabled:opacity-60"><Copy :size="17" aria-hidden="true" />{{ busy ? 'Preparing…' : 'Copy your message' }}<ArrowUpRight :size="16" aria-hidden="true" /></button>
        <p class="mt-4 text-xs leading-5 text-slate-500">This copies a draft to your clipboard, not to our inbox. Please don’t include passwords, payment details, or sensitive farm information.</p>
        <p v-if="status" role="status" class="mt-4 rounded-xl border border-[#066136]/15 bg-white p-3 text-sm leading-6 text-[#066136]">{{ status }}</p>
        <div v-if="manualCopy" class="mt-4"><label for="prepared-message" class="contact-label">Your prepared message</label><textarea id="prepared-message" :value="preparedMessage" readonly rows="7" class="contact-input" @focus="$event.target.select()" /></div>
      </form>
    </div>
  </section>
</template>

<style scoped>
.contact-label { display: block; margin-bottom: 8px; font-size: 12px; font-weight: 700; color: #294A35; }
.contact-input { display: block; width: 100%; min-width: 0; border: 1px solid #D8E0D3; border-radius: 12px; background: white; padding: 12px 14px; font-size: 14px; color: #193D2B; transition: border-color .2s, box-shadow .2s; }
.contact-input:focus { outline: none; border-color: #066136; box-shadow: 0 0 0 3px #06613615; }
.contact-input::placeholder { color: #829080; }
</style>
