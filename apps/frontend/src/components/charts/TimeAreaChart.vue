<script setup lang="ts">
import { ref, toRef } from 'vue'
import type { PerformancePoint } from '@/core/domain/ports/ICryptoMetricsPort'
import { usePerformanceChart } from './composables/usePerformanceChart'

const props = defineProps<{
  data: PerformancePoint[]
}>()

const chartContainer = ref<HTMLElement | null>(null)
const wrapperContainer = ref<HTMLElement | null>(null)
const tooltip = ref<HTMLElement | null>(null)

// Initialize chart using the composable
usePerformanceChart(chartContainer, wrapperContainer, tooltip, toRef(props, 'data'))
</script>

<template>
  <div class="relative w-full h-[350px]" ref="wrapperContainer">
    <div ref="chartContainer" class="absolute inset-0"></div>
    <div
      ref="tooltip"
      class="absolute bg-white border border-border rounded-lg p-3 text-xs pointer-events-none opacity-0 transition-opacity duration-150 shadow-sm z-10"
    ></div>
  </div>
</template>
