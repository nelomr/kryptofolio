<script setup lang="ts">
import { ref, computed } from 'vue'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { useI18n } from '@/composables/useI18n'
import { formatCurrency, formatPercent } from '@/composables/useFormatters'
import TimeFilter from '@/components/ui/time-filter/TimeFilter.vue'
import TimeAreaChart from '@/components/charts/TimeAreaChart.vue'
import ChartSkeleton from '@/components/charts/ChartSkeleton.vue'
import { usePerformanceHistoryQuery } from '@/composables/queries/useCryptoMetricsQueries'
import type { TimeRange } from '@/core/domain/ports/ICryptoMetricsPort'

const { t } = useI18n()
const selectedRange = ref<TimeRange>('1M')

const { data, isLoading } = usePerformanceHistoryQuery(selectedRange)

const currentCostBasis = computed(() => {
  if (!data.value?.history?.length) return 0
  return data.value.history[data.value.history.length - 1].costBasisFiat
})
</script>

<template>
  <Card class="flex flex-col h-full col-span-1 md:col-span-3 lg:col-span-3">
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
      <TimeAreaChart v-else-if="data?.history" :data="data.history" />
    </CardContent>
    <div v-if="data?.metrics" class="border-t border-border/50 bg-surface-1 px-4 py-3 flex items-center gap-6 overflow-x-auto text-sm">
      <div class="stat flex flex-col gap-0.5">
        <span class="text-xs text-muted-foreground uppercase tracking-wide font-medium">{{ t('portfolio.metrics_tabs.performance.stats.return', { range: selectedRange }) }}</span>
        <span class="font-medium" :class="data.metrics.returnFiat >= 0 ? 'text-profit' : 'text-loss'">
          {{ data.metrics.returnFiat >= 0 ? '+' : '' }}{{ formatCurrency(data.metrics.returnFiat) }}
        </span>
      </div>
      <div class="stat flex flex-col gap-0.5">
        <span class="text-xs text-muted-foreground uppercase tracking-wide font-medium">{{ t('portfolio.metrics_tabs.performance.stats.vs_cost') }}</span>
        <span class="font-medium" :class="data.metrics.returnPercent >= 0 ? 'text-profit' : 'text-loss'">
          {{ data.metrics.returnPercent >= 0 ? '+' : '' }}{{ formatPercent(data.metrics.returnPercent) }}
        </span>
      </div>
      <div class="stat flex flex-col gap-0.5">
        <span class="text-xs text-muted-foreground uppercase tracking-wide font-medium">{{ t('portfolio.metrics_tabs.performance.stats.volatility') }}</span>
        <span class="font-medium text-foreground">{{ formatPercent(data.metrics.volatilityPercent) }}</span>
      </div>
      <div class="stat flex flex-col gap-0.5">
        <span class="text-xs text-muted-foreground uppercase tracking-wide font-medium">{{ t('portfolio.metrics_tabs.performance.stats.best_day') }}</span>
        <span class="font-medium" :class="data.metrics.bestDayPercent >= 0 ? 'text-profit' : 'text-loss'">
          {{ data.metrics.bestDayPercent >= 0 ? '+' : '' }}{{ formatPercent(data.metrics.bestDayPercent) }}
        </span>
      </div>
    </div>
  </Card>
</template>
