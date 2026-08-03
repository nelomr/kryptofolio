<script setup lang="ts">
import { ref, computed } from 'vue'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { useI18n } from '@/composables/useI18n'
import { formatCurrency, formatPercent } from '@/composables/useFormatters'
import TimeFilter from '@/components/ui/time-filter/TimeFilter.vue'
import TimeAreaChart from '@/components/charts/TimeAreaChart.vue'
import ChartSkeleton from '@/components/charts/ChartSkeleton.vue'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePerformanceHistoryQuery } from '@/composables/queries/useCryptoMetricsQueries'
import type { TimeRange } from '@/core/domain/ports/ICryptoMetricsPort'

const { t } = useI18n()
const selectedRange = ref<TimeRange>('1M')

const { data, isLoading, error } = usePerformanceHistoryQuery(selectedRange)

const currentCostBasis = computed(() => {
  if (!data.value?.history?.length) return 0
  return data.value.history[data.value.history.length - 1].costBasisFiat
})
</script>

<template>
  <Card class="flex flex-col w-full">
    <CardHeader class="flex flex-row items-start justify-between pb-2">
      <div class="flex flex-col gap-1">
        <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ t('portfolio.metrics_tabs.performance.kicker') }}</span>
        <CardTitle class="text-xl font-bold">{{ t('portfolio.metrics_tabs.performance.title') }}</CardTitle>
        <CardDescription class="text-sm">
          {{ t('portfolio.metrics_tabs.performance.desc', { cost: formatCurrency(currentCostBasis) }) }}
        </CardDescription>
      </div>
      <TimeFilter v-model="selectedRange" />
    </CardHeader>
    <CardContent class="flex-1 p-0 pt-4 px-4 pb-4">
      <ChartSkeleton v-if="isLoading" class="h-[350px]" />
      <div v-else-if="error" class="h-[350px] flex items-center justify-center text-muted-foreground text-sm text-center px-4">
        {{ t('metrics.error_loading') }}
      </div>
      <TimeAreaChart v-else-if="data?.history" :data="data.history" />
    </CardContent>
    <div v-if="data?.metrics" class="border-t border-border/50 bg-surface-1 px-4 py-3 flex items-center gap-6 overflow-x-auto text-sm">
      <div class="stat flex flex-col gap-0.5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span class="text-[11px] text-muted-foreground uppercase tracking-wider font-medium underline decoration-dotted underline-offset-2 cursor-default">{{ t('portfolio.metrics_tabs.performance.stats.return', { range: selectedRange }) }}</span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <span class="text-xs max-w-[200px] block text-center">{{ t('portfolio.metrics_tabs.performance.stats.return_desc') }}</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span class="font-medium" :class="data.metrics.returnFiat >= 0 ? 'text-profit' : 'text-loss'">
          {{ data.metrics.returnFiat >= 0 ? '+' : '' }}{{ formatCurrency(data.metrics.returnFiat) }}
        </span>
      </div>
      <div class="stat flex flex-col gap-0.5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span class="text-[11px] text-muted-foreground uppercase tracking-wider font-medium underline decoration-dotted underline-offset-2 cursor-default">{{ t('portfolio.metrics_tabs.performance.stats.vs_cost') }}</span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <span class="text-xs max-w-[200px] block text-center">{{ t('portfolio.metrics_tabs.performance.stats.vs_cost_desc') }}</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span class="font-medium" :class="data.metrics.returnPercent >= 0 ? 'text-profit' : 'text-loss'">
          {{ data.metrics.returnPercent >= 0 ? '+' : '' }}{{ formatPercent(data.metrics.returnPercent) }}
        </span>
      </div>
      <div class="stat flex flex-col gap-0.5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span class="text-[11px] text-muted-foreground uppercase tracking-wider font-medium underline decoration-dotted underline-offset-2 cursor-default">{{ t('portfolio.metrics_tabs.performance.stats.volatility') }}</span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <span class="text-xs max-w-[200px] block text-center">{{ t('portfolio.metrics_tabs.performance.stats.volatility_desc') }}</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span class="font-medium text-foreground">{{ formatPercent(data.metrics.volatilityPercent) }}</span>
      </div>
      <div class="stat flex flex-col gap-0.5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span class="text-[11px] text-muted-foreground uppercase tracking-wider font-medium underline decoration-dotted underline-offset-2 cursor-default">{{ t('portfolio.metrics_tabs.performance.stats.best_day') }}</span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <span class="text-xs max-w-[200px] block text-center">{{ t('portfolio.metrics_tabs.performance.stats.best_day_desc') }}</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span class="font-medium" :class="data.metrics.bestDayPercent >= 0 ? 'text-profit' : 'text-loss'">
          {{ data.metrics.bestDayPercent >= 0 ? '+' : '' }}{{ formatPercent(data.metrics.bestDayPercent) }}
        </span>
      </div>
    </div>
  </Card>
</template>
