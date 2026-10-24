<script setup>defineProps({ title: String })</script>
<template><section class="fb-panel"><header v-if="title || $slots.header || $slots.actions" class="fb-panel-heading"><slot name="header"><h3>{{ title }}</h3></slot><slot name="actions" /></header><slot /></section></template>
