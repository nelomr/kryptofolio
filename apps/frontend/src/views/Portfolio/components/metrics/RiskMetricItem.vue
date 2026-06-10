<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  label: string
  value: number
  format?: 'number' | 'percent'
  thresholds?: {
    loss?: number
    warning?: number
    profit?: number
  }
}>()

const formattedValue = computed(() => {
  if (props.format === 'percent') {
    return `${props.value > 0 ? '+' : ''}${props.value.toFixed(2)}%`
  }
  return props.value.toFixed(2)
})

const colorClass = computed(() => {
  if (!props.thresholds) return 'text-fg'
  
  const val = props.value
  const { loss, warning, profit } = props.thresholds
  
  if (profit !== undefined && val >= profit) return 'text-profit'
  if (loss !== undefined && val <= loss) return 'text-loss'
  if (warning !== undefined && val <= warning) return 'text-warning'
  
  return 'text-fg'
})
</script>

<template>
  <div class="stat flex flex-col gap-1">
    <span class="kicker text-muted">{{ label }}</span>
    <span :class="['val num', colorClass]">{{ formattedValue }}</span>
  </div>
</template>
