<script setup lang="ts">
/**
 * TokenActiveLots — Component description.
 */

import { formatCurrency, formatNumber, formatDate } from '@/composables/useFormatters'
import { Badge } from '@/components/ui/badge'
import type { TaxLotEntity } from '@/core/domain/models/FiscalEntities'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

defineProps<{
  lots: TaxLotEntity[]
}>()
</script>

<template>
  <section>
    <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
      <span class="w-2 h-2 rounded-full bg-primary shadow-[0_0_10px_var(--color-primary)] opacity-80"></span>
      {{ t('token.active_lots.title') }}
    </h3>
    <div class="overflow-x-auto rounded-lg border border-border/20 bg-muted/10 shadow-inner">
      <table class="w-full text-left text-sm">
        <thead class="bg-muted/30 text-muted-foreground border-b border-border/20 uppercase text-[10px] tracking-widest font-bold">
          <tr>
            <th class="px-4 py-3">{{ t('token.active_lots.date') }}</th>
            <th class="px-4 py-3 text-right">{{ t('token.active_lots.remaining_qty') }}</th>
            <th class="px-4 py-3 text-right">{{ t('token.active_lots.buy_price') }}</th>
            <th class="px-4 py-3 text-right">{{ t('token.active_lots.remaining_cost') }}</th>
            <th class="px-4 py-3 text-center">{{ t('token.active_lots.status') }}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border/10">
          <tr v-for="lot in lots" :key="lot.id" class="hover:bg-muted/20 transition-colors">
            <td class="px-4 py-3 text-muted-foreground">{{ formatDate(lot.date) }}</td>
            <td class="px-4 py-3 text-right font-mono text-foreground font-medium tabular-nums">{{ formatNumber(lot.remainingQty) }}</td>
            <td class="px-4 py-3 text-right font-mono text-muted-foreground tabular-nums">{{ formatCurrency(lot.unitCost) }}</td>
            <td class="px-4 py-3 text-right font-mono text-foreground font-semibold tabular-nums">{{ formatCurrency(lot.totalCost) }}</td>
            <td class="px-4 py-3 text-center">
                <Badge variant="outline" class="text-[9px] bg-profit/10 text-profit border-profit/20 uppercase tracking-widest border-none">{{ t('token.active_lots.in_portfolio') }}</Badge>
            </td>
          </tr>
          <tr v-if="lots.length === 0">
            <td colspan="5" class="px-4 py-8 text-center text-muted-foreground/60 italic text-[10px] uppercase font-black tracking-widest">{{ t('token.no_active_lots') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

