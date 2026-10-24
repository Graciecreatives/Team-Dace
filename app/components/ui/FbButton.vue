<script setup>
import { ref } from 'vue'
defineProps({ variant: { type: String, default: 'primary' }, busy: Boolean, disabled: Boolean, type: { type: String, default: 'button' } })
const pointerMotion = ref(false)
</script>
<template><button class="fb-button" :class="[`fb-button--${variant}`, { 'fb-pointer-motion': pointerMotion }]" :type="type" :disabled="disabled || busy" :aria-busy="busy || undefined" @pointerdown="pointerMotion = true" @pointerenter="pointerMotion = true" @keydown="pointerMotion = false" @blur="pointerMotion = false"><span v-if="busy" class="fb-spinner" aria-hidden="true" /><slot /></button></template>
