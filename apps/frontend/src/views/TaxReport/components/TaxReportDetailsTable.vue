<script setup lang="ts">
/**
 * TaxReportDetailsTable — FIFO lot traceability audit table (presentational).
 *
 * Renders the `auditTrail` of a TaxReportEntity as a full-width table with:
 *   - Enriched cells (Asset logos, Exchange logos, Operation badges)
 *   - Skeleton loading states
 *   - Fluid empty state
 *   - Pagination via usePagination composable
 *
 * All text is driven by i18n translation strings. No API calls — fully dumb.
 */

import { computed } from 'vue'
import type { TaxLotHistoryEvent, TaxTransactionType } from '@/core/domain/models/FiscalEntities'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableEmpty,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { BookOpenCheck, Archive } from 'lucide-vue-next'
import { useI18n } from '@/composables/useI18n'
import { formatCurrency, formatNumber, formatDateNumeric } from '@/composables/useFormatters'
import {
  usePagination,
  gainLossClass,
} from '../composables/useTaxCalculations'
import TaxPagination from './TaxPagination.vue'
import CryptoIcon from '@/components/common/CryptoIcon/CryptoIcon.vue'
import { getDeterministicHue, type CSSVars } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const props = defineProps<{
  /** The FIFO audit trail events to display */
  auditTrail: TaxLotHistoryEvent[]
  /** Whether data is being fetched or recalculated */
  isLoading?: boolean
}>()

// ---------------------------------------------------------------------------
// i18n & pagination
// ---------------------------------------------------------------------------

const { t } = useI18n()

const {
  paginatedData,
  currentPage,
  totalPages,
  totalItems,
  rangeStart,
  rangeEnd,
  displayedPages,
  goToPage,
} = usePagination(computed(() => props.auditTrail), 20)

// Typed cast: usePagination returns ComputedRef<unknown[]> to stay generic
const paginatedEvents = paginatedData as unknown as import('vue').ComputedRef<TaxLotHistoryEvent[]>

// ---------------------------------------------------------------------------
// Operation Badge Map
// ---------------------------------------------------------------------------
const BADGE_VARIANTS = {
  positive: 'bg-profit/10 text-profit border-none',
  negative: 'bg-loss/10 text-loss border-none',
  warning: 'bg-warning-soft text-warning border-none',
  neutral: 'bg-info-soft text-info border-none',
  default: 'bg-background text-muted-foreground border-none',
} as const

const OPERATION_THEMES: Record<TaxTransactionType, keyof typeof BADGE_VARIANTS> = {
  BUY: 'positive',
  DEPOSIT: 'positive',
  TRANSFER_IN: 'positive',
  AIRDROP: 'positive',
  REWARD: 'positive',
  
  SELL: 'negative',
  WITHDRAWAL: 'negative',
  TRANSFER_OUT: 'negative',
  FEE: 'negative',
  
  SWAP: 'neutral',
  MIGRATION_SWAP: 'neutral',
  FUTURES_TRADE: 'neutral',
  FUTURES_FUNDING: 'neutral',
  
  UNKNOWN: 'default',
}

function getOperationBadgeColor(type?: TaxTransactionType | string): string {
  const theme = type ? OPERATION_THEMES[type as TaxTransactionType] : undefined
  return BADGE_VARIANTS[theme ?? 'default']
}

function getAssetTypeLabel(symbol: string | undefined): string {
  const s = (symbol || "").toLowerCase();
  return ["eur", "usd", "gbp", "chf"].includes(s) ? t("table.asset_type_fiat") : t("table.asset_type_crypto");
}
</script>

<template>
  <div class="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
    <!-- Card Header -->
    <div class="flex items-center justify-between border-b border-border bg-card px-6 py-4">
      <h3 class="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
        <BookOpenCheck class="h-3.5 w-3.5 text-muted-foreground" />
        {{ t('tax.audit.table_title') }}
      </h3>
      <span
        v-if="!isLoading && auditTrail.length > 0"
        class="text-[10px] font-black uppercase text-muted-foreground"
      >
        {{ t('tax.entries') }}: {{ auditTrail.length }}
      </span>
    </div>

    <!-- Loading skeleton -->
    <div v-if="isLoading" class="space-y-2 p-6">
      <p class="mb-4 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {{ t('tax.audit.table_loading') }}
      </p>
      <Skeleton v-for="i in 8" :key="i" class="h-10 w-full rounded" />
    </div>

    <!-- Table -->
    <template v-else>
      <div class="min-h-[300px] overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow class="text-[10px] uppercase tracking-widest">
              <TableHead>{{ t('tax.audit.col_date') }}</TableHead>
              <TableHead>{{ t('tax.audit.col_operation') }}</TableHead>
              <TableHead>{{ t('tax.audit.col_asset') }}</TableHead>
              <TableHead>{{ t('tax.audit.col_exchange') }}</TableHead>
              <TableHead class="text-right">{{ t('tax.audit.col_sale_price') }}</TableHead>
              <TableHead class="text-right">{{ t('tax.audit.col_gain_loss') }}</TableHead>
              <TableHead class="text-right">{{ t('tax.audit.col_fee') }}</TableHead>
              <TableHead>{{ t('tax.audit.col_notes') }}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            <TableRow
              v-for="event in paginatedEvents"
              :key="event.id"
              :class="['group text-xs transition-colors']"
            >
              <TableCell class="font-mono text-muted-foreground">
                {{ formatDateNumeric(event.disposalDate) }}
              </TableCell>

              <!-- Operation Type Badge -->
              <TableCell>
                <Badge :class="['text-[8px] font-black uppercase tracking-widest pointer-events-none', getOperationBadgeColor(event.operationType)]">
                  {{ (event.operationType || 'UNKNOWN').replace(/_/g, ' ') }}
                </Badge>
              </TableCell>

              <!-- Enriched Asset Cell -->
              <TableCell>
                <div class="flex items-center gap-3 py-1">
                  <CryptoIcon 
                    :symbol="event.assetSymbol || 'generic'" 
                    :size="32" 
                    colored
                    class="bg-linear-to-r from-primary/20 to-primary/5 p-1 rounded-lg border border-primary/10"
                  />
                  <div>
                    <span class="font-black block text-sm tracking-tight">
                      {{ event.assetSymbol || '---' }}
                    </span>
                    <span class="text-[9px] text-muted-foreground uppercase leading-none font-bold tracking-widest opacity-60">
                      {{ formatNumber(event.amountFromLot) }} {{ getAssetTypeLabel(event.assetSymbol) }}
                    </span>
                  </div>
                </div>
              </TableCell>

              <!-- Enriched Exchange Cell -->
              <TableCell>
                <div v-if="event.exchangeName" class="flex items-center justify-start">
                  <Badge
                    variant="outline"
                    class="text-[8px] font-black uppercase tracking-widest border transition-colors flex items-center gap-1.5 text-[hsl(var(--badge-hue),75%,35%)] bg-[hsla(var(--badge-hue),80%,50%,0.12)] border-[hsla(var(--badge-hue),80%,50%,0.2)] pointer-events-none"
                    :style="{ '--badge-hue': getDeterministicHue(event.exchangeName) } as CSSVars"
                  >
                    <CryptoIcon :symbol="event.exchangeName" :size="10" colored />
                    {{ event.exchangeName }}
                  </Badge>
                </div>
                <div v-else class="text-[9px] font-black uppercase tracking-tighter opacity-30">
                  ---
                </div>
              </TableCell>

              <TableCell class="text-right font-mono text-muted-foreground">
                {{ formatCurrency(event.salePriceEur) }}
              </TableCell>

              <!-- Gain / Loss -->
              <TableCell :class="['text-right font-mono font-semibold', gainLossClass(event.gainLossEur)]">
                {{ formatCurrency(event.gainLossEur) }}
              </TableCell>

              <TableCell class="text-right font-mono text-muted-foreground">
                {{ event.saleFeeEur != null ? formatCurrency(event.saleFeeEur) : '—' }}
              </TableCell>

              <TableCell
                class="max-w-[180px] truncate text-[10px] text-muted-foreground"
                :title="event.notes ?? ''"
              >
                {{ event.notes ?? '—' }}
              </TableCell>
            </TableRow>

            <!-- Empty state -->
            <TableEmpty v-if="!paginatedEvents.length" :colspan="8">
              <div class="flex flex-col items-center gap-2 py-12 font-black uppercase tracking-widest text-muted-foreground">
                <span class="mb-2 rounded-2xl border border-border bg-card p-4">
                  <Archive class="h-8 w-8 text-muted-foreground/50" />
                </span>
                <span class="text-xs">{{ t('tax.audit.table_empty') }}</span>
              </div>
            </TableEmpty>
          </TableBody>
        </Table>
      </div>

      <!-- Pagination footer -->
      <div v-if="totalItems > 20" class="border-t border-border/60">
        <TaxPagination
          :current-page="currentPage"
          :total-pages="totalPages"
          :total-items="totalItems"
          :range-start="rangeStart"
          :range-end="rangeEnd"
          :displayed-pages="displayedPages"
          @page-change="goToPage"
        />
      </div>
    </template>
  </div>
</template>
