<script setup>
import { Sprout, UserRound, Camera, MessagesSquare, ClipboardCheck, Check, Mic, ArrowRight, Leaf } from 'lucide-vue-next'
const activeStep = ref(0)
const steps = [
  { title: 'Tell us about your farm', description: 'Start with your crops and animals. A little context helps FarmBuddy understand your farm and give you more relevant support.', icon: UserRound, label: 'Your farm comes first', detail: 'One place for your crops, animals, and daily activities.', items: ['Your crops', 'Your animals', 'Your farm profile'] },
  { title: 'Show it. Say it. Ask it.', description: 'Snap a photo of a crop or animal, send a voice note, or ask a question. Share what’s happening in the way that feels easiest to you.', icon: Camera, label: 'Farm help, your way', detail: 'A photo, a voice note, or a simple question is all it takes.', items: ['Photo diagnosis', 'Voice notes', 'Simple questions'] },
  { title: 'Get guidance that fits', description: 'Answer follow-up questions to give the AI more context for suggested next steps. AI guidance is not a confirmed diagnosis or a substitute for a qualified professional.', icon: MessagesSquare, label: 'Clarity for your next step', detail: 'More farm context. AI-assisted guidance. Your decisions.', items: ['Smart follow-up questions', 'Tailored guidance', 'AI support'] },
  { title: 'Keep your farm moving', description: 'Keep crop and livestock records, track bookkeeping and inventory, and coordinate your team. Set reminders and explore your farming community and marketplace.', icon: ClipboardCheck, label: 'Good habits. Stronger farms.', detail: 'Turn everyday farm activities into a record you can build on.', items: ['Farm records', 'Timely reminders', 'Farmer community'] },
]
const current = computed(() => steps[activeStep.value])
</script>

<template>
  <section id="how-it-works" aria-labelledby="how-heading" class="relative isolate scroll-mt-28 overflow-hidden bg-[#F7F4EF] px-5 py-16 sm:px-6 sm:py-24">
    <div class="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(51,47,43,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(51,47,43,0.08)_1px,transparent_1px)] [background-size:48px_48px]" aria-hidden="true" />
    <div class="mx-auto max-w-6xl">
      <div class="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
        <p class="text-xs font-bold uppercase tracking-[0.18em] text-[#066136]">From daily activities to connected farm management</p>
        <h2 id="how-heading" class="mt-4 text-3xl font-bold tracking-tight text-[#193D2B] sm:text-4xl lg:text-5xl">How <span class="text-[#066136]">FarmBuddy</span> works</h2>
        <p class="mt-5 leading-relaxed text-slate-600">Real farm life isn’t complicated to explain. Getting support shouldn’t be either. Start with these four simple steps.</p>
      </div>
      <div class="grid items-start gap-7 lg:grid-cols-2 lg:gap-12">
        <div id="how-step-preview" role="region" aria-label="Selected step preview" class="relative overflow-hidden rounded-[2rem] border border-[#066136]/10 bg-[#064B32] p-7 text-white shadow-xl shadow-[#064B32]/10 sm:p-10 lg:sticky lg:top-28">
          <div class="flex items-center justify-between gap-4 text-xs font-semibold"><span class="flex items-center gap-2 text-[#F9C23C]"><Sprout :size="20" aria-hidden="true" />FarmBuddy</span><span class="rounded-full border border-white/20 px-3 py-1.5 text-white/80">Step 0{{ activeStep + 1 }} / 04</span></div>
          <div class="relative my-7 flex h-40 items-center justify-center sm:my-10 sm:h-48" aria-hidden="true">
            <div class="absolute h-44 w-44 rounded-full border border-white/10 shadow-[0_0_0_24px_rgba(255,255,255,0.025),0_0_0_48px_rgba(255,255,255,0.015)]" />
            <div class="relative flex h-28 w-28 -rotate-6 items-center justify-center rounded-[1.8rem] border border-white/15 bg-[#19704D] text-[#F9C23C] shadow-2xl"><component :is="current.icon" :size="57" :stroke-width="1.4" /></div>
            <span class="absolute right-[18%] top-3 rounded-2xl bg-[#F9C23C] p-3 text-[#064B32]"><component :is="activeStep === 1 ? Mic : Leaf" :size="23" /></span>
            <span class="absolute bottom-0 left-[20%] rounded-xl border border-white/20 bg-[#226C4F] p-2.5 text-[#D4ECBF]"><Check :size="20" /></span>
          </div>
          <div aria-live="polite" aria-atomic="true">
            <h3 class="text-2xl font-bold tracking-tight sm:text-3xl">{{ current.label }}</h3>
            <p class="mt-3 min-h-[48px] text-sm leading-6 text-[#D0E2D5]">{{ current.detail }}</p>
            <div class="mt-6 flex flex-wrap gap-2"><span v-for="item in current.items" :key="item" class="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-medium text-white/90">{{ item }}</span></div>
          </div>
          <div class="mt-8 flex gap-2" aria-hidden="true"><span v-for="(_, index) in steps" :key="index" class="h-1 flex-1 rounded-full" :class="activeStep === index ? 'bg-[#F9C23C]' : 'bg-white/15'" /></div>
        </div>
        <div>
          <ol class="space-y-3">
            <li v-for="(step, index) in steps" :key="step.title">
              <button type="button" :aria-pressed="activeStep === index" aria-controls="how-step-preview" class="flex w-full items-start gap-4 rounded-3xl border p-5 text-left transition-[background-color,border-color,box-shadow] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#066136] motion-reduce:transition-none sm:gap-5 sm:p-6" :class="activeStep === index ? 'border-[#066136]/35 bg-white shadow-[0_8px_24px_rgba(6,75,48,0.08)]' : 'border-[#066136]/10 bg-white/55 hover:border-[#066136]/25 hover:bg-white'" @click="activeStep = index">
                <span class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold" :class="activeStep === index ? 'bg-[#066136] text-[#F9C23C]' : 'bg-[#E8EDDF] text-[#57715C]'">0{{ index + 1 }}</span>
                <span><span class="block text-base font-bold tracking-tight text-[#193D2B] sm:text-lg">{{ step.title }}</span><span class="mt-2 block text-sm leading-6 text-slate-600">{{ step.description }}</span></span>
              </button>
            </li>
          </ol>
          <p class="mt-5 text-center text-xs text-[#657661]">Select a step to explore the FarmBuddy journey.</p>
        </div>
      </div>
      <div class="mt-10 text-center"><NuxtLink to="/register" class="inline-flex items-center gap-3 rounded-full bg-[#066136] px-7 py-3.5 text-sm font-bold text-white transition hover:bg-[#084D2E]">Start your farm journey <ArrowRight :size="17" aria-hidden="true" /></NuxtLink></div>
    </div>
  </section>
</template>
