<script setup lang="ts">
import { inject } from 'vue'
import { useQuery } from '@pinia/colada'
import { CRYPTO_METRICS_REPO_KEY } from '@/core/injectionKeys'
import KpiCard from './KpiCard.vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

// Inject repository
const cryptoMetricsRepo = inject(CRYPTO_METRICS_REPO_KEY)
if (!cryptoMetricsRepo) {
  throw new Error('ICryptoMetricsRepository not provided')
}

// Fetch data using Colada
const { data, isLoading, error } = useQuery({
  key: ['crypto-metrics', 'kpis'],
  query: () => cryptoMetricsRepo.getKpis(),
})

// Format helpers
const formatFiat = (val: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(val)
}
const formatPercent = (val: number) => {
  return `${val > 0 ? '+' : ''}${val.toFixed(2)}%`
}
</script>

<template>
  <div v-if="isLoading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
    <!-- Skeleton loader -->
    <div v-for="i in 4" :key="i" class="h-40 bg-surface-2 animate-pulse rounded-3xl border border-border-soft"></div>
  </div>
  
  <div v-else-if="error" class="mb-6 p-6 bg-loss-soft text-loss rounded-3xl border border-loss-soft">
    {{ t('metrics.error_loading') }} {{ error.message }}
  </div>

  <section v-else-if="data" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
    <!-- 1. ROI -->
    <KpiCard
      :label="t('metrics.roi_total_label')"
      :topValue="formatPercent(data.totalRoiPercent)"
      :topValueClass="data.totalRoiPercent > 0 ? 'text-profit' : 'text-loss'"
      :mainValue="formatFiat(data.totalRoiFiat)"
      :mainValueClass="data.totalRoiFiat > 0 ? 'text-profit' : 'text-loss'"
      :deltaValue="formatFiat(data.delta24hFiat)"
      :deltaDirection="data.delta24hFiat > 0 ? 'up' : 'down'"
      :deltaDesc="t('metrics.roi_delta_desc')"
      :subLabel="t('metrics.invested_label')"
      :subValue="formatFiat(data.investedFiat)"
    />

    <!-- 2. Drawdown -->
    <KpiCard
      :label="t('metrics.max_drawdown_label')"
      :topValue="formatPercent(data.maxDrawdownPercent)"
      :topValueClass="'text-loss'"
      :mainValue="formatFiat(data.maxDrawdownFiat)"
      :mainValueClass="'text-loss'"
      :deltaValue="formatFiat(-1820.40)"
      :deltaDirection="'down'"
      :deltaDesc="t('metrics.drawdown_delta_desc')"
      :subLabel="t('metrics.recovered_label')"
      :subValue="'+' + formatFiat(data.recoveredFiat)"
      subValueClass="text-profit"
    />

    <!-- 3. Win Rate -->
    <KpiCard
      :label="t('metrics.win_rate_label')"
      :topValue="`${data.winRatePercent.toFixed(1)}%`"
      :mainValue="`${data.winRatePercent.toFixed(2)}%`"
      :deltaValue="`${data.winningTrades} ${t('metrics.trades_won')} · ${data.losingTrades} ${t('metrics.trades_lost')}`"
      deltaDirection="up"
      :deltaDesc="`· ${data.totalTrades} ${t('metrics.trades_total')}`"
      :subLabel="t('metrics.average_r_label')"
      :subValue="formatPercent(data.averageR)"
      subValueClass="text-profit"
    />

    <!-- 4. Best/Worst -->
    <KpiCard
      :label="t('metrics.best_worst_label')"
      :mainValue="`${data.bestAsset.symbol} / ${data.worstAsset.symbol}`"
      :subLabel="t('metrics.dispersion_label')"
      :subValue="`σ = ${data.portfolioDispersion.toFixed(1)}%`"
    >
      <template #sparkline>
        <div class="flex flex-col gap-2 mt-2">
          <div class="flex justify-between items-center px-3 py-2 bg-profit-soft rounded-xl">
            <div>
              <p class="font-semibold text-[13px] font-sans tracking-wide">{{ data.bestAsset.symbol }}</p>
              <p class="font-medium text-[11px] font-mono text-muted tracking-wide">{{ data.bestAsset.name }} · {{ data.bestAsset.allocationPercent }}% {{ t('metrics.portfolio') }}</p>
            </div>
            <p class="font-bold text-lg font-mono text-profit">{{ formatPercent(data.bestAsset.roiPercent) }}</p>
          </div>
          <div class="flex justify-between items-center px-3 py-2 bg-loss-soft rounded-xl">
            <div>
              <p class="font-semibold text-[13px] font-sans tracking-wide">{{ data.worstAsset.symbol }}</p>
              <p class="font-medium text-[11px] font-mono text-muted tracking-wide">{{ data.worstAsset.name }} · {{ data.worstAsset.allocationPercent }}% {{ t('metrics.portfolio') }}</p>
            </div>
            <p class="font-bold text-lg font-mono text-loss">{{ formatPercent(data.worstAsset.roiPercent) }}</p>
          </div>
        </div>
      </template>
    </KpiCard>
  </section>
</template>
