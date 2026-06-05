<script setup lang="ts">
import { computed } from 'vue'

interface AssetSlice {
  label: string
  value: number
  color: string
  change24h?: number
}

const props = defineProps<{
  assets: AssetSlice[]
}>()

const emit = defineEmits<{
  hover: [index: number | null]
}>()

const formatPercent = (val?: number) => {
  if (val === undefined) return '0.0%'
  const prefix = val > 0 ? '+' : ''
  return `${prefix}${val.toFixed(2)}%`
}

const totalValue = computed(() => {
  return props.assets.reduce((sum, a) => sum + a.value, 0)
})
</script>

<template>
  <div class="flex flex-col gap-2 p-2">
    <div 
      v-for="(asset, index) in assets" 
      :key="asset.label"
      @mouseenter="emit('hover', index)"
      @mouseleave="emit('hover', null)"
      class="flex items-center justify-between text-sm hover:bg-surface-2 p-1.5 rounded transition-colors cursor-default"
    >
      <div class="flex items-center gap-2">
        <span 
          class="w-3 h-3 rounded-full shadow-sm" 
          :style="{ backgroundColor: asset.color }" 
        />
        <div class="flex items-baseline gap-2">
          <span class="font-medium text-foreground">{{ asset.label }}</span>
          <span class="text-xs text-muted-foreground font-medium">
            {{ totalValue > 0 ? ((asset.value / totalValue) * 100).toFixed(1) : '0.0' }}%
          </span>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-muted-foreground/70">24h</span>
        <span 
          class="text-xs font-semibold"
          :class="(asset.change24h || 0) >= 0 ? 'text-profit' : 'text-loss'"
        >
          {{ formatPercent(asset.change24h) }}
        </span>
      </div>
    </div>
  </div>
</template>
