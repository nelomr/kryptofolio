<script setup lang="ts">
/**
 * MetricsRowSkeleton — Component description.
 */

import { Skeleton } from '@/components/ui/skeleton'
import MetricCard from '@/components/portfolio/MetricCard.vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
    <MetricCard :label="t('metrics.net_equity')" glowColor="via-primary/20">
      <Skeleton class="h-9 w-40 rounded-md mt-1 opacity-50" />
    </MetricCard>

    <MetricCard :label="t('metrics.unrealized_pnl')" glowColor="via-profit/20">
      <div class="flex flex-col gap-1.5 mt-1">
        <Skeleton class="h-9 w-32 rounded-md opacity-50" />
        <Skeleton class="h-3 w-12 rounded-md opacity-50" />
      </div>
    </MetricCard>

    <MetricCard :label="t('metrics.realized_pnl')" glowColor="via-primary/20">
      <Skeleton class="h-9 w-32 rounded-md mt-1 opacity-50" />
    </MetricCard>
  </div>
</template>
