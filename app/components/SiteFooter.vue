<script setup>
import { ArrowUp, ArrowUpRight, Sprout } from 'lucide-vue-next'
const year = new Date().getFullYear()
const navigation = [
  { label: 'Home', href: '/#home' },
  { label: 'About FarmBuddy', href: '/#about' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Contact', href: '/#contact' },
]
</script>

<template>
  <footer class="overflow-hidden bg-[#073D2B] px-5 pb-7 pt-12 text-white sm:px-6 sm:pt-16">
    <div class="mx-auto max-w-6xl">
      <div class="flex flex-col justify-between gap-6 border-b border-white/15 pb-10 sm:flex-row sm:items-center">
        <div><p class="text-xs font-bold uppercase tracking-[0.16em] text-[#F9C23C]">Your farm. Your future. Your buddy.</p><h2 class="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Let’s grow something good.</h2></div>
        <a href="/#how-it-works" class="inline-flex w-fit shrink-0 items-center gap-3 rounded-full bg-[#F9C23C] px-6 py-3.5 text-sm font-bold text-[#073D2B] transition hover:bg-[#FFCF59] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F9C23C]">Explore FarmBuddy <ArrowUpRight :size="18" aria-hidden="true" /></a>
      </div>
      <div class="grid gap-10 py-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1.2fr] lg:gap-16">
        <div>
          <a href="/#home" aria-label="FarmBuddy home" class="inline-flex items-center gap-2.5 text-2xl font-extrabold tracking-tight"><span class="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-[#F9C23C]"><Sprout :size="25" aria-hidden="true" /></span>FarmBuddy<span class="-ml-2 text-[#F9C23C]">.</span></a>
          <p class="mt-5 max-w-sm text-sm leading-7 text-[#BBD1C4]">Your everyday farming companion. Clear guidance, simple records, and a community that grows with you.</p>
          <p class="mt-4 flex items-center gap-2 text-xs font-medium text-[#F1D991]"><Sprout :size="15" aria-hidden="true" />For every crop. For every animal.</p>
        </div>
        <nav aria-label="Footer navigation"><h3 class="text-xs font-bold uppercase tracking-[0.16em] text-white/60">Discover</h3><ul class="mt-5 space-y-3"><li v-for="link in navigation" :key="link.href"><a :href="link.href" class="text-sm text-[#D3E2D9] transition hover:text-[#F9C23C]">{{ link.label }}</a></li></ul></nav>
        <div><h3 class="text-xs font-bold uppercase tracking-[0.16em] text-white/60">A helping hand, not a replacement</h3><p class="mt-5 text-sm leading-7 text-[#BBD1C4]">FarmBuddy supports everyday farm decisions. For urgent crop or animal health concerns, speak with a qualified vet or agronomist.</p><a href="/#contact" class="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#F9C23C]">Let’s talk <ArrowUpRight :size="15" aria-hidden="true" /></a></div>
      </div>
      <div class="flex flex-col justify-between gap-4 border-t border-white/15 pt-6 text-xs text-[#AFC6B8] sm:flex-row sm:items-center"><p>© {{ year }} FarmBuddy. All rights reserved.</p><a href="/#home" class="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-white/80 transition hover:border-[#F9C23C] hover:text-[#F9C23C]">Back to top <ArrowUp :size="14" aria-hidden="true" /></a></div>
    </div>
  </footer>
</template>
