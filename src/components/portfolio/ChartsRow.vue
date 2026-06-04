<script setup lang="ts">
/**
 * ChartsRow — Component description.
 */

import PerformanceLineChart from '@/components/charts/PerformanceLineChart.vue'
import AssetAllocationChart from '@/components/charts/AssetAllocationChart.vue'

interface ChartDataPoint {
  time: string | number
  value: number
  type?: 'deposit' | 'withdrawal'
  amount?: number
}

interface AssetSlice {
  label: string
  value: number
  color: string
}

defineProps<{
  performanceData: ChartDataPoint[]
  allocationData: AssetSlice[]
}>()
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 shrink-0 lg:min-h-[300px]">
    <!-- Performance Line Chart — 2/3 width -->
    <div class="lg:col-span-2 min-h-[250px] lg:min-h-0">
      <PerformanceLineChart
        v-if="performanceData.length > 0"
        :data="performanceData"
        class="h-full bg-card/20 backdrop-blur-2xl border border-border/40 rounded-lg"
      />
    </div>

    <!-- Asset Allocation Doughnut Chart — 1/3 width -->
    <div class="min-h-[250px] lg:min-h-0">
      <AssetAllocationChart
        v-if="allocationData.length > 0"
        :assets="allocationData"
        class="h-full bg-card/20 backdrop-blur-2xl border border-border/40 rounded-lg"
      />
    </div>
  </div>
</template>
