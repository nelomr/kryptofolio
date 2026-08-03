<script setup lang="ts">
import { ref, toRef } from 'vue'
import { usePerformanceChart, type PerformanceChartPoint } from './composables/usePerformanceChart'

const props = withDefaults(
  defineProps<{
    data: PerformanceChartPoint[]
    isPercent?: boolean
    hideCostBasis?: boolean
    baselineValue?: number
    lineColor?: string
    topColor?: string
    bottomColor?: string
    tooltipLabel?: string
  }>(),
  {
    isPercent: false,
    hideCostBasis: false,
    baselineValue: undefined,
    lineColor: undefined,
    topColor: undefined,
    bottomColor: undefined,
    tooltipLabel: undefined,
  }
)

const chartContainer = ref<HTMLElement | null>(null)
const wrapperContainer = ref<HTMLElement | null>(null)
const tooltip = ref<HTMLElement | null>(null)

// Initialize chart using the composable
usePerformanceChart(
  chartContainer,
  wrapperContainer,
  tooltip,
  toRef(props, 'data'),
  {
    isPercent: props.isPercent,
    hideCostBasis: props.hideCostBasis,
    baselineValue: props.baselineValue,
    lineColor: props.lineColor,
    topColor: props.topColor,
    bottomColor: props.bottomColor,
    tooltipLabel: props.tooltipLabel,
  }
)
</script>

<template>
  <div class="relative w-full h-[350px]" ref="wrapperContainer">
    <div ref="chartContainer" class="absolute inset-0"></div>
    <div
      ref="tooltip"
      class="absolute bg-white border border-border rounded-lg p-3 text-xs pointer-events-none opacity-0 transition-opacity duration-150 shadow-sm z-10 text-foreground"
    ></div>
  </div>
</template>

