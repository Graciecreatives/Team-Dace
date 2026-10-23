<script setup>
import { Sprout, Camera, Mic, Bell, Users, BadgeCheck, ArrowUpRight, Check, Leaf, Plus, Home, ClipboardList, Pause, Play, Volume2 } from 'lucide-vue-next'
const paused = ref(false)
const screens = [
  { title: 'A little clarity. A healthier farm.', name: 'Photo diagnosis', icon: Camera, theme: 'mint', type: 'diagnosis' },
  { title: 'Your voice. Your farm assistant.', name: 'Voice notes', icon: Mic, theme: 'sand', type: 'voice' },
  { title: 'Every little detail, remembered.', name: 'Farm records', icon: ClipboardList, theme: 'pink', type: 'records' },
  { title: 'Right task. Right time.', name: 'Smart reminders', icon: Bell, theme: 'lilac', type: 'reminders' },
  { title: 'Good things grow together.', name: 'Farmer community', icon: Users, theme: 'sand', type: 'community' },
  { title: 'Your hard work has a story.', name: 'Farm passport', icon: BadgeCheck, theme: 'mint', type: 'passport' },
]
</script>

<template>
  <div class="preview-showcase mt-10 sm:mt-14" aria-label="FarmBuddy app concept previews">
    <div class="mx-auto mb-4 flex max-w-6xl items-center justify-between gap-4 px-5 sm:px-6">
      <p class="text-xs font-semibold uppercase tracking-widest text-[#066136]">A look inside FarmBuddy · Concept previews</p>
      <button type="button" class="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#066136]/20 px-3 py-2 text-xs font-semibold text-[#066136] hover:bg-[#066136]/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" :aria-pressed="paused" @click="paused = !paused">
        <component :is="paused ? Play : Pause" :size="14" aria-hidden="true" />{{ paused ? 'Play previews' : 'Pause previews' }}
      </button>
    </div>
    <div class="preview-viewport" :class="{ 'is-paused': paused }">
      <div class="preview-track">
        <div v-for="copy in 2" :key="copy" class="preview-group" :aria-hidden="copy === 2 ? 'true' : undefined" :inert="copy === 2 ? true : undefined">
          <article v-for="screen in screens" :key="screen.type" class="preview-card" :class="`theme-${screen.theme}`">
            <div class="preview-brand mb-3 flex items-center gap-1.5 text-[11px] font-extrabold tracking-tight"><Sprout :size="15" aria-hidden="true" />FarmBuddy</div>
            <h3 class="preview-headline max-w-[240px] text-[27px] font-extrabold leading-[1.15] tracking-tight">{{ screen.title }}</h3>
            <p class="preview-label mt-3 inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wider">{{ screen.name }}</p>
            <div class="preview-phone mt-6 text-[#273D30]">
              <div class="flex items-center justify-between px-4 pb-3 pt-2 text-[8px] font-bold"><span>9:41</span><span class="phone-notch" /><span>▮▮▮ ▰</span></div>
              <div class="px-4">
                <div class="flex items-center justify-between border-b border-[#066136]/10 pb-3"><span class="flex items-center gap-1 text-[11px] font-extrabold text-[#066136]"><Sprout :size="15" />FarmBuddy</span><span class="flex h-6 w-6 items-center justify-center rounded-full bg-[#F9C23C] text-[8px] font-bold">AM</span></div>
                <p class="mt-4 text-[8px] text-slate-500">Your farm, a little smarter</p>
                <h4 class="mt-1 text-sm font-bold">{{ screen.name }}</h4>

                <template v-if="screen.type === 'diagnosis'">
                  <div class="relative mt-3 flex h-28 items-center justify-center overflow-hidden rounded-xl bg-[#0C633C]">
                    <Leaf :size="78" :stroke-width="1.2" class="-rotate-12 fill-[#7CD74F] text-[#D3F4A7]" />
                    <span class="absolute inset-4 rounded-lg border border-white/80" /><span class="absolute bottom-2 right-2 rounded-full bg-white p-1.5 text-[#066136]"><Camera :size="13" /></span>
                  </div>
                  <div class="mt-3 rounded-xl border border-[#066136]/15 bg-[#EFF6EA] p-3"><p class="flex items-center gap-1 text-[10px] font-bold text-[#066136]"><Check :size="12" />Photo received</p><p class="mt-1 text-[9px] leading-relaxed">Let’s take a closer look at your crop.</p></div>
                  <div class="mt-3 rounded-lg bg-[#066136] py-2 text-center text-[9px] font-bold text-white">Answer a few questions</div>
                </template>
                <template v-else-if="screen.type === 'voice'">
                  <div class="mt-4 rounded-xl rounded-tl-none bg-[#F2F4ED] p-3 text-[10px] leading-relaxed">What happened on your farm today?</div>
                  <div class="mt-4 flex items-center gap-1 rounded-xl bg-[#066136] px-3 py-4 text-white"><Volume2 :size="16" /><span v-for="n in 22" :key="n" class="w-0.5 rounded bg-[#F9C23C]" :style="{ height: `${8 + (n * 7 % 23)}px` }" /><span class="ml-auto text-[8px]">0:12</span></div>
                  <div class="mt-4 rounded-xl bg-[#F2F4ED] p-3 text-[9px] leading-relaxed">Your note is ready. Would you like to add it to your farm records?</div>
                  <div class="mx-auto mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#F9C23C] text-[#066136]"><Mic :size="24" /></div>
                </template>
                <template v-else-if="screen.type === 'records'">
                  <div class="mt-3 rounded-xl bg-[#066136] p-3 text-white"><p class="text-[8px] text-white/70">This week’s overview</p><p class="mt-1 text-lg font-bold">₦42,500 <span class="text-[8px] font-normal">income</span></p><div class="mt-3 flex h-12 items-end gap-2"><span v-for="(height, i) in [35, 60, 42, 78, 65, 90, 100]" :key="i" class="flex-1 rounded-t bg-[#F9C23C]" :style="{ height: `${height}%` }" /></div></div>
                  <p class="mt-4 text-[10px] font-bold">Recent activity</p>
                  <div v-for="(row, i) in ['Egg sales|+ ₦12,000', 'Poultry feed|− ₦8,500', 'Tomato sales|+ ₦18,000']" :key="row" class="flex items-center justify-between border-b border-slate-100 py-3 text-[9px]"><span>{{ row.split('|')[0] }}</span><span :class="i === 1 ? 'text-slate-500' : 'font-bold text-[#066136]'">{{ row.split('|')[1] }}</span></div>
                </template>
                <template v-else-if="screen.type === 'reminders'">
                  <div class="mt-3 flex justify-between rounded-xl bg-[#F0EDF8] px-2 py-3"><div v-for="(day, i) in ['M', 'T', 'W', 'T', 'F']" :key="i" class="rounded-lg px-2 py-1 text-center text-[8px]" :class="i === 2 ? 'bg-[#066136] text-white' : ''">{{ day }}<p class="mt-1 text-xs font-bold">{{ 12 + i }}</p></div></div>
                  <p class="mt-4 text-[10px] font-bold">Coming up on your farm</p>
                  <div v-for="(task, i) in ['Water the seedlings', 'Poultry vaccination', 'Record this week’s harvest']" :key="task" class="mt-3 flex items-center gap-2 rounded-xl border border-slate-100 p-3"><span class="rounded-lg bg-[#F9C23C]/20 p-2 text-[#066136]"><Bell :size="13" /></span><div><p class="text-[9px] font-semibold">{{ task }}</p><p class="mt-1 text-[8px] text-slate-500">{{ i === 0 ? 'Today · 7:00 AM' : 'Upcoming' }}</p></div></div>
                </template>
                <template v-else-if="screen.type === 'community'">
                  <div class="mt-3 flex gap-2 text-[8px]"><span class="rounded-full bg-[#066136] px-3 py-1.5 text-white">For you</span><span class="rounded-full bg-[#F1F4EC] px-3 py-1.5">Nearby farmers</span></div>
                  <div class="mt-3 rounded-xl border border-slate-100 p-3"><div class="flex items-center gap-2"><span class="rounded-full bg-[#E8EEDB] p-2 text-[#066136]"><Users :size="14" /></span><div><p class="text-[9px] font-bold">Amina’s Farm</p><p class="text-[8px] text-slate-500">Community member</p></div></div><p class="mt-3 text-[9px] leading-relaxed">First harvest of the season! What’s growing on your farm?</p><div class="mt-3 flex h-20 items-end justify-center gap-3 rounded-lg bg-[#E5EEDB] pb-2 text-[#40834C]"><Sprout :size="46" /><Sprout :size="59" /><Sprout :size="38" /></div><p class="mt-2 text-[8px] text-slate-500">24 likes · 8 replies</p></div>
                  <div class="mt-3 rounded-lg bg-[#F9C23C] py-2 text-center text-[9px] font-bold">Share your farm story</div>
                </template>
                <template v-else>
                  <div class="mt-3 rounded-xl border border-[#066136]/15 bg-[#F0F5E8] p-4 text-center"><BadgeCheck class="mx-auto text-[#066136]" :size="38" /><p class="mt-2 text-sm font-bold text-[#066136]">My Farm Passport</p><p class="mt-1 text-[8px]">A growing record of your hard work</p></div>
                  <div v-for="item in ['Farm profile', 'Crop & animal records', 'Activity history']" :key="item" class="mt-3 flex items-center justify-between border-b border-slate-100 pb-3 text-[9px]"><span>{{ item }}</span><Check :size="13" class="text-[#066136]" /></div>
                  <div class="mt-4 rounded-lg bg-[#066136] py-2 text-center text-[9px] font-bold text-white">View farm record</div>
                </template>
              </div>
              <div class="absolute inset-x-0 bottom-0 flex justify-around border-t border-slate-100 bg-white px-4 py-3 text-[#066136]"><Home :size="15" /><Camera :size="15" /><Plus :size="15" /><ClipboardList :size="15" /><Users :size="15" /></div>
            </div>
            <div class="preview-caption mt-5 flex items-center gap-2 text-[10px] font-semibold"><component :is="screen.icon" :size="14" />Made for your everyday farm life <ArrowUpRight :size="13" class="ml-auto" /></div>
          </article>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-viewport { overflow: hidden; padding: 12px 0 28px; mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent); }
.preview-track { display: flex; width: max-content; animation: preview-scroll 65s linear infinite; }
.preview-group { display: flex; flex-shrink: 0; gap: 24px; padding-right: 24px; }
.preview-card { position: relative; width: 290px; flex-shrink: 0; border: 1px solid rgba(255,255,255,.15); border-radius: 30px; padding: 25px 25px 20px; overflow: hidden; box-shadow: 0 10px 24px rgba(10,35,24,.12); }
.preview-brand { color: #FFE39C; }
.preview-headline { min-height: 94px; color: #fff; text-wrap: balance; }
.preview-label { color: #fff; border-color: rgba(255,255,255,.28); background: rgba(255,255,255,.08); }
.preview-caption { color: #fff; }
.theme-mint { background: radial-gradient(ellipse at 100% 100%, #188D59 0%, transparent 65%), #03482F; }
.theme-sand { background: radial-gradient(ellipse at 100% 100%, #B85A17 0%, transparent 65%), #713515; }
.theme-pink { background: radial-gradient(ellipse at 100% 100%, #A93F64 0%, transparent 65%), #54243C; }
.theme-lilac { background: radial-gradient(ellipse at 100% 100%, #7160B5 0%, transparent 65%), #352961; }
.preview-phone { position: relative; height: 540px; overflow: hidden; border: 5px solid #14271D; border-bottom-width: 7px; border-radius: 27px 27px 20px 20px; background: #fff; box-shadow: 0 22px 32px rgba(0,0,0,.3), 0 0 0 1px rgba(255,255,255,.25); }
.phone-notch { width: 62px; height: 11px; margin-top: -8px; border-radius: 0 0 9px 9px; background: #203C2C; }
.is-paused .preview-track, .preview-viewport:hover .preview-track { animation-play-state: paused; }
@keyframes preview-scroll { to { transform: translateX(-50%); } }
@media (min-width: 640px) { .preview-card { width: 320px; padding: 28px 30px 22px; } .preview-phone { height: 510px; } .preview-group { gap: 32px; padding-right: 32px; } }
@media (prefers-reduced-motion: reduce) { .preview-viewport { overflow-x: auto; mask-image: none; } .preview-track { animation: none; } .preview-group[aria-hidden='true'] { display: none; } }
</style>
