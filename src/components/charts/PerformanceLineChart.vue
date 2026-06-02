<script setup lang="ts">
/**
 * PerformanceLineChart — Component description.
 */

import { ref, watch, onMounted, onUnmounted } from 'vue'
import { createChart, ColorType, AreaSeries, type ISeriesApi } from 'lightweight-charts'

interface ChartDataPoint {
  time: string
  value: number
}

const props = defineProps<{
  data: ChartDataPoint[]
}>()

const chartContainer = ref<HTMLDivElement | null>(null)
let chart: ReturnType<typeof createChart> | null = null
let areaSeries: ISeriesApi<"Area"> | null = null

function initChart() {
  if (!chartContainer.value || !props.data.length) return

  chart = createChart(chartContainer.value, {
    layout: {
      background: { type: ColorType.Solid, color: '#00000000' },
      textColor: '#94a3b8',
      attributionLogo: false,
    },
    grid: {
      vertLines: { visible: false },
      horzLines: { visible: false },
    },
    crosshair: {
      vertLine: { visible: true },
      horzLine: { visible: true },
    },
    rightPriceScale: {
      borderVisible: false,
    },
    timeScale: {
      borderVisible: false,
    },
    width: chartContainer.value.clientWidth,
    height: chartContainer.value.clientHeight || 240,
  })

  // lightweight-charts v5 API: addSeries(SeriesType, options)
  // NOTE: CSS variables cannot be used here — library parses colors before CSS resolves.
  // Using literal values matching the design tokens (primary ≈ blue-500, profit ≈ emerald-500)
  areaSeries = chart.addSeries(AreaSeries, {
    lineColor: '#3b82f6',           // blue-500 ≈ --primary in light mode
    topColor: 'rgba(59, 130, 246, 0.25)',
    bottomColor: 'rgba(59, 130, 246, 0.0)',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false,
  })

  if (!areaSeries) return
  areaSeries.setData(props.data)
  chart.timeScale().fitContent()
}

onMounted(() => {
  initChart()
})

watch(
  () => props.data,
  (newData) => {
    if (areaSeries && newData.length) {
      areaSeries.setData(newData)
      chart?.timeScale().fitContent()
    }
  },
  { deep: true }
)

onUnmounted(() => {
  chart?.remove()
  chart = null
  areaSeries = null
})
</script>

<template>
  <div
    v-if="data.length > 0"
    ref="chartContainer"
    data-testid="performance-chart"
    class="w-full h-full min-h-[240px]"
  />
</template>
