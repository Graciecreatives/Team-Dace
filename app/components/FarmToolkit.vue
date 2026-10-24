<script setup>
import { Leaf, ScanLine, Check, Sprout } from 'lucide-vue-next'
defineProps({ features: { type: Array, required: true } })
const accents = ['green', 'amber', 'violet', 'blue', 'amber', 'green', 'coral', 'violet']
</script>

<template>
  <section aria-labelledby="tools-title" class="tools-section mx-auto mt-12 max-w-6xl px-5 sm:mt-16 sm:px-6">
    <div class="tools-heading">
      <div>
        <p class="tools-eyebrow"><span /> YOUR EVERYDAY FARM TOOLKIT</p>
        <h2 id="tools-title">Whole-farm support.<br><span>For everyday management.</span></h2>
      </div>
      <p class="tools-intro">Manage crop and livestock activities, records, bookkeeping, inventory, and team tasks, with AI support close at hand.</p>
    </div>
    <div class="tools-grid">
      <article v-for="(feature, index) in features" :key="feature.title" class="tool-card" :class="[index === 0 ? 'tool-spotlight' : '', `accent-${accents[index]}`]">
        <div class="tool-copy">
          <span class="tool-icon"><component :is="feature.icon" :size="24" :stroke-width="1.8" aria-hidden="true" /></span>
          <p v-if="index === 0" class="spotlight-label">A CLEARER PICTURE OF FARM HEALTH</p>
          <h3>{{ feature.title }}</h3>
          <p class="tool-description">{{ feature.desc }}</p>
          <span v-if="index === 0" class="spotlight-note"><Check :size="14" aria-hidden="true" /> Guidance tailored to your farm</span>
        </div>
        <div v-if="index === 0" class="diagnosis-art" aria-hidden="true">
          <div class="scan-orbit" />
          <div class="scan-frame"><Leaf :size="93" :stroke-width="1.2" class="scan-leaf" /><ScanLine :size="139" :stroke-width=".7" class="scan-lines" /></div>
          <div class="scan-badge"><span><Sprout :size="17" /></span><div>Crop health<p>One photo. A clearer next step.</p></div></div>
        </div>
      </article>
    </div>
    <p class="tools-footnote"><Sprout :size="16" aria-hidden="true" />One system for your crops, livestock, operations, and community.</p>
  </section>
</template>

<style scoped>
.tools-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 32px; margin-bottom: 30px; }
.tools-eyebrow { display: flex; align-items: center; gap: 9px; color: #066136; font-size: 10px; font-weight: 800; letter-spacing: .17em; }
.tools-eyebrow span { width: 7px; height: 7px; border-radius: 50%; background: #D7A722; box-shadow: 0 0 0 4px #FBF4DC; }
.tools-heading h2 { margin-top: 16px; color: #173D2B; font-size: clamp(28px, 3.2vw, 40px); font-weight: 750; line-height: 1.18; letter-spacing: -.045em; }
.tools-heading h2 span { color: #67816D; }
.tools-intro { max-width: 310px; padding-bottom: 3px; color: #647268; font-size: 14px; line-height: 1.8; }
.tools-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.tool-card { position: relative; min-width: 0; padding: 26px; border: 1px solid #E4E9E1; border-radius: 24px; background: #F9FAF6; transition: border-color .25s, box-shadow .25s, transform .25s; }
.tool-card:hover { transform: translateY(-3px); border-color: #ADC1AC; box-shadow: 0 12px 28px #173D2B0C; }
.tool-icon { display: inline-flex; width: 48px; height: 48px; align-items: center; justify-content: center; border-radius: 15px; color: var(--icon-color); background: var(--icon-bg); border: 1px solid #00000004; }
.accent-green { --icon-color: #17623E; --icon-bg: #E2EEDD; }
.accent-amber { --icon-color: #885515; --icon-bg: #FBEDCD; }
.accent-violet { --icon-color: #664A91; --icon-bg: #EDE6F7; }
.accent-blue { --icon-color: #2D6083; --icon-bg: #E2EDF4; }
.accent-coral { --icon-color: #A04C36; --icon-bg: #F8E5DD; }
.tool-card h3 { margin-top: 23px; font-size: 19px; font-weight: 750; letter-spacing: -.025em; color: #193D2B; }
.tool-description { max-width: 340px; margin-top: 10px; font-size: 13px; line-height: 1.85; color: #667167; }
.tool-spotlight { grid-column: span 2; display: flex; align-items: center; gap: 20px; overflow: hidden; padding: 32px; background: #064B32; border-color: #064B32; }
.tool-spotlight:hover { border-color: #208B59; }
.tool-spotlight .tool-copy { position: relative; z-index: 1; flex: 1; }
.tool-spotlight .tool-icon { color: #F9C23C; background: #FFFFFF12; border-color: #FFFFFF15; }
.spotlight-label { margin-top: 22px; color: #E8C96F; font-size: 9px; font-weight: 700; letter-spacing: .12em; }
.tool-spotlight h3 { margin-top: 10px; font-size: 29px; color: white; }
.tool-spotlight .tool-description { color: #D0E2D5; }
.spotlight-note { display: inline-flex; align-items: center; gap: 6px; margin-top: 23px; color: #F5DD9D; font-size: 10px; font-weight: 600; }
.diagnosis-art { position: relative; display: flex; flex-shrink: 0; width: 200px; height: 225px; align-items: center; justify-content: center; }
.scan-orbit { position: absolute; inset: 10px -16px; border: 1px solid #B8DC9122; border-radius: 50%; box-shadow: 0 0 0 25px #B8DC9106, 0 0 0 50px #B8DC9104; }
.scan-frame { position: relative; display: flex; width: 150px; height: 155px; align-items: center; justify-content: center; border-radius: 26px; background: linear-gradient(145deg, #19754D, #0C5B3B); box-shadow: 0 18px 32px #002C2044; transform: rotate(-7deg); }
.scan-leaf { fill: #78B85A; color: #D3EBAD; transform: rotate(-20deg); }
.scan-lines { position: absolute; color: #F9DD88; }
.scan-badge { position: absolute; bottom: 12px; right: -5px; display: flex; align-items: center; gap: 8px; border: 1px solid #D8E5D2; border-radius: 12px; padding: 10px; background: #F4F8EF; color: #174B31; font-size: 10px; font-weight: 750; box-shadow: 0 8px 24px #002C2040; }
.scan-badge > span { display: flex; padding: 6px; border-radius: 8px; background: #E1EDD9; }
.scan-badge p { margin-top: 2px; font-size: 8px; font-weight: 400; color: #677463; }
.tools-footnote { display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 24px; text-align: center; font-size: 11px; line-height: 1.6; color: #738171; }
@media (max-width: 1023px) { .tools-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .tool-spotlight { grid-column: span 2; } .tool-card:last-child { grid-column: span 2; } }
@media (max-width: 639px) { .tools-heading { display: block; } .tools-intro { margin-top: 18px; } .tools-grid { grid-template-columns: minmax(0, 1fr); } .tool-spotlight, .tool-card:last-child { grid-column: auto; } .tool-spotlight { flex-direction: column; align-items: flex-start; padding: 26px; gap: 4px; } .diagnosis-art { align-self: center; height: 195px; margin-top: 12px; } .tool-card { padding: 24px; } .tool-card:not(.tool-spotlight) .tool-copy { display: grid; grid-template-columns: 44px minmax(0, 1fr); column-gap: 16px; } .tool-card:not(.tool-spotlight) .tool-icon { width: 44px; height: 44px; grid-row: span 2; } .tool-card:not(.tool-spotlight) h3 { margin-top: 1px; font-size: 18px; } .tool-card:not(.tool-spotlight) .tool-description { margin-top: 7px; } }
@media (prefers-reduced-motion: reduce) { .tool-card { transition: none; } .tool-card:hover { transform: none; } }
</style>
