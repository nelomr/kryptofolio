<script setup lang="ts">
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/composables/useFormatters'
import { TrendingUp, TrendingDown, PiggyBank, Receipt } from 'lucide-vue-next'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

interface FiscalMetrics {
  capitalGains: number
  yields: number
  totalLosses: number
  estimatedIrpf: number
}

const props = withDefaults(defineProps<{
  metrics?: FiscalMetrics
}>(), {
  metrics: () => ({
    capitalGains: 0,
    yields: 0,
    totalLosses: 0,
    estimatedIrpf: 0
  })
})
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
        <div class="text-2xl font-bold num" :class="{'text-profit': props.metrics.capitalGains > 0}">
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
        <div class="text-2xl font-bold num" :class="{'text-info': props.metrics.yields > 0}">
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
        <div class="text-2xl font-bold num" :class="{'text-loss': props.metrics.totalLosses > 0}">
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
</template>
