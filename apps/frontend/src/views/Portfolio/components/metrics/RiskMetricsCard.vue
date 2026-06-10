<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import ChartSkeleton from '@/components/charts/ChartSkeleton.vue'
import { useRiskMetricsQuery } from '@/composables/queries/useCryptoMetricsQueries'
import { useI18n } from '@/composables/useI18n'
import { Line as LineChart } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip as ChartTooltip, Filler } from 'chart.js'
import { useRiskChart } from '@/components/charts/composables/useRiskChart'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, ChartTooltip, Filler)

const { t } = useI18n()
const { data, isLoading, error } = useRiskMetricsQuery()

const historyRef = computed(() => data.value?.history || [])
const { chartData, chartOptions, riskZonesPlugin, sharpeColor } = useRiskChart(historyRef)
</script>

<template>
  <Card class="flex flex-col w-full">
    <!-- Card Head -->
    <CardHeader class="flex flex-row items-start justify-between pb-2">
      <div class="flex flex-col gap-1">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ t('portfolio.metrics_tabs.risk.kicker') }}</span>
        <CardTitle class="text-xl font-bold m-0 p-0 leading-none">{{ t('portfolio.metrics_tabs.risk.title') }}</CardTitle>
        <p class="text-xs text-muted-foreground m-0 p-0 max-w-[80%]">{{ t('portfolio.metrics_tabs.risk.desc') }}</p>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
        <span class="num text-2xl font-mono font-bold leading-none" :style="{ color: sharpeColor }">
          <template v-if="data">{{ data.sharpeRatio.toFixed(2) }}</template>
          <template v-else>-</template>
        </span>
        <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ t('portfolio.metrics_tabs.risk.current') }}</span>
      </div>
    </CardHeader>
    
    <!-- Card Body -->
    <CardContent class="flex-1 px-6 pb-6 relative">
      <ChartSkeleton v-if="isLoading" class="h-[220px] w-full" />
      <div v-else-if="error" class="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
        {{ t('metrics.error_loading') }}
      </div>
      <div v-else-if="data && historyRef.length > 0" class="h-[220px] w-full relative">
        <LineChart 
          :data="chartData" 
          :options="chartOptions" 
          :plugins="[riskZonesPlugin]" 
        />
      </div>
    </CardContent>
    
    <!-- Card Foot -->
    <CardFooter v-if="data" class="border-t border-border/50 bg-surface-1/50 px-6 py-4 grid grid-cols-3 gap-4">
      <TooltipProvider :delay-duration="200">
        <!-- Sharpe YTD -->
        <Tooltip>
          <TooltipTrigger asChild>
            <div class="flex flex-col gap-1 cursor-help">
              <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-dashed border-muted-foreground/30 pb-0.5 inline-block w-fit">{{ t('portfolio.metrics_tabs.risk.stats.sharpe') }}</span>
              <span class="num font-mono text-lg font-medium">{{ data.sharpeRatio.toFixed(2) }}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p class="text-xs max-w-[200px]">{{ t('portfolio.metrics_tabs.risk.stats.sharpe_desc') }}</p>
          </TooltipContent>
        </Tooltip>
        
        <!-- Sortino -->
        <Tooltip>
          <TooltipTrigger asChild>
            <div class="flex flex-col gap-1 cursor-help">
              <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-dashed border-muted-foreground/30 pb-0.5 inline-block w-fit">{{ t('portfolio.metrics_tabs.risk.stats.sortino') }}</span>
              <span class="num font-mono text-lg font-medium">{{ data.sortinoRatio.toFixed(2) }}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p class="text-xs max-w-[200px]">{{ t('portfolio.metrics_tabs.risk.stats.sortino_desc') }}</p>
          </TooltipContent>
        </Tooltip>
        
        <!-- Calmar -->
        <Tooltip>
          <TooltipTrigger asChild>
            <div class="flex flex-col gap-1 cursor-help">
              <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-dashed border-muted-foreground/30 pb-0.5 inline-block w-fit">{{ t('portfolio.metrics_tabs.risk.stats.calmar') }}</span>
              <span class="num font-mono text-lg font-medium">{{ data.calmarRatio.toFixed(2) }}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p class="text-xs max-w-[200px]">{{ t('portfolio.metrics_tabs.risk.stats.calmar_desc') }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </CardFooter>
  </Card>
</template>
