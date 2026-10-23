<script setup>
import { Menu, Sprout, X } from 'lucide-vue-next'

const menuOpen = ref(false)
const links = [
  { label: 'Home', href: '/#home' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'About', href: '/#about' },
  { label: 'Contact', href: '/#contact' },
]
</script>

<template>
  <header class="relative z-30 border-b border-[#066136]/10 bg-[#F7F4EF]">
    <div class="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-4 sm:px-6">
      <a href="/#home" aria-label="FarmBuddy home" class="flex shrink-0 items-center gap-2 text-xl font-extrabold tracking-tight text-[#066136]">
        <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#066136] text-[#F9C23C]">
          <Sprout :size="25" aria-hidden="true" />
        </span>
        FarmBuddy<span class="-ml-2 text-[#C69316]">.</span>
      </a>
      <nav aria-label="Main navigation" class="hidden items-center gap-6 lg:flex">
        <a v-for="link in links" :key="link.label" :href="link.href" class="text-sm font-semibold text-slate-600 transition hover:text-[#066136]">{{ link.label }}</a>
      </nav>
      <div class="hidden items-center gap-3 lg:flex">
        <NuxtLink to="/login" class="rounded-full border border-[#066136]/25 px-5 py-2.5 text-sm font-semibold text-[#066136] transition hover:bg-[#066136]/5">Login</NuxtLink>
        <NuxtLink to="/register" class="rounded-full bg-[#066136] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#084D2E]">Register</NuxtLink>
      </div>
      <button type="button" class="flex h-11 w-11 items-center justify-center rounded-xl text-[#066136] hover:bg-[#066136]/5 lg:hidden" :aria-expanded="menuOpen" aria-controls="mobile-navigation" :aria-label="menuOpen ? 'Close navigation' : 'Open navigation'" @click="menuOpen = !menuOpen">
        <component :is="menuOpen ? X : Menu" :size="24" aria-hidden="true" />
      </button>
    </div>
    <nav v-if="menuOpen" id="mobile-navigation" aria-label="Mobile navigation" class="border-t border-[#066136]/10 px-5 pb-5 pt-2 lg:hidden" @keydown.esc="menuOpen = false">
      <a v-for="link in links" :key="link.label" :href="link.href" class="block rounded-lg px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-[#066136]/5" @click="menuOpen = false">{{ link.label }}</a>
      <div class="mt-3 flex gap-3">
        <NuxtLink to="/login" class="flex-1 rounded-full border border-[#066136]/25 px-5 py-3 text-center text-sm font-semibold text-[#066136]" @click="menuOpen = false">Login</NuxtLink>
        <NuxtLink to="/register" class="flex-1 rounded-full bg-[#066136] px-5 py-3 text-center text-sm font-semibold text-white" @click="menuOpen = false">Register</NuxtLink>
      </div>
    </nav>
  </header>
</template>
