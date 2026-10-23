<script setup>
import { Menu, Sprout, X } from 'lucide-vue-next'

const menuOpen = ref(false)
const isScrolled = ref(false)
const headerSlot = ref(null)
let scrollThreshold = 40

function updateScroll() {
  isScrolled.value = window.scrollY > scrollThreshold
}

function measureHeader() {
  if (headerSlot.value) {
    scrollThreshold = headerSlot.value.getBoundingClientRect().top + window.scrollY
  }
  updateScroll()
}

onMounted(() => {
  measureHeader()
  window.addEventListener('scroll', updateScroll, { passive: true })
  window.addEventListener('resize', measureHeader)
})
onUnmounted(() => {
  window.removeEventListener('scroll', updateScroll)
  window.removeEventListener('resize', measureHeader)
})
async function navigateSection(event, href) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const target = document.getElementById(href.split('#')[1])
  if (!target || window.location.pathname !== '/') return
  event.preventDefault()
  menuOpen.value = false
  await nextTick()
  window.history.pushState(null, '', href)
  target.scrollIntoView({
    behavior: document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    block: 'start',
  })
}

const links = [
  { label: 'Home', href: '/#home' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'About', href: '/#about' },
  { label: 'Contact', href: '/#contact' },
]
</script>

<template>
  <div ref="headerSlot" :class="isScrolled ? 'h-[76px] lg:h-[72px]' : ''">
  <Teleport to="body" :disabled="!isScrolled">
  <header
    :class="isScrolled
      ? 'fixed inset-x-3 top-3 z-50 mx-auto max-w-6xl rounded-[2rem] border border-[#066136]/10 bg-[#F7F4EF]/90 shadow-[0_8px_32px_rgba(6,61,36,0.12)] backdrop-blur-xl sm:inset-x-6 sm:top-4'
      : 'relative z-30 bg-transparent'"
    class="transition-[background-color,box-shadow,border-radius] duration-300 motion-reduce:transition-none"
  >
    <div class="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-4 sm:px-6">
      <a href="/#home" aria-label="FarmBuddy home" class="flex shrink-0 items-center gap-2 text-xl font-extrabold tracking-tight text-[#066136]">
        <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#066136] text-[#F9C23C]">
          <Sprout :size="25" aria-hidden="true" />
        </span>
        FarmBuddy<span class="-ml-2 text-[#C69316]">.</span>
      </a>
      <nav aria-label="Main navigation" class="hidden items-center gap-6 lg:flex">
        <a v-for="link in links" :key="link.label" :href="link.href" @click="navigateSection($event, link.href)" class="text-sm font-semibold text-slate-600 transition hover:text-[#066136]">{{ link.label }}</a>
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
      <a v-for="link in links" :key="link.label" :href="link.href" class="block rounded-lg px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-[#066136]/5" @click="navigateSection($event, link.href)">{{ link.label }}</a>
      <div class="mt-3 flex gap-3">
        <NuxtLink to="/login" class="flex-1 rounded-full border border-[#066136]/25 px-5 py-3 text-center text-sm font-semibold text-[#066136]" @click="menuOpen = false">Login</NuxtLink>
        <NuxtLink to="/register" class="flex-1 rounded-full bg-[#066136] px-5 py-3 text-center text-sm font-semibold text-white" @click="menuOpen = false">Register</NuxtLink>
      </div>
    </nav>
  </header>
  </Teleport>
  </div>
</template>
