<script setup lang="ts">
/**
 * PerformanceCell — Component description.
 */

import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPercent } from '@/composables/useFormatters'
import type { CryptoAssetEntity } from '@/core/domain/models/PortfolioEntities'

const props = defineProps<{ row: CryptoAssetEntity }>()

const pnlRaw = computed(() => props.row.unrealizedPnlFiat || props.row.pnlFiat || 0)
const basis = computed(() => props.row.costBasisFiat || 0)
const pct = computed(() => basis.value > 0 ? (pnlRaw.value / basis.value) * 100 : 0)

const tClass = computed(() => 
  pct.value >= 0 ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'
)
</script>

<template>
  <div class="flex flex-col items-end gap-1">
    <span class="font-mono font-bold text-xs tabular-nums">
      {{ formatCurrency(pnlRaw, props.row.currency) }}
    </span>
    <Badge 
      variant="secondary" 
      :class="['text-[9px] font-black tracking-widest border-none px-1.5 py-0', tClass]"
    >
      {{ formatPercent(pct) }}
    </Badge>
  </div>
</template>

