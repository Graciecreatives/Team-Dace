<script setup>
import { useId, watch } from 'vue'
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogClose } from 'reka-ui'
const props = defineProps({ open: Boolean, title: String, description: String, busy: Boolean })
const emit = defineEmits(['update:open'])
const descriptionId = useId()
let trigger
watch(() => props.open, value => { if (value && typeof document !== 'undefined') trigger = document.activeElement }, { flush: 'sync' })
function change(value) { if (!props.busy || value) emit('update:open', value) }
function preventBusy(event) { if (props.busy) event.preventDefault() }
function restore(event) { event.preventDefault(); if (trigger?.isConnected) trigger.focus() }
</script>
<template><DialogRoot :open="open" @update:open="change"><DialogPortal><DialogOverlay class="fb-dialog-overlay" /><DialogContent class="fb-dialog" :aria-describedby="description ? descriptionId : undefined" @escape-key-down="preventBusy" @interact-outside="preventBusy" @close-auto-focus="restore"><header class="fb-dialog-heading"><div><DialogTitle class="fb-dialog-title">{{ title }}</DialogTitle><DialogDescription v-if="description" :id="descriptionId" class="fb-dialog-description">{{ description }}</DialogDescription></div><DialogClose class="fb-dialog-close" :disabled="busy" aria-label="Close dialog">×</DialogClose></header><slot /><footer v-if="$slots.footer" class="fb-dialog-footer"><slot name="footer" /></footer></DialogContent></DialogPortal></DialogRoot></template>
