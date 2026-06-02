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
    return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800";
  }
  if (t === "sell" || t === "withdrawal" || t === "fee") {
    return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800";
  }
  if (t === "swap" || t === "migration_swap") {
    return "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-800";
  }
  if (t === "transfer_in" || t === "transfer_out") {
    return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800";
  }
  return "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700";
}

function isWalletActivation(tx: TaxTransactionEntity): boolean {
  return tx.refId?.includes("WALLET_ACTIVATION") ?? false;
}
</script>

<template>
  <!-- Alucard-style card container — same structural UX as legacy -->
  <div
    class="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
  >
    <!-- Card Header -->
    <div
      class="flex items-center justify-between border-b border-border/60 bg-muted/30 px-6 py-4"
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
                class="cursor-pointer select-none hover:text-primary"
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
              <TableHead class="text-right">{{
                t("tax.col.amount")
              }}</TableHead>
              <!-- Sortable: Price -->
              <TableHead
                class="cursor-pointer select-none text-right hover:text-primary"
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
              class="group text-xs transition-colors"
            >
              <!-- Date -->
              <TableCell class="font-mono text-muted-foreground">
                {{ formatDate(tx.timestamp) }}
              </TableCell>

              <!-- Type badge (Wallet Activation special case — same as legacy) -->
              <TableCell>
                <Badge
                  v-if="isWalletActivation(tx)"
                  class="gap-1 border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-slate-100 text-slate-600 border-slate-300"
                  :title="'Reserva inmovilizada por la red (Activación)'"
                >
                  <Shield class="h-2.5 w-2.5" />
                  RESERVA
                </Badge>
                <Badge
                  v-else
                  class="border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest"
                  :class="getTypeBadgeClass(tx.type)"
                >
                  {{ tx.type }}
                </Badge>
              </TableCell>

              <!-- Asset (initial avatar — same UX as legacy) -->
              <TableCell>
                <div class="flex items-center gap-2">
                  <div
                    class="flex h-6 w-6 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-[10px] font-black text-primary"
                  >
                    {{ (tx.symbol || "?").substring(0, 1) }}
                  </div>
                  <span class="font-semibold text-foreground">{{
                    tx.symbol
                  }}</span>
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
                    class="text-primary hover:bg-primary/10"
                    :title="t('tax.col.actions')"
                    @click="emit('edit', tx)"
                  >
                    <Pencil class="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    class="text-destructive hover:bg-destructive/10"
                    :title="t('tax.delete.btn')"
                    @click="emit('delete', tx.id)"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>

            <!-- Empty state (same structure as legacy) -->
            <TableEmpty v-if="!paginatedTxs.length" :colspan="7">
              <div
                class="flex flex-col items-center gap-2 py-12 font-black uppercase tracking-widest text-muted-foreground"
              >
                <span
                  class="mb-2 rounded-2xl border border-border bg-muted/50 p-4 text-2xl"
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
