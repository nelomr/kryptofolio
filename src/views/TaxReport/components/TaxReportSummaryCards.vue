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
    <Card class="bg-card/50 backdrop-blur-sm border-primary/10 hover:border-primary/30 transition-colors">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle class="text-sm font-medium text-muted-foreground">
          {{ t('tax.summary.capital_gains') }}
        </CardTitle>
        <TrendingUp class="h-4 w-4 text-emerald-500" />
      </CardHeader>
      <CardContent>
        <div class="text-2xl font-bold" :class="{'text-emerald-500': props.metrics.capitalGains > 0}">
          {{ formatCurrency(props.metrics.capitalGains) }}
        </div>
      </CardContent>
    </Card>

    <!-- Yields -->
    <Card class="bg-card/50 backdrop-blur-sm border-primary/10 hover:border-primary/30 transition-colors">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle class="text-sm font-medium text-muted-foreground">
          {{ t('tax.summary.yields') }}
        </CardTitle>
        <PiggyBank class="h-4 w-4 text-blue-500" />
      </CardHeader>
      <CardContent>
        <div class="text-2xl font-bold" :class="{'text-blue-500': props.metrics.yields > 0}">
          {{ formatCurrency(props.metrics.yields) }}
        </div>
      </CardContent>
    </Card>

    <!-- Total Losses -->
    <Card class="bg-card/50 backdrop-blur-sm border-primary/10 hover:border-primary/30 transition-colors">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle class="text-sm font-medium text-muted-foreground">
          {{ t('tax.summary.total_losses') }}
        </CardTitle>
        <TrendingDown class="h-4 w-4 text-rose-500" />
      </CardHeader>
      <CardContent>
        <div class="text-2xl font-bold" :class="{'text-rose-500': props.metrics.totalLosses > 0}">
          {{ formatCurrency(props.metrics.totalLosses) }}
        </div>
      </CardContent>
    </Card>

    <!-- Estimated IRPF -->
    <Card class="bg-card/50 backdrop-blur-sm border-primary/10 hover:border-primary/30 transition-colors">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle class="text-sm font-medium text-muted-foreground">
          {{ t('tax.summary.estimated_irpf') }}
        </CardTitle>
        <Receipt class="h-4 w-4 text-amber-500" />
      </CardHeader>
      <CardContent>
        <div class="text-2xl font-bold text-amber-500">
          {{ formatCurrency(props.metrics.estimatedIrpf) }}
        </div>
      </CardContent>
    </Card>
  </div>
</template>
