<script setup lang="ts">
/**
 * TaxDerivativesTable — Specialized table for Futures/Derivatives transactions.
 *
 * Logic (sort, pagination, badge helpers) lives in useDerivativesTable.ts.
 * This file is responsible for the template only.
 *
 * AEAT Compliance: PnL is highlighted as the key fiscal event.
 *
 * @see src/views/TaxReport/composables/useDerivativesTable.ts
 * @see src/core/domain/models/FiscalEntities.ts (TaxDerivativeEntity)
 */

import { computed } from "vue";
import type { TaxDerivativeEntity } from "@/core/domain/models/FiscalEntities";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableEmpty,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  TrendingUp,
  TrendingDown,
} from "lucide-vue-next";
import { useI18n } from "@/composables/useI18n";
import {
  formatCurrency,
  formatNumber,
  formatDate,
} from "@/composables/useFormatters";
import CryptoIcon from "@/components/common/CryptoIcon/CryptoIcon.vue";
import { getDeterministicHue, type CSSVars } from "@/lib/utils";
import TaxPagination from "./TaxPagination.vue";
import {
  useDerivativesSort,
  useDerivativesPagination,
  getTypeBadgeClass,
  getPnlClass,
  getStatusBadgeClass,
  getNetImpact,
  formatContractName,
} from "../composables/useDerivativesTable";

const { t } = useI18n();

const props = defineProps<{
  transactions: TaxDerivativeEntity[];
  isLoading?: boolean;
}>();

const emit = defineEmits<{
  (e: "edit", tx: TaxDerivativeEntity): void;
  (e: "delete", id: string): void;
}>();

// Expose computed source so composables can react to prop changes
const txRef = computed(() => props.transactions);

const { sortKey, sortOrder, toggleSort, sorted } = useDerivativesSort(txRef);
const {
  paginatedTxs,
  currentPage,
  totalPages,
  totalItems,
  rangeStart,
  rangeEnd,
  displayedPages,
  goToPage,
} = useDerivativesPagination(sorted);
</script>

<template>
  <div
    class="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
  >
    <!-- Card Header -->
    <div
      class="flex items-center justify-between border-b border-border bg-card px-6 py-4"
    >
      <h3
        class="text-xs font-black uppercase tracking-widest text-muted-foreground"
      >
        {{ t("tax.derivatives.title") }}
      </h3>
      <span
        v-if="!isLoading && transactions.length > 0"
        class="text-[10px] font-black uppercase text-muted-foreground"
      >
        {{ t("tax.entries") }}: {{ transactions.length }}
      </span>
    </div>

    <!-- Loading skeleton -->
    <div v-if="isLoading" class="space-y-2 p-6">
      <Skeleton v-for="i in 8" :key="i" class="h-10 w-full rounded" />
    </div>

    <!-- Table -->
    <template v-else>
      <div class="min-h-[300px] overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow class="text-[10px] uppercase tracking-widest">
              <!-- Sortable: Date -->
              <TableHead
                class="cursor-pointer select-none hover:text-accent-foreground"
                @click="toggleSort('timestamp')"
              >
                <span class="flex items-center gap-1">
                  {{ t("tax.col.date") }}
                  <ChevronUp
                    v-if="sortKey === 'timestamp' && sortOrder === 'asc'"
                    class="h-3 w-3"
                  />
                  <ChevronDown
                    v-else-if="sortKey === 'timestamp'"
                    class="h-3 w-3"
                  />
                </span>
              </TableHead>
              <TableHead>{{ t("tax.col.type") }}</TableHead>
              <TableHead>{{ t("tax.col.contract") }}</TableHead>
              <TableHead class="text-right">{{
                t("tax.col.amount")
              }}</TableHead>
              <TableHead class="text-right">{{
                t("tax.col.trade_price")
              }}</TableHead>
              <!-- Sortable: PnL -->
              <TableHead
                class="cursor-pointer select-none text-right hover:text-accent-foreground"
                @click="toggleSort('realizedPnl')"
              >
                <span class="flex items-center justify-end gap-1">
                  {{ t("tax.col.pnl") }}
                  <ChevronUp
                    v-if="sortKey === 'realizedPnl' && sortOrder === 'asc'"
                    class="h-3 w-3"
                  />
                  <ChevronDown
                    v-else-if="sortKey === 'realizedPnl'"
                    class="h-3 w-3"
                  />
                </span>
              </TableHead>
              <TableHead class="text-right">{{
                t("tax.col.fees_funding")
              }}</TableHead>
              <TableHead>Exchange</TableHead>
              <TableHead>{{ t("tax.col.status") }}</TableHead>
              <TableHead class="text-right">{{
                t("tax.col.actions")
              }}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            <TableRow
              v-for="tx in paginatedTxs"
              :key="tx.id"
              class="group text-xs"
            >
              <!-- Date -->
              <TableCell class="font-mono text-muted-foreground">{{
                formatDate(tx.timestamp)
              }}</TableCell>

              <!-- Type badge -->
              <TableCell>
                <Badge
                  class="text-[8px] font-black uppercase tracking-widest pointer-events-none"
                  :class="getTypeBadgeClass(tx.type)"
                >
                  {{ tx.type.replace(/_/g, " ") }}
                </Badge>
              </TableCell>

              <!-- Contract + CryptoIcon -->
              <TableCell>
                <div class="flex items-center gap-3 py-1">
                  <CryptoIcon
                    :symbol="tx.underlyingAsset || 'generic'"
                    :size="32"
                    colored
                    class="bg-linear-to-r from-primary/20 to-primary/5 p-1 rounded-lg border border-primary/10"
                  />
                  <div>
                    <span class="font-black block text-sm tracking-tight">{{
                      formatContractName(tx.contractSymbol)
                    }}</span>
                    <span
                      class="text-[9px] text-muted-foreground uppercase leading-none font-bold tracking-widest opacity-60"
                    >
                      {{ tx.underlyingAsset.toUpperCase() }}
                    </span>
                  </div>
                </div>
              </TableCell>

              <!-- Amount -->
              <TableCell class="text-right font-mono text-muted-foreground">
                {{ tx.amount !== 0 ? formatNumber(tx.amount) : "---" }}
              </TableCell>

              <!-- Trade Price -->
              <TableCell class="text-right font-mono text-muted-foreground">
                {{
                  tx.tradePrice !== 0 ? formatCurrency(tx.tradePrice) : "---"
                }}
              </TableCell>

              <!-- PnL — AEAT taxable event highlight -->
              <TableCell class="text-right">
                <span
                  :class="getPnlClass(tx.realizedPnl)"
                  class="flex items-center justify-end gap-1"
                >
                  <TrendingUp
                    v-if="tx.realizedPnl > 0"
                    class="h-3 w-3 text-profit"
                  />
                  <TrendingDown
                    v-else-if="tx.realizedPnl < 0"
                    class="h-3 w-3 text-loss"
                  />
                  {{ formatCurrency(tx.realizedPnl) }}
                </span>
              </TableCell>

              <!-- Fees + Funding (net impact + breakdown) -->
              <TableCell class="text-right">
                <span
                  :class="
                    getNetImpact(tx) >= 0
                      ? 'text-profit font-mono text-xs'
                      : 'text-loss font-mono text-xs'
                  "
                  class="block"
                >
                  {{ formatCurrency(getNetImpact(tx)) }}
                </span>
                <span
                  v-if="tx.fees !== 0 || tx.funding !== 0"
                  class="text-[9px] text-muted-foreground opacity-60 block"
                >
                  f:{{ formatCurrency(tx.fees) }} / r:{{
                    formatCurrency(tx.funding)
                  }}
                </span>
              </TableCell>

              <!-- Exchange badge -->
              <TableCell>
                <div v-if="tx.exchange" class="flex items-center justify-start">
                  <Badge
                    variant="outline"
                    class="text-[8px] font-black uppercase tracking-widest border transition-colors flex items-center gap-1.5 text-[hsl(var(--badge-hue),75%,35%)] bg-[hsla(var(--badge-hue),80%,50%,0.12)] border-[hsla(var(--badge-hue),80%,50%,0.2)] pointer-events-none"
                    :style="
                      { '--badge-hue': getDeterministicHue(tx.exchange) } as CSSVars
                    "
                  >
                    <CryptoIcon :symbol="tx.exchange" :size="14" colored />
                    {{ tx.exchange }}
                  </Badge>
                </div>
                <div
                  v-else
                  class="text-[9px] font-black uppercase tracking-tighter opacity-30"
                >
                  ---
                </div>
              </TableCell>

              <!-- Status badge -->
              <TableCell>
                <Badge
                  v-if="tx.status"
                  class="text-[8px] font-black uppercase tracking-widest pointer-events-none"
                  :class="getStatusBadgeClass(tx.status)"
                >
                  {{ tx.status }}
                </Badge>
                <span
                  v-else
                  class="text-[9px] font-black uppercase tracking-tighter opacity-30"
                  >---</span
                >
              </TableCell>

              <!-- Actions (revealed on row hover) -->
              <TableCell class="text-right">
                <div
                  class="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    class="text-primary hover:bg-accent hover:text-accent-foreground cursor-pointer"
                    :title="t('tax.col.actions')"
                    @click="emit('edit', tx)"
                  >
                    <Pencil class="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    class="text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                    :title="t('tax.delete.btn')"
                    @click="emit('delete', tx.id)"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>

            <!-- Empty state -->
            <TableEmpty v-if="!paginatedTxs.length" :colspan="10">
              <div
                class="flex flex-col items-center gap-2 py-12 font-black uppercase tracking-widest text-muted-foreground"
              >
                <span
                  class="mb-2 rounded-2xl border border-border bg-card p-4 text-2xl"
                  >📈</span
                >
                <span class="text-xs">{{ t("tax.derivatives.empty") }}</span>
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
