<script setup lang="ts">
/**
 * LotEventHistory — Component description.
 */

import { ShieldCheck } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/composables/useFormatters'
import { useI18n } from '@/composables/useI18n'
import type { TaxLotHistoryEvent } from '@/core/domain/models/FiscalEntities'

const { t } = useI18n()

defineProps({
  events: { type: Array as () => TaxLotHistoryEvent[], required: true }
})

const getEventBadge = (event: TaxLotHistoryEvent): { variant: "secondary" | "profit" | "loss", label: string } => {
  if (event.flag === 'WALLET_ACTIVATION') return { variant: 'secondary', label: t('lot_events.badge_activation') };
  if (!event.isTaxable) return { variant: 'secondary', label: t('lot_events.badge_exempt') };
  return event.gainLossEur >= 0
    ? { variant: 'profit', label: t('lot_events.badge_gain') }
    : { variant: 'loss', label: t('lot_events.badge_loss') };
};
</script>

<template>
  <div class="border-l-2 border-primary/40 ml-12 bg-background/20">
    <Table>
       <TableHeader>
          <TableRow class="hover:bg-transparent">
             <TableHead class="h-7 text-[9px] text-muted-foreground/60 uppercase tracking-widest pl-4 font-black">{{ t('lot_events.date') }}</TableHead>
             <TableHead class="h-7 text-[9px] text-muted-foreground/60 uppercase tracking-widest font-black">{{ t('lot_events.concept') }}</TableHead>
             <TableHead class="h-7 text-[9px] text-muted-foreground/60 uppercase tracking-widest text-right font-black">{{ t('lot_events.affected_amount') }}</TableHead>
             <TableHead class="h-7 text-[9px] text-muted-foreground/60 uppercase tracking-widest text-right font-black">{{ t('lot_events.sell_price') }}</TableHead>
             <TableHead class="h-7 text-[9px] text-muted-foreground/60 uppercase tracking-widest text-right font-black">{{ t('lot_events.pnl') }}</TableHead>
             <TableHead class="h-7 text-[9px] text-muted-foreground/60 uppercase tracking-widest text-right font-black">{{ t('lot_events.notes') }}</TableHead>
          </TableRow>
       </TableHeader>
       <TableBody>
          <TableRow
            v-for="event in events"
            :key="event.id || event.disposalDate.toISOString()"
            :class="cn('border-b border-border/5', !event.isTaxable ? 'opacity-60' : 'hover:bg-muted/5')"
          >
             <TableCell class="py-2 font-mono text-[10px] text-muted-foreground pl-4">{{ formatDate(event.disposalDate) }}</TableCell>
             <TableCell class="py-2">
                <Badge :variant="getEventBadge(event).variant" class="text-[8px] font-black uppercase tracking-widest border-none">
                   {{ getEventBadge(event).label }}
                </Badge>
             </TableCell>
             <TableCell class="py-2 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                -{{ (event.amountFromLot || 0).toFixed(8) }}
             </TableCell>
             <TableCell class="py-2 text-right font-mono text-[10px] tabular-nums">{{ formatCurrency(event.salePriceEur) }}</TableCell>
             <TableCell
                class="py-2 text-right font-mono text-[10px] tabular-nums font-bold"
                :class="event.gainLossEur >= 0 ? 'text-profit' : 'text-loss'"
             >{{ formatCurrency(event.gainLossEur) }}</TableCell>
             <TableCell class="py-2 text-right">
                <div v-if="!event.isTaxable" class="group/tooltip relative inline-flex items-center justify-end cursor-help">
                   <ShieldCheck class="w-3.5 h-3.5 text-muted-foreground/50" />
                   <div class="absolute right-0 bottom-full mb-2 w-52 p-2.5 bg-popover border border-border/30 rounded-lg shadow-xl text-[9px] text-popover-foreground opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-opacity z-50 normal-case font-sans tracking-normal leading-relaxed text-left">
                      <span class="font-bold text-muted-foreground block mb-1">{{ t('lot_events.non_taxable') }}</span>
                      {{ t('lot_events.non_taxable_desc') }}
                   </div>
                </div>
                <span v-else-if="event.notes" class="text-[9px] font-mono text-muted-foreground/50 uppercase">{{ event.notes }}</span>
             </TableCell>
          </TableRow>
       </TableBody>
    </Table>
  </div>
</template>

