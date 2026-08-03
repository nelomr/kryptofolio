<script setup lang="ts">
/**
 * TaxTransactionsTable — Tax transactions table component.
 *
 * @see src/composables/queries/useTaxQueries.ts
 * @see src/views/TaxReport/composables/useTaxCalculations.ts
 */

import { computed, ref } from "vue";
import type {
  TaxTransactionEntity,
  TaxTransactionType,
} from "@/core/domain/models/FiscalEntities";
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
  Shield,
} from "lucide-vue-next";
import { useI18n } from "@/composables/useI18n";
import {
  formatCurrency,
  formatNumber,
  formatDate,
} from "@/composables/useFormatters";
import TaxPagination from "./TaxPagination.vue";
import { usePagination } from "../composables/useTaxCalculations";
import CryptoIcon from "@/components/common/CryptoIcon/CryptoIcon.vue";
import { getDeterministicHue, type CSSVars } from "@/lib/utils";

const { t } = useI18n();

// ---------------------------------------------------------------------------
// Props & Emits
// ---------------------------------------------------------------------------

const props = defineProps<{
  transactions: TaxTransactionEntity[];
  isLoading?: boolean;
}>();

const emit = defineEmits<{
  (e: "edit", tx: TaxTransactionEntity): void;
  (e: "delete", id: string): void;
}>();

// ---------------------------------------------------------------------------
// Sort state
// ---------------------------------------------------------------------------

type SortKey = "timestamp" | "priceEur";
const sortKey = ref<SortKey>("timestamp");
const sortOrder = ref<"asc" | "desc">("desc");

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = key;
    sortOrder.value = "desc";
  }
}

const sortedTransactions = computed(() => {
  const items = [...props.transactions];
  return items.sort((a, b) => {
    const aVal =
      sortKey.value === "timestamp"
        ? new Date(a.timestamp).getTime()
        : a.priceEur;
    const bVal =
      sortKey.value === "timestamp"
        ? new Date(b.timestamp).getTime()
        : b.priceEur;
    return sortOrder.value === "asc" ? aVal - bVal : bVal - aVal;
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

const {
  paginatedData,
  currentPage,
  totalPages,
  totalItems,
  rangeStart,
  rangeEnd,
  displayedPages,
  goToPage,
} = usePagination(sortedTransactions, 20);

const paginatedTxs = paginatedData as unknown as import("vue").ComputedRef<
  TaxTransactionEntity[]
>;

// ---------------------------------------------------------------------------
// Badge styling — mirrors legacy getTypeClass() with tailwind tokens
// ---------------------------------------------------------------------------

function getTypeBadgeClass(type: TaxTransactionType): string {
  const t = (type || "").toLowerCase();
  if (t === "buy" || t === "deposit" || t === "airdrop" || t === "reward") {
    return "bg-profit/10 text-profit border-none";
  }
  if (t === "sell" || t === "withdrawal" || t === "fee") {
    return "bg-loss/10 text-loss border-none";
  }
  if (t === "swap" || t === "migration_swap") {
    return "bg-info-soft text-info border-none";
  }
  if (t === "transfer_in" || t === "transfer_out") {
    return "bg-info-soft text-info border-none";
  }
  return "bg-background text-muted-foreground border-none";
}

function isWalletActivation(tx: TaxTransactionEntity): boolean {
  return tx.refId?.includes("WALLET_ACTIVATION") ?? false;
}

function getAssetTypeLabel(symbol: string | undefined): string {
  const s = (symbol || "").toLowerCase();
  return ["eur", "usd", "gbp", "chf"].includes(s)
    ? t("table.asset_type_fiat")
    : t("table.asset_type_crypto");
}
</script>

<template>
  <!-- Kryptofolio-style card container -->
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
        {{ t("tax.transactions.title") }}
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
              <TableHead>{{ t("tax.col.asset") }}</TableHead>
              <TableHead>Exchange</TableHead>
              <TableHead class="text-right">{{
                t("tax.col.amount")
              }}</TableHead>
              <!-- Sortable: Price -->
              <TableHead
                class="cursor-pointer select-none text-right hover:text-accent-foreground"
                @click="toggleSort('priceEur')"
              >
                <span class="flex items-center justify-end gap-1">
                  {{ t("tax.col.price") }}
                  <ChevronUp
                    v-if="sortKey === 'priceEur' && sortOrder === 'asc'"
                    class="h-3 w-3"
                  />
                  <ChevronDown
                    v-else-if="sortKey === 'priceEur'"
                    class="h-3 w-3"
                  />
                </span>
              </TableHead>
              <TableHead class="text-right">{{ t("tax.col.total") }}</TableHead>
              <TableHead class="text-right">{{
                t("tax.col.actions")
              }}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            <!-- Rows -->
            <TableRow
              v-for="tx in paginatedTxs"
              :key="tx.id"
              class="group text-xs"
            >
              <!-- Date -->
              <TableCell class="font-mono text-muted-foreground">
                {{ formatDate(tx.timestamp) }}
              </TableCell>

              <!-- Type badge (Wallet Activation special case — same as legacy) -->
              <TableCell>
                <Badge
                  v-if="isWalletActivation(tx)"
                  class="gap-1 border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-surface-3 text-muted border-border pointer-events-none"
                  :title="'Reserva inmovilizada por la red (Activación)'"
                >
                  <Shield class="h-2.5 w-2.5" />
                  RESERVA
                </Badge>
                <Badge
                  v-else
                  class="text-[8px] font-black uppercase tracking-widest pointer-events-none"
                  :class="getTypeBadgeClass(tx.type)"
                >
                  {{ tx.type.replace(/_/g, " ") }}
                </Badge>
              </TableCell>

              <!-- Asset (using CryptoIcon) -->
              <TableCell>
                <div class="flex items-center gap-3 py-1">
                  <CryptoIcon
                    :symbol="tx.symbol || 'generic'"
                    :size="32"
                    colored
                    class="bg-linear-to-r from-primary/20 to-primary/5 p-1 rounded-lg border border-primary/10"
                  />
                  <div>
                    <span class="font-black block text-sm tracking-tight">
                      {{ tx.symbol || "---" }}
                    </span>
                    <span
                      class="text-[9px] text-muted-foreground uppercase leading-none font-bold tracking-widest opacity-60"
                    >
                      {{ getAssetTypeLabel(tx.symbol) }}
                    </span>
                  </div>
                </div>
              </TableCell>

              <!-- Exchange (using LocationsCell badge style) -->
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

              <!-- Amount -->
              <TableCell class="text-right font-mono text-muted-foreground">
                {{ formatNumber(tx.amount) }}
              </TableCell>

              <!-- Price -->
              <TableCell class="text-right font-mono text-muted-foreground">
                {{ formatCurrency(tx.priceEur) }}
              </TableCell>

              <!-- Total — highlighted like legacy "indigo" column -->
              <TableCell
                class="text-right font-mono font-semibold text-primary"
              >
                {{ formatCurrency(tx.totalEur) }}
              </TableCell>

              <!-- Actions — revealed on hover, same UX as legacy -->
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
                    <Pencil class="h-3.5 w-3.5 cursor-pointer" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    class="text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                    :title="t('tax.delete.btn')"
                    @click="emit('delete', tx.id)"
                  >
                    <Trash2 class="h-3.5 w-3.5 cursor-pointer" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>

            <!-- Empty state (same structure as legacy) -->
            <TableEmpty v-if="!paginatedTxs.length" :colspan="8">
              <div
                class="flex flex-col items-center gap-2 py-12 font-black uppercase tracking-widest text-muted-foreground"
              >
                <span
                  class="mb-2 rounded-2xl border border-border bg-card p-4 text-2xl"
                  >📋</span
                >
                <span class="text-xs">{{ t("tax.transactions.empty") }}</span>
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
