<script setup>defineProps({ title: String, description: String })</script>
<template><div class="fb-empty"><h3>{{ title }}</h3><p v-if="description">{{ description }}</p><slot /></div></template>
