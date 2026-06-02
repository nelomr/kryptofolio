<script setup lang="ts">
/**
 * CryptoIcon — Component description.
 */

import { computed } from 'vue'
import { cn } from '@/lib/utils'
import { CryptoIcons } from '@/assets/crypto'

const props = defineProps({
  symbol: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    default: 24
  },
  colored: {
    type: Boolean,
    default: false
  },
  class: {
    type: String,
    default: ''
  }
})

// Type CryptoIcons explicitly in case index.js doesn't export them correctly
const icons = CryptoIcons as Record<string, string>

const iconSymbolUrl = computed(() => {
  const s = props.symbol?.toLowerCase() || 'generic'
  return icons[s] || icons.generic
})

const iconStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`
}))

const handleImageError = (event: Event) => {
  const target = event.target as HTMLImageElement
  target.src = icons.generic
}
</script>

<template>
  <div 
    :class="cn(
      'inline-flex items-center justify-center shrink-0 overflow-hidden rounded-full',
      !colored && 'text-foreground',
      props.class
    )"
    :style="iconStyle"
  >
    <img 
      :src="iconSymbolUrl" 
      :alt="symbol" 
      class="w-full h-full object-contain"
      :class="[!colored && 'grayscale brightness-0 dark:invert']"
      @error="handleImageError"
    />
  </div>
</template>

<style scoped>
div {
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
