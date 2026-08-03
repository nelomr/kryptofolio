<script setup lang="ts">
import { toRef } from 'vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useAssetAllocationQuery } from '@/composables/queries/useCryptoMetricsQueries'
import AssetAllocationLegend from './AssetAllocationLegend.vue'
import { useI18n } from '@/composables/useI18n'
import { Doughnut } from 'vue-chartjs'
import { Chart as ChartJS, ArcElement, Tooltip as ChartTooltip } from 'chart.js'
import { useAssetAllocationChart, backgroundTrackPlugin } from '@/components/charts/composables/useAssetAllocationChart'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

ChartJS.register(ArcElement, ChartTooltip)

const { t } = useI18n()
const { data, isLoading, error } = useAssetAllocationQuery()

// Use the new professional chart composable
const { chartData, chartOptions } = useAssetAllocationChart(toRef(() => data.value?.items))
</script>

<template>
  <Card class="flex flex-col w-full">
    <CardHeader class="flex flex-row items-start justify-between pb-2">
      <div class="flex flex-col gap-1">
        <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ t('metrics.asset_allocation') }}</span>
        <CardTitle class="text-xl font-bold">{{ t('metrics.distribution') }}</CardTitle>
      </div>
    </CardHeader>
    
    <CardContent class="flex-1 p-0 pt-4 px-4 pb-4">
      <div v-if="isLoading" class="flex flex-col xl:flex-row items-center justify-center gap-6 xl:gap-8 min-h-[200px]">
        <!-- Donut Skeleton -->
        <Skeleton class="w-[180px] h-[180px] xl:w-[200px] xl:h-[200px] rounded-full flex-shrink-0" />
        <!-- Legend Skeleton -->
        <div class="flex flex-col gap-3 flex-1 w-full max-w-[200px]">
          <Skeleton class="h-10 w-full rounded-md" v-for="i in 4" :key="i" />
        </div>
      </div>
      
      <div v-else-if="error" class="p-4 text-loss bg-loss-soft rounded-xl">
        {{ t('metrics.error_loading') }}
      </div>
      
      <div v-else-if="data" class="flex flex-col xl:flex-row items-center justify-center gap-6 xl:gap-8 min-h-[200px]">
        <!-- Doughnut Chart from vue-chartjs -->
        <div class="relative w-[180px] h-[180px] xl:w-[200px] xl:h-[200px] flex-shrink-0 mx-auto xl:mx-0">
          <!-- Center Text placed behind canvas so tooltips render on top -->
          <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span class="font-sans text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">{{ t('metrics.assets_kicker_upper') }}</span>
            <span class="font-mono text-[22px] font-bold text-foreground num mt-1">{{ data.totalAssets }}</span>
          </div>
          
          <Doughnut 
            class="relative"
            v-if="chartData.datasets[0].data.length > 0"
            :data="chartData" 
            :options="chartOptions" 
            :plugins="[backgroundTrackPlugin]" 
          />
        </div>
        
        <!-- Custom Legend -->
        <AssetAllocationLegend :items="data.items" />
      </div>
    </CardContent>
    
    <div v-if="data" class="border-t border-border/50 bg-surface-1 px-4 py-3 flex items-center gap-6 overflow-x-auto text-sm mt-auto">
      <div class="stat flex flex-col gap-0.5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span class="text-[11px] text-muted-foreground uppercase tracking-wider font-medium underline decoration-dotted underline-offset-2 cursor-default">{{ t('metrics.assets_kicker') }}</span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <span class="text-xs max-w-[200px] block text-center">{{ t('metrics.assets_kicker_desc') }}</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span class="font-medium text-foreground num">{{ data.totalAssets }}</span>
      </div>
      <div class="stat flex flex-col gap-0.5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span class="text-[11px] text-muted-foreground uppercase tracking-wider font-medium underline decoration-dotted underline-offset-2 cursor-default">{{ t('metrics.hhi_kicker') }}</span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <span class="text-xs max-w-[200px] block text-center">{{ t('metrics.hhi_kicker_desc') }}</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span class="font-medium text-foreground num">{{ new Intl.NumberFormat('en-US').format(data.hhiScore) }}</span>
      </div>
    </div>
  </Card>
</template>
