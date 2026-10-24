<script setup>
import { ArrowUpRight, Sprout, Users, Stethoscope, Mic, Camera, Leaf, Check, TrendingUp } from 'lucide-vue-next'
</script>

<template>
  <section aria-labelledby="grow-heading" class="relative isolate overflow-hidden bg-[#F7F4EF] px-5 py-16 sm:px-6 sm:py-24">
    <div class="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(51,47,43,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(51,47,43,0.08)_1px,transparent_1px)] [background-size:48px_48px]" aria-hidden="true" />
    <div class="mx-auto max-w-6xl">
      <div class="mb-10 max-w-2xl">
        <p class="text-xs font-bold uppercase tracking-[0.2em] text-[#066136]">Better farming, together</p>
        <h2 id="grow-heading" class="mt-3 text-3xl font-bold tracking-tight text-[#066136] sm:text-4xl">Your next chapter starts here.</h2>
        <p class="mt-4 leading-relaxed text-slate-600">Connected operations. A stronger community. Manage your farm and grow together with FarmBuddy.</p>
      </div>
      <div class="grid gap-5 lg:grid-cols-3">
        <article class="relative flex flex-col overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#045B34] to-[#20864E] p-7 text-white shadow-xl shadow-[#066136]/10 sm:p-8 lg:row-span-2">
          <span class="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10"><Sprout :size="23" aria-hidden="true" /></span>
          <h3 class="mt-5 text-3xl font-bold tracking-tight">Grow with confidence</h3>
          <p class="mt-3 max-w-xs text-sm leading-7 text-white/85">From crop planning to livestock care, keep records, bookkeeping, inventory, and team tasks together with timely reminders.</p>
          <div class="relative mx-auto my-7 flex h-48 w-full max-w-[240px] items-center justify-center" aria-hidden="true">
            <span class="absolute h-44 w-44 rounded-full bg-[#F9C23C]/10" />
            <Leaf class="absolute left-1 top-9 -rotate-45 text-[#A9D66F]" :size="48" />
            <Sprout class="absolute right-0 top-3 rotate-12 text-[#B4DB7A]" :size="60" />
            <div class="relative w-28 -rotate-6 rounded-[1.4rem] border-[5px] border-[#123B2A] bg-[#E8F3D5] px-3 pb-4 pt-6 shadow-2xl">
              <div class="absolute left-1/2 top-1 h-2 w-10 -translate-x-1/2 rounded-full bg-[#123B2A]" />
              <Sprout class="text-[#066136]" :size="25" />
              <div class="mt-3 flex h-14 items-end gap-1.5"><span v-for="height in [35, 55, 75, 100]" :key="height" :style="{ height: `${height}%` }" class="flex-1 rounded-t bg-[#24864F]" /></div>
              <TrendingUp class="absolute right-2 top-7 text-[#66A333]" :size="40" />
              <div class="mt-3 h-1.5 w-14 rounded bg-[#066136]/20" />
            </div>
            <span class="absolute bottom-5 right-2 rounded-full bg-[#F9C23C] p-2 text-[#066136]"><Check :size="23" /></span>
          </div>
          <NuxtLink to="/register" class="mt-auto inline-flex w-fit items-center gap-3 border-b border-white/40 pb-1 text-sm font-bold transition hover:text-[#F9C23C]">Start your farm journey <ArrowUpRight :size="17" aria-hidden="true" /></NuxtLink>
        </article>

        <article class="flex flex-col justify-between gap-6 rounded-[2rem] border border-[#EAD9B7]/50 bg-[#FFF0D9] p-7 sm:flex-row sm:items-center sm:p-8 lg:col-span-2">
          <div class="max-w-sm">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F9C23C]/25 text-[#916200]"><Users :size="21" aria-hidden="true" /></span>
            <h3 class="mt-4 text-2xl font-bold tracking-tight text-[#302C24]">Stronger together</h3>
            <p class="mt-3 text-sm leading-6 text-[#655C4C]">Connect with farmers, share what works, and explore the marketplace for farm supplies and produce. You don’t have to grow alone.</p>
            <NuxtLink to="/register" class="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#066136] hover:underline">Join the community <ArrowUpRight :size="16" aria-hidden="true" /></NuxtLink>
          </div>
          <div class="flex h-36 w-full shrink-0 items-center justify-center rounded-3xl bg-[#F9C23C]/15 sm:w-36" aria-hidden="true">
            <div class="relative flex h-24 w-24 items-center justify-center rounded-full border border-[#066136]/15 bg-[#E1EACD] text-[#066136]">
              <Users :size="52" :stroke-width="1.5" />
              <span class="absolute -right-2 -top-2 rounded-full bg-[#066136] p-2 text-[#F9C23C]"><Sprout :size="22" /></span>
            </div>
          </div>
        </article>

        <article class="flex flex-col justify-between gap-6 rounded-[2rem] bg-[#292D29] p-7 text-white sm:flex-row sm:items-center sm:p-8 lg:col-span-2">
          <div class="max-w-sm">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10"><Stethoscope :size="21" aria-hidden="true" /></span>
            <h3 class="mt-4 text-2xl font-bold tracking-tight">Care for every crop & animal</h3>
            <p class="mt-3 text-sm leading-6 text-white/65">Snap a photo or send a voice note for AI-assisted guidance. For health concerns, consult a qualified vet or agronomist.</p>
            <a href="#about" class="mt-5 inline-flex items-center gap-2 text-sm font-bold text-white hover:text-[#F9C23C]">Explore FarmBuddy <ArrowUpRight :size="16" aria-hidden="true" /></a>
          </div>
          <div class="relative flex h-36 w-full shrink-0 items-center justify-center sm:w-36" aria-hidden="true">
            <div class="flex h-24 w-24 items-center justify-center rounded-3xl border border-[#F9C23C]/25 bg-[#066136]/40 text-[#F9C23C]"><Leaf :size="49" :stroke-width="1.5" /></div>
            <span class="absolute left-1 top-2 rounded-2xl bg-[#434A40] p-3 text-[#D9EAC7]"><Camera :size="22" /></span>
            <span class="absolute bottom-0 right-1 rounded-2xl bg-[#F9C23C] p-3 text-[#066136]"><Mic :size="22" /></span>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
