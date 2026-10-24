<script setup>
import { onBeforeUnmount, onMounted, ref, TransitionGroup } from 'vue'

defineProps({ columns: { type: Array, default: () => [] }, label: { type: String, default: 'Task board' } })
// Only pointer-driven changes get feedback. Keyboard navigation and typing stay instant,
// including actions originating in a dialog outside the board itself.
const pointerMotion = ref(false)
const enableMotion = () => { pointerMotion.value = true }
const disableMotion = () => { pointerMotion.value = false }
onMounted(() => {
  window.addEventListener('pointerdown', enableMotion, true)
  window.addEventListener('keydown', disableMotion, true)
  window.addEventListener('input', disableMotion, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', enableMotion, true)
  window.removeEventListener('keydown', disableMotion, true)
  window.removeEventListener('input', disableMotion, true)
})
</script>
<template>
  <section class="fb-board" :aria-label="label">
    <section v-for="column in columns" :key="column.id" class="fb-board-column" :aria-label="column.title">
      <header><h3>{{ column.title }}</h3><span class="fb-badge">{{ column.items.length }}</span></header>
      <TransitionGroup tag="div" class="fb-board-items" name="fb-board-change" :css="pointerMotion">
        <div v-for="item in column.items" :key="item.id" class="fb-board-item"><slot name="item" :item="item" :column="column" /></div>
        <p v-if="!column.items.length" key="board-empty" class="fb-board-empty">No tasks here</p>
      </TransitionGroup>
    </section>
  </section>
</template>
