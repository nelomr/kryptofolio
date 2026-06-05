<script setup lang="ts">
/**
 * AssetAllocationChart — Component description.
 */

import { computed, ref } from 'vue'
import { Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import CustomChartLegend from './CustomChartLegend.vue'

ChartJS.register(ArcElement, Tooltip, Legend)

interface AssetSlice {
  label: string
  value: number
  color: string
  change24h?: number
}

const props = defineProps<{
  assets: AssetSlice[]
}>()

const chartData = computed<ChartData<'doughnut'>>(() => ({
  labels: props.assets.map((a) => a.label),
  datasets: [
    {
      data: props.assets.map((a) => a.value),
      backgroundColor: props.assets.map((a) => a.color),
      borderWidth: 0,
      hoverOffset: 4,
    },
  ],
}))

const chartOptions = computed<ChartOptions<'doughnut'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '80%',
  plugins: {
    legend: {
      display: false, // Ocultar leyenda nativa
    },
    tooltip: {
      backgroundColor: 'rgb(10, 15, 28)', // Solid dark color matching fg
      titleColor: '#fff',
      bodyColor: '#fff',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      borderWidth: 1,
      callbacks: {
        label: (ctx) => {
          const total = (ctx.dataset.data as number[]).reduce(
            (sum: number, v: number) => sum + v,
            0
          )
          const pct = ((ctx.parsed / total) * 100).toFixed(1)
          return ` ${ctx.label}: ${pct}%`
        },
      },
    },
  },
  animation: {
    animateRotate: true,
    animateScale: false,
  },
}))

const totalValue = computed(() => {
  return props.assets.reduce((sum, a) => sum + a.value, 0)
})

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(val)
}

const chartRef = ref<any>(null)

function handleLegendHover(index: number | null) {
  const chartInstance = chartRef.value?.chart
  if (!chartInstance) return

  if (index !== null) {
    chartInstance.setActiveElements([{ datasetIndex: 0, index }])
    chartInstance.tooltip.setActiveElements([{ datasetIndex: 0, index }], { x: 0, y: 0 })
  } else {
    chartInstance.setActiveElements([])
    chartInstance.tooltip.setActiveElements([], { x: 0, y: 0 })
  }
  chartInstance.update()
}
</script>

<template>
  <div v-if="assets.length > 0" data-testid="allocation-chart" class="flex flex-col h-full w-full">
    <div class="relative w-full h-48 mb-4">
      <Doughnut ref="chartRef" :data="chartData" :options="chartOptions" />
      <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span class="text-xs text-muted-foreground uppercase font-medium tracking-wider">Total</span>
        <span class="text-xl font-bold text-foreground">{{ formatCurrency(totalValue) }}</span>
      </div>
    </div>
    
    <div class="flex-1 overflow-y-auto">
      <CustomChartLegend :assets="assets" @hover="handleLegendHover" />
    </div>
  </div>
</template>
