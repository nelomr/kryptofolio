<script setup lang="ts">
/**
 * AssetAllocationChart — Component description.
 */

import { computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

interface AssetSlice {
  label: string
  value: number
  color: string
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
      position: 'right' as const,
      labels: {
        color: '#94a3b8',
        boxWidth: 12,
        padding: 16,
        font: { size: 12 },
      },
    },
    tooltip: {
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
</script>

<template>
  <div
    v-if="assets.length > 0"
    data-testid="allocation-chart"
    class="relative w-full h-60"
  >
    <Doughnut :data="chartData" :options="chartOptions" />
  </div>
</template>
