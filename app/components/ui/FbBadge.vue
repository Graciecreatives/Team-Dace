<script setup>defineProps({ tone: { type: String, default: 'neutral' } })</script>
<template><span class="fb-badge" :class="`fb-badge--${tone}`"><slot /></span></template>
