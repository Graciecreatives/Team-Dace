<script setup>
import { ref } from 'vue'
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from 'reka-ui'
defineProps({ modelValue: String, items: { type: Array, default: () => [] }, label: { type: String, default: 'Workspace views' } })
const pointerMotion = ref(false)
defineEmits(['update:modelValue'])
</script>
<template><TabsRoot :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)"><TabsList class="fb-tabs" :class="{ 'fb-pointer-motion': pointerMotion }" @pointerdown.capture="pointerMotion = true" @keydown.capture="pointerMotion = false" :aria-label="label"><TabsTrigger v-for="item in items" :key="item.value" :value="item.value" :disabled="item.disabled" class="fb-tab">{{ item.label }}<span v-if="item.count !== undefined" class="fb-badge">{{ item.count }}</span></TabsTrigger></TabsList><TabsContent v-for="item in items" :key="item.value" :value="item.value" class="fb-tab-content"><slot :name="item.value" :item="item" /></TabsContent></TabsRoot></template>
