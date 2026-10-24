<script setup>defineProps({ label: String, for: String, hint: String, error: String })</script>
<template><div class="fb-field"><label v-if="label" :for="$props.for">{{ label }}</label><slot /><p v-if="error" role="alert" class="fb-field-error">{{ error }}</p><p v-else-if="hint" class="fb-field-hint">{{ hint }}</p></div></template>
