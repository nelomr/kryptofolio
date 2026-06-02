<script setup lang="ts">
/**
 * ExpandedLotsTable — Component description.
 */

import { ref } from 'vue'
import { RefreshCw, MinusCircle, PlusCircle } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { CryptoIcon } from '@/components/common/CryptoIcon'
import LotEventHistory from './LotEventHistory.vue'
import ExpandedLotsSkeleton from './ExpandedLotsSkeleton.vue'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/composables/useFormatters'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const props = defineProps({
  assetSymbol: { type: String, required: true },
  assetAmount: { type: Number, required: true },
  assetCurrentValueEur: { type: Number, required: true },
  lots: { type: Array as () => any[], default: () => [] },
  tokenHistory: { type: Object as () => Record<string, any>, default: () => ({}) },
  isLoadingDetails: { type: Boolean, default: false }
})

const expandedLots = ref<Set<string>>(new Set())

const toggleLotHistory = (lotId: string) => {
  const next = new Set(expandedLots.value)
  next.has(lotId) ? next.delete(lotId) : next.add(lotId)
  expandedLots.value = next
}

const getLotHistory = (lotId: string) =>
  props.tokenHistory?.[lotId]?.history || []

const getLotStatus = (lotId: string) =>
  props.tokenHistory?.[lotId]?.status || null

const getLotBadgeVariant = (status: string) =>
  ({ EMPTY: 'profit', PARTIAL: 'outline', FULL: 'secondary' })[status as keyof typeof getLotBadgeVariant] || 'secondary'

const getLotStatusText = (status: string) => {
  const map: Record<string, string> = { EMPTY: t('lot_status.open'), PARTIAL: t('lot_status.partial'), FULL: t('lot_status.sold') }
  return map[status] || status
}

const isLotInLoss = (lot: any) => {
  if (!props.assetAmount || !props.assetCurrentValueEur) return false
  const currentPrice = props.assetCurrentValueEur / props.assetAmount
  return lot.unit_cost > currentPrice
}
</script>

<template>
  <div class="p-6 border-l-2 border-primary ml-10">
    <div class="flex items-center gap-2 mb-4">
      <h4 class="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">{{ t('expanded_lots.title') }}</h4>
      <RefreshCw v-if="isLoadingDetails" class="w-3 h-3 animate-spin text-muted-foreground" />
    </div>
    
    <Table class="bg-card/40 border border-border/50 rounded-lg overflow-hidden">
       <TableHeader>
          <TableRow class="hover:bg-transparent">
             <TableHead class="h-8 text-[9px] w-8"></TableHead>
             <TableHead class="h-8 text-[9px]">{{ t('expanded_lots.date') }}</TableHead>
             <TableHead class="h-8 text-[9px]">{{ t('expanded_lots.type_status') }}</TableHead>
             <TableHead class="h-8 text-[9px] text-right">{{ t('expanded_lots.orig_amount') }}</TableHead>
             <TableHead class="h-8 text-[9px] text-right">{{ t('expanded_lots.rest_amount') }}</TableHead>
             <TableHead class="h-8 text-[9px] text-right">{{ t('expanded_lots.location') }}</TableHead>
             <TableHead class="h-8 text-[9px] text-right">{{ t('expanded_lots.unit_cost') }}</TableHead>
             <TableHead class="h-8 text-[9px] text-right">{{ t('expanded_lots.total_cost') }}</TableHead>
          </TableRow>
       </TableHeader>
       <TableBody>
          <template v-if="isLoadingDetails">
             <ExpandedLotsSkeleton :count="3" />
          </template>
          <template v-else>
             <template v-if="lots.length">
                <template
                  v-for="lot in lots"
                  :key="lot.id"
                >
                   <TableRow :class="cn('hover:bg-transparent border-b border-border/5', lot.remaining_qty === 0 && 'opacity-40 grayscale')">
                       <TableCell class="py-2 w-10 pl-3">
                          <button
                            v-if="getLotHistory(lot.id).length"
                            @click="toggleLotHistory(lot.id)"
                            class="relative flex items-center justify-center p-1.5 rounded-full transition-all duration-300 hover:bg-primary/20 hover:shadow-[0_0_10px_rgba(var(--primary),0.3)] group/toggle"
                            :title="t('expanded_lots.view_history')"
                          >
                            <MinusCircle v-if="expandedLots.has(lot.id)" class="w-4 h-4 text-primary opacity-80 group-hover/toggle:opacity-100 transition-opacity" />
                            <PlusCircle v-else class="w-4 h-4 text-muted-foreground/50 group-hover/toggle:text-primary transition-colors" />
                          </button>
                       </TableCell>
                      <TableCell class="py-2 text-muted-foreground font-mono text-[10px]">{{ formatDate(lot.date) }}</TableCell>
                      <TableCell class="py-2">
                         <div class="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="secondary" class="text-[8px] bg-profit/10 text-profit border-none font-black tracking-widest uppercase">{{ t('tx_type.buy') }}</Badge>
                            <Badge
                              v-if="getLotStatus(lot.id)"
                              :variant="getLotBadgeVariant(getLotStatus(lot.id)) as any"
                              class="text-[8px] font-black uppercase tracking-widest border-none"
                            >{{ getLotStatusText(getLotStatus(lot.id)) }}</Badge>
                         </div>
                      </TableCell>
                      <TableCell class="py-2 text-right font-mono text-muted-foreground text-[10px] tabular-nums">{{ lot.original_qty.toFixed(4) }}</TableCell>
                      <TableCell class="py-2 text-right font-mono font-bold text-primary text-[10px] tabular-nums">
                         {{ lot.remaining_qty.toFixed(4) }}
                         <Badge v-if="lot.remaining_qty === 0" variant="outline" class="ml-2 text-[8px] tracking-widest uppercase opacity-70 border-muted">{{ t('lot_status.sold') }}</Badge>
                      </TableCell>
                      <TableCell class="py-2 text-right">
                         <div class="flex items-center justify-end gap-1.5">
                           <CryptoIcon :symbol="lot.exchange" :size="10" colored />
                           <span class="text-[9px] font-black uppercase tracking-tighter opacity-70">{{ lot.exchange || t('expanded_lots.unknown_exchange') }}</span>
                         </div>
                      </TableCell>
                      <TableCell class="py-2 text-right font-mono text-[10px] tabular-nums relative">
                         <div class="flex items-center justify-end gap-2">
                           <div v-if="isLotInLoss(lot) && lot.remaining_qty > 0" class="group/tooltip relative cursor-help flex items-center">
                             <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse block"></span>
                             <div class="absolute right-0 bottom-full mb-2 w-48 p-2.5 bg-popover border border-amber-500/30 rounded-lg shadow-xl text-[9px] text-popover-foreground opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-opacity z-50 normal-case font-sans tracking-normal leading-relaxed text-left">
                                 <span class="font-bold text-amber-500 block mb-1">{{ t('expanded_lots.ai_insight') }}</span>
                                 Este lote califica para <span class="font-bold">{{ t('expanded_lots.tax_loss') }}</span>{{ t('expanded_lots.tax_loss_desc') }}
                             </div>
                           </div>
                           {{ formatCurrency(lot.unit_cost) }}
                         </div>
                      </TableCell>
                      <TableCell class="py-2 text-right font-mono text-[10px] tabular-nums">{{ formatCurrency(lot.total_cost) }}</TableCell>
                   </TableRow>

                   <TableRow v-if="expandedLots.has(lot.id)" class="bg-muted/5 border-b border-primary/10">
                      <TableCell colspan="8" class="p-0">
                         <LotEventHistory :events="getLotHistory(lot.id)" />
                      </TableCell>
                   </TableRow>
                </template>
             </template>
             <TableRow v-else>
                <TableCell colspan="8" class="text-center py-10 text-muted-foreground/40 italic text-[10px] uppercase font-black tracking-widest">
                   {{ t('expanded_lots.no_lots') }}
                </TableCell>
             </TableRow>
          </template>
       </TableBody>
    </Table>
  </div>
</template>

