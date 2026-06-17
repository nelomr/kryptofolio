<script setup lang="ts">
import { ref } from 'vue'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { useI18n } from '@/composables/useI18n'
import TimeFilter from '@/components/ui/time-filter/TimeFilter.vue'
import TimeAreaChart from '@/components/charts/TimeAreaChart.vue'
import ChartSkeleton from '@/components/charts/ChartSkeleton.vue'
import { useDrawdownCurveQuery } from '@/composables/queries/useCryptoMetricsQueries'
import type { TimeRange } from '@/core/domain/ports/ICryptoMetricsPort'

const { t } = useI18n()
const selectedRange = ref<TimeRange>('1M')

const { data, isLoading, error } = useDrawdownCurveQuery(selectedRange)
</script>

<template>
  <Card class="flex flex-col w-full">
    <CardHeader class="flex flex-row items-start justify-between pb-2">
      <div class="flex flex-col gap-1">
        <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ t('metrics.drawdown.kicker') }}</span>
        <CardTitle class="text-xl font-bold">{{ t('metrics.drawdown.title') }}</CardTitle>
        <CardDescription class="text-sm">
          {{ t('metrics.drawdown.desc') }}
        </CardDescription>
      </div>
      <TimeFilter v-model="selectedRange" />
    </CardHeader>
    <CardContent class="flex-1 p-0 pt-4 px-4 pb-4">
      <ChartSkeleton v-if="isLoading" class="h-[350px]" />
      <div v-else-if="error" class="h-[350px] flex items-center justify-center text-muted-foreground text-sm text-center px-4">
        {{ t('metrics.error_loading') }}
      </div>
      <TimeAreaChart
        v-else-if="data"
        :data="data"
        :is-percent="true"
        :hide-cost-basis="true"
        :baseline-value="0"
        line-color="--color-loss"
        top-color="--color-loss-medium"
        bottom-color="--color-loss-soft"
        :tooltip-label="t('metrics.drawdown.tooltip_label')"
      />
    </CardContent>
  </Card>
</template>
