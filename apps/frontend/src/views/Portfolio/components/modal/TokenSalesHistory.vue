<script setup lang="ts">
/**
 * TokenSalesHistory — Component description.
 */

import { formatCurrency, formatNumber, formatDate } from '@/composables/useFormatters'
import { Badge } from '@/components/ui/badge'
import type { TaxLotHistoryEvent } from '@/core/domain/models/FiscalEntities'
import { useI18n } from '@/composables/useI18n'
import { gainLossClass } from '@/views/TaxReport/composables/useTaxCalculations'

const { t } = useI18n()

defineProps<{
  history: TaxLotHistoryEvent[]
}>()
</script>

<template>
  <section>
    <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
      <span class="w-2 h-2 rounded-full bg-accent shadow-[0_0_10px_var(--color-accent)] opacity-80"></span>
      {{ t('token.sales_history.title') }}
    </h3>
    <div class="overflow-x-auto rounded-lg border border-border/20 bg-card shadow-inner">
      <table class="w-full text-left text-sm whitespace-nowrap">
        <thead class="bg-card text-muted-foreground border-b border-border/20 uppercase text-[10px] tracking-widest font-bold">
          <tr>
            <th class="px-4 py-3">{{ t('token.sales_history.date') }}</th>
            <th class="px-4 py-3 text-right">{{ t('token.sales_history.sold_qty') }}</th>
            <th class="px-4 py-3 text-right">{{ t('token.sales_history.sell_price') }}</th>
            <th class="px-4 py-3 text-right">{{ t('token.gain_loss') }}</th>
            <th class="px-4 py-3 text-center">{{ t('token.sales_history.type') }}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border/10">
          <tr v-for="disp in history" :key="disp.id" class="hover:bg-accent transition-colors">
            <td class="px-4 py-3 text-muted-foreground">{{ formatDate(disp.disposalDate) }}</td>
            <td class="px-4 py-3 text-right font-mono text-foreground font-medium tabular-nums">{{ formatNumber(disp.amountFromLot) }}</td>
            <td class="px-4 py-3 text-right font-mono text-muted-foreground tabular-nums">{{ formatCurrency(disp.salePriceEur) }}</td>
            <td class="px-4 py-3 text-right font-mono font-bold tabular-nums" :class="gainLossClass(disp.gainLossEur)">
              <span v-if="disp.gainLossEur !== null && disp.gainLossEur > 0">+</span>{{ formatCurrency(disp.gainLossEur) }}
            </td>
            <td class="px-4 py-3 text-center">
                <Badge variant="outline" class="text-[9px] bg-destructive/10 text-destructive border-destructive/20 uppercase tracking-widest border-none">{{ t('token.sales_history.sold') }}</Badge>
            </td>
          </tr>
          <tr v-if="history.length === 0">
            <td colspan="5" class="px-4 py-8 text-center text-muted-foreground/60 italic text-[10px] uppercase font-black tracking-widest">{{ t('token.no_sales_history') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

