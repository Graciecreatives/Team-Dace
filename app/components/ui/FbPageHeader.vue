<script setup>defineProps({ title: String, description: String })</script>
<template><header class="fb-page-header"><div><h2>{{ title }}</h2><p v-if="description">{{ description }}</p></div><div v-if="$slots.actions" class="fb-actions"><slot name="actions" /></div></header></template>
