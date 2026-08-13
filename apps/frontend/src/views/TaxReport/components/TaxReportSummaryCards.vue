<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/composables/useFormatters'
import { AlertTriangle, TrendingUp, TrendingDown, PiggyBank, Receipt } from 'lucide-vue-next'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

interface FiscalMetrics {
  /**
   * Exact decimal strings, in the currency the report states.
   *
   * Not numbers: these are declared tax bases, `formatCurrency` accepts a string, and parsing them
   * into floats here would be the only place on this path that still did.
   */
  capitalGains: string
  yields: string
  totalLosses: string
  estimatedIrpf: string
  /** Disposal events held out of the totals above because they carry a data-quality defect. */
  excludedFlaggedEvents: number
  /** Income rows held out of the totals above because no price could be resolved for them. */
  excludedUnresolvedIncomeCount: number
}

const props = withDefaults(defineProps<{
  metrics?: FiscalMetrics
}>(), {
  metrics: () => ({
    capitalGains: '0',
    yields: '0',
    totalLosses: '0',
    estimatedIrpf: '0',
    excludedFlaggedEvents: 0,
    excludedUnresolvedIncomeCount: 0,
  })
})

/**
 * Two independent defects, reported together so an incomplete total is never presented as
 * complete: a disposal held out for a data-quality defect, and an income row held out because no
 * price could be resolved for it. Neither blocks the report; both are counted so the gap is visible
 * rather than silently absorbed into the totals above.
 */
/**
 * Whether a decimal-string figure is above zero, for the colour class only.
 *
 * `'0' > 0` does not typecheck and `'0.00' > 0` would be a string comparison if it did; the figure is
 * parsed here and nowhere else, because a CSS class is the one use where losing the last places is
 * harmless. The displayed number goes through `formatCurrency` on the exact string.
 */
const isPositive = (figure: string): boolean => Number(figure) > 0

const hasExclusions = computed(
  () => props.metrics.excludedFlaggedEvents > 0 || props.metrics.excludedUnresolvedIncomeCount > 0,
)
</script>

<template>
  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
    <!-- Capital Gains -->
    <Card class="bg-card/50 backdrop-blur-sm shadow-soft hover:shadow-card transition-all duration-300">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle class="text-sm font-medium text-muted-foreground">
          {{ t('tax.summary.capital_gains') }}
        </CardTitle>
        <TrendingUp class="h-4 w-4 text-profit" />
      </CardHeader>
      <CardContent>
        <div class="text-2xl font-bold num" :class="{'text-profit': isPositive(props.metrics.capitalGains)}">
          {{ formatCurrency(props.metrics.capitalGains) }}
        </div>
      </CardContent>
    </Card>

    <!-- Yields -->
    <Card class="bg-card/50 backdrop-blur-sm shadow-soft hover:shadow-card transition-all duration-300">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle class="text-sm font-medium text-muted-foreground">
          {{ t('tax.summary.yields') }}
        </CardTitle>
        <PiggyBank class="h-4 w-4 text-info" />
      </CardHeader>
      <CardContent>
        <div class="text-2xl font-bold num" :class="{'text-info': isPositive(props.metrics.yields)}">
          {{ formatCurrency(props.metrics.yields) }}
        </div>
      </CardContent>
    </Card>

    <!-- Total Losses -->
    <Card class="bg-card/50 backdrop-blur-sm shadow-soft hover:shadow-card transition-all duration-300">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle class="text-sm font-medium text-muted-foreground">
          {{ t('tax.summary.total_losses') }}
        </CardTitle>
        <TrendingDown class="h-4 w-4 text-loss" />
      </CardHeader>
      <CardContent>
        <div class="text-2xl font-bold num" :class="{'text-loss': isPositive(props.metrics.totalLosses)}">
          {{ formatCurrency(props.metrics.totalLosses) }}
        </div>
      </CardContent>
    </Card>

    <!-- Estimated IRPF -->
    <Card class="bg-card/50 backdrop-blur-sm shadow-soft hover:shadow-card transition-all duration-300">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle class="text-sm font-medium text-muted-foreground">
          {{ t('tax.summary.estimated_irpf') }}
        </CardTitle>
        <Receipt class="h-4 w-4 text-warning" />
      </CardHeader>
      <CardContent>
        <div class="text-2xl font-bold text-warning num">
          {{ formatCurrency(props.metrics.estimatedIrpf) }}
        </div>
      </CardContent>
    </Card>
  </div>

  <div
    v-if="hasExclusions"
    data-testid="summary-exclusions-notice"
    class="flex flex-wrap items-center gap-4 rounded-lg border border-warning/40 bg-warning-soft p-3 mb-6 text-sm text-warning"
  >
    <AlertTriangle class="h-4 w-4 shrink-0" />
    <span v-if="props.metrics.excludedFlaggedEvents > 0" data-testid="excluded-flagged-events">
      <span class="font-mono tabular-nums">{{ props.metrics.excludedFlaggedEvents }}</span>
      {{ t('tax.summary.excluded_flagged_events') }}
    </span>
    <span
      v-if="props.metrics.excludedUnresolvedIncomeCount > 0"
      data-testid="excluded-unresolved-income"
    >
      <span class="font-mono tabular-nums">{{ props.metrics.excludedUnresolvedIncomeCount }}</span>
      {{ t('tax.summary.excluded_unresolved_income') }}
    </span>
  </div>
</template>
