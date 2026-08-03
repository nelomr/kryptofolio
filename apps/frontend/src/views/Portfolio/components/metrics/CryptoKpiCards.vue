<script setup lang="ts">
import { inject } from 'vue'
import { useQuery } from '@pinia/colada'
import { CRYPTO_METRICS_PORT_KEY } from '@/core/injectionKeys'
import KpiCard from './KpiCard.vue'
import { Skeleton } from '@/components/ui/skeleton'
import { useI18n } from '@/composables/useI18n'
import { formatCurrency } from '@/composables/useFormatters'

const { t } = useI18n()

// Inject port
const cryptoMetricsPort = inject(CRYPTO_METRICS_PORT_KEY)
if (!cryptoMetricsPort) {
  throw new Error('ICryptoMetricsPort not provided')
}

// Fetch data using Colada
const { data, isLoading, error } = useQuery({
  key: ['crypto-metrics', 'kpis'],
  query: () => cryptoMetricsPort.getKpis(),
})

// Format helpers
const formatFiat = (val?: number) => formatCurrency(val ?? 0)
const formatPercent = (val?: number) => {
  const v = val ?? 0
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
}
</script>

<template>
  <div v-if="isLoading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
    <!-- Same height and radius as a loaded KPI card, so the grid does not shift. -->
    <Skeleton v-for="i in 4" :key="i" class="h-40 w-full rounded-3xl" />
  </div>
  
  <div v-else-if="error" class="mb-6 p-6 bg-loss-soft text-loss rounded-3xl border border-loss-soft">
    {{ t('metrics.error_loading') }} {{ error.message }}
  </div>

  <section v-else-if="data" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
    <!-- 1. ROI / Equity -->
    <KpiCard
      :label="t('metrics.roi_total_label')"
      :topValue="formatPercent(data.totalRoiPercent)"
      :topValueClass="(data.totalRoiPercent ?? 0) > 0 ? 'text-profit' : 'text-loss'"
      :mainValue="formatFiat(data.totalRoiFiat ?? data.totalUnrealizedPnlFiat)"
      :mainValueClass="(data.totalRoiFiat ?? data.totalUnrealizedPnlFiat ?? 0) >= 0 ? 'text-profit' : 'text-loss'"
      :deltaValue="formatFiat(data.delta24hFiat)"
      :deltaDirection="(data.delta24hFiat ?? 0) >= 0 ? 'up' : 'down'"
      :deltaDesc="t('metrics.roi_delta_desc')"
      :subLabel="t('metrics.invested_label')"
      :subValue="formatFiat(data.investedFiat ?? data.totalCostBasisFiat)"
    />

    <!-- 2. Drawdown -->
    <KpiCard
      :label="t('metrics.max_drawdown_label')"
      :topValue="formatPercent(data.maxDrawdownPercent)"
      :topValueClass="'text-loss'"
      :mainValue="formatFiat(data.maxDrawdownFiat)"
      :mainValueClass="'text-loss'"
      :deltaValue="formatFiat(data.delta24hFiat)"
      :deltaDirection="(data.delta24hFiat ?? 0) >= 0 ? 'up' : 'down'"
      :deltaDesc="t('metrics.drawdown_delta_desc')"
      :subLabel="t('metrics.recovered_label')"
      :subValue="'+' + formatFiat(data.recoveredFiat)"
      subValueClass="text-profit"
    />

    <!-- 3. Win Rate -->
    <KpiCard
      :label="t('metrics.win_rate_label')"
      :topValue="`${(data.winRatePercent ?? 0).toFixed(1)}%`"
      :mainValue="`${(data.winRatePercent ?? 0).toFixed(2)}%`"
      :deltaValue="`${data.winningTrades ?? 0} ${t('metrics.trades_won')} · ${data.losingTrades ?? 0} ${t('metrics.trades_lost')}`"
      deltaDirection="up"
      :deltaDesc="`· ${data.totalTrades ?? 0} ${t('metrics.trades_total')}`"
      :subLabel="t('metrics.average_r_label')"
      :subValue="data.averageR && data.averageR > 0 ? `${data.averageR.toFixed(2)}x` : t('common.not_available')"
      subValueClass="text-profit"
    />

    <!-- 4. Best/Worst -->
    <KpiCard
      :label="t('metrics.best_worst_label')"
      :mainValue="data.bestAsset?.symbol && data.worstAsset?.symbol ? `${data.bestAsset.symbol} / ${data.worstAsset.symbol}` : t('common.not_available')"
      :subLabel="t('metrics.dispersion_label')"
      :subValue="`σ = ${(data.portfolioDispersion ?? data.annualizedVolatilityPercent ?? 0).toFixed(1)}%`"
    >
      <template #sparkline>
        <div v-if="data.bestAsset?.symbol && data.worstAsset?.symbol" class="flex flex-col gap-2 mt-2">
          <div class="flex justify-between items-center px-3 py-2 bg-profit-soft rounded-xl">
            <div>
              <p class="font-semibold text-[13px] font-sans tracking-wide">{{ data.bestAsset.symbol }}</p>
              <p class="font-medium text-[11px] font-mono text-muted tracking-wide">{{ data.bestAsset.name ?? data.bestAsset.symbol }} · {{ data.bestAsset.allocationPercent ?? 0 }}% {{ t('metrics.portfolio') }}</p>
            </div>
            <p class="font-bold text-lg font-mono text-profit">{{ formatPercent(data.bestAsset.roiPercent) }}</p>
          </div>
          <div class="flex justify-between items-center px-3 py-2 bg-loss-soft rounded-xl">
            <div>
              <p class="font-semibold text-[13px] font-sans tracking-wide">{{ data.worstAsset.symbol }}</p>
              <p class="font-medium text-[11px] font-mono text-muted tracking-wide">{{ data.worstAsset.name ?? data.worstAsset.symbol }} · {{ data.worstAsset.allocationPercent ?? 0 }}% {{ t('metrics.portfolio') }}</p>
            </div>
            <p class="font-bold text-lg font-mono text-loss">{{ formatPercent(data.worstAsset.roiPercent) }}</p>
          </div>
        </div>
      </template>
    </KpiCard>
  </section>
</template>
