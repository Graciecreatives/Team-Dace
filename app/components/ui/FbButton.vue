<script setup>
defineProps({ variant: { type: String, default: 'primary' }, busy: Boolean, disabled: Boolean, type: { type: String, default: 'button' } })
</script>
<template><button class="fb-button" :class="`fb-button--${variant}`" :type="type" :disabled="disabled || busy" :aria-busy="busy || undefined"><span v-if="busy" class="fb-spinner" aria-hidden="true" /><slot /></button></template>
