<script setup lang="ts">
/**
 * ExpandedLotsTable — Component description.
 */

import { ref } from "vue";
import { RefreshCw, MinusCircle, PlusCircle } from "lucide-vue-next";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CryptoIcon } from "@/components/common/CryptoIcon";
import LotEventHistory from "./LotEventHistory.vue";
import ExpandedLotsSkeleton from "./ExpandedLotsSkeleton.vue";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/composables/useFormatters";
import { useI18n } from "@/composables/useI18n";
import {
  hasTrustworthyBasis,
  qualityFlagExplanationKey,
  qualityFlagLabelKey,
  qualityFlagSeverity,
  severityDotClass,
  SEVERITY_CLASSES,
} from "@/views/TaxReport/composables/useTaxCalculations";
import type { FlagSeverity, TaxLotStatus } from "@kryptofolio/shared-types";
import type {
  LotRelocationEntity,
  TaxLotEntity,
  TaxLotHistoryEvent,
} from "@/core/domain/models/FiscalEntities";

const { t } = useI18n();

const props = defineProps({
  assetSymbol: { type: String, required: true },
  assetAmount: { type: Number, default: 0 },
  assetCurrentValueEur: { type: Number, default: 0 },
  lots: { type: Array as () => TaxLotEntity[], default: () => [] },
  tokenHistory: {
    type: Object as () => Record<string, TaxLotHistoryEvent[]>,
    default: () => ({}),
  },
  tokenRelocations: {
    type: Object as () => Record<string, LotRelocationEntity[]>,
    default: () => ({}),
  },
  isLoadingDetails: { type: Boolean, default: false },
});

const expandedLots = ref<Set<string>>(new Set());

const toggleLotHistory = (lotId: string) => {
  const next = new Set(expandedLots.value);
  next.has(lotId) ? next.delete(lotId) : next.add(lotId);
  expandedLots.value = next;
};

const getLotHistory = (lotId: string) => props.tokenHistory?.[lotId] || [];
const getLotRelocations = (lotId: string) => props.tokenRelocations?.[lotId] || [];

// A lot that only ever moved still has a history worth opening, so the affordance cannot be keyed on
// disposals alone.
const hasTimeline = (lotId: string) =>
  getLotHistory(lotId).length > 0 || getLotRelocations(lotId).length > 0;

const LOT_STATUS_LABEL: Record<TaxLotStatus, string> = {
  OPEN: "lot_status.open",
  PARTIAL: "lot_status.partial",
  CLOSED: "lot_status.closed",
};

// `profit` is deliberately absent: a lot's status says how much of it is left, not whether holding
// it was profitable, and colouring it green was how a sold lot came to read as an open gain.
const LOT_STATUS_VARIANT: Record<TaxLotStatus, "outline" | "secondary"> = {
  OPEN: "outline",
  PARTIAL: "outline",
  CLOSED: "secondary",
};

const isLotInLoss = (lot: TaxLotEntity) => {
  if (!hasTrustworthyBasis(lot)) return false;
  if (!props.assetAmount || !props.assetCurrentValueEur) return false;
  const currentPrice = props.assetCurrentValueEur / props.assetAmount;
  return lot.unitCost > currentPrice;
};

/** Severity of the lot's own defect, or `null` when its basis needs no caveat. */
const lotDefectSeverity = (lot: TaxLotEntity): FlagSeverity | null => {
  if (lot.qualityFlag) return qualityFlagSeverity(lot.qualityFlag);
  // An unflagged non-positive basis still cannot support a judgement, and the user is owed a reason.
  return hasTrustworthyBasis(lot) ? null : "medium";
};

const lotDefectLabelKey = (lot: TaxLotEntity) =>
  lot.qualityFlag
    ? qualityFlagLabelKey(lot.qualityFlag)
    : "fifo_quality.unresolved_basis.label";

const lotDefectExplanationKey = (lot: TaxLotEntity) =>
  lot.qualityFlag
    ? qualityFlagExplanationKey(lot.qualityFlag)
    : "fifo_quality.unresolved_basis.explanation";

/** Accounts holding part of the lot now, once the acquiring venue alone no longer describes it. */
const custodyOf = (lot: TaxLotEntity) => lot.currentLocations ?? [];
</script>

<template>
  <div class="p-6 border-l-2 border-primary ml-10">
    <div class="flex items-center gap-2 mb-4">
      <h4
        class="text-[10px] uppercase font-bold text-muted-foreground tracking-widest"
      >
        {{ t("expanded_lots.title") }}
      </h4>
      <RefreshCw
        v-if="isLoadingDetails"
        class="w-3 h-3 animate-spin text-muted-foreground"
      />
    </div>

    <Table class="bg-card border border-border/50 rounded-lg overflow-hidden">
      <TableHeader>
        <TableRow class="hover:bg-transparent">
          <TableHead class="h-8 text-[9px] w-8"></TableHead>
          <TableHead class="h-8 text-[9px]">{{
            t("expanded_lots.date")
          }}</TableHead>
          <TableHead class="h-8 text-[9px]">{{
            t("expanded_lots.type_status")
          }}</TableHead>
          <TableHead class="h-8 text-[9px] text-right">{{
            t("expanded_lots.orig_amount")
          }}</TableHead>
          <TableHead class="h-8 text-[9px] text-right">{{
            t("expanded_lots.rest_amount")
          }}</TableHead>
          <TableHead class="h-8 text-[9px] text-right">{{
            t("expanded_lots.location")
          }}</TableHead>
          <TableHead class="h-8 text-[9px] text-right">{{
            t("expanded_lots.unit_cost")
          }}</TableHead>
          <TableHead class="h-8 text-[9px] text-right">{{
            t("expanded_lots.total_cost")
          }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <template v-if="isLoadingDetails">
          <ExpandedLotsSkeleton :count="3" />
        </template>
        <template v-else>
          <template v-if="lots.length">
            <template v-for="lot in lots" :key="lot.id">
              <TableRow
                data-testid="lot-row"
                :class="
                  cn(
                    'border-b border-border/5 transition-colors',
                    lot.status === 'CLOSED' && 'opacity-40 grayscale',
                  )
                "
              >
                <TableCell class="py-2 w-10 pl-3">
                  <button
                    v-if="hasTimeline(lot.id)"
                    @click="toggleLotHistory(lot.id)"
                    class="relative flex items-center justify-center p-1.5 rounded-full transition-all duration-300 hover:bg-primary/20 hover:shadow-[0_0_10px_rgba(var(--primary),0.3)] group/toggle"
                    :title="t('expanded_lots.view_history')"
                  >
                    <MinusCircle
                      v-if="expandedLots.has(lot.id)"
                      class="w-4 h-4 text-primary opacity-80 group-hover/toggle:opacity-100 transition-opacity"
                    />
                    <PlusCircle
                      v-else
                      class="w-4 h-4 text-muted-foreground/50 group-hover/toggle:text-primary transition-colors"
                    />
                  </button>
                </TableCell>
                <TableCell
                  class="py-2 text-muted-foreground font-mono text-[10px]"
                  >{{ formatDate(lot.date) }}</TableCell
                >
                <TableCell class="py-2">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <Badge
                      variant="secondary"
                      class="text-[8px] bg-profit/10 text-profit border-none font-black tracking-widest uppercase"
                      >{{ t("tx_type.buy") }}</Badge
                    >
                    <Badge
                      data-testid="lot-status-badge"
                      :variant="LOT_STATUS_VARIANT[lot.status]"
                      class="text-[8px] font-black uppercase tracking-widest border-none"
                      >{{ t(LOT_STATUS_LABEL[lot.status]) }}</Badge
                    >
                  </div>
                </TableCell>
                <TableCell
                  class="py-2 text-right font-mono text-muted-foreground text-[10px] tabular-nums"
                  >{{ lot.originalQty.toFixed(4) }}</TableCell
                >
                <TableCell
                  class="py-2 text-right font-mono font-bold text-foreground text-[10px] tabular-nums"
                >
                  {{ lot.remainingQty.toFixed(4) }}
                  <Badge
                    v-if="lot.status === 'CLOSED'"
                    variant="outline"
                    class="ml-2 text-[8px] tracking-widest uppercase opacity-70 border-muted"
                    >{{ t("lot_status.closed") }}</Badge
                  >
                </TableCell>
                <TableCell class="py-2 text-right">
                  <div class="flex flex-col items-end gap-1">
                    <div
                      data-testid="lot-acquired-at"
                      class="flex items-center justify-end gap-1.5"
                      :title="t('custody.acquired_at')"
                    >
                      <CryptoIcon :symbol="lot.exchange" :size="14" colored />
                      <span
                        class="text-[9px] font-black uppercase tracking-tighter opacity-70"
                        >{{
                          lot.exchange || t("expanded_lots.unknown_exchange")
                        }}</span
                      >
                    </div>

                    <!-- The lot never moves; its quantity does. Both facts are shown. -->
                    <div
                      v-if="custodyOf(lot).length"
                      data-testid="lot-custody"
                      class="flex flex-col items-end gap-0.5"
                    >
                      <span
                        class="text-[8px] uppercase tracking-widest text-muted-foreground"
                        >{{ t("custody.held_in") }}</span
                      >
                      <div
                        v-for="location in custodyOf(lot)"
                        :key="location.accountId"
                        data-testid="lot-custody-entry"
                        :data-synthetic="String(location.isSynthetic)"
                        :data-sub-wallet="String(location.parentAccountId !== null)"
                        class="flex items-center justify-end gap-1.5"
                      >
                        <span
                          class="font-mono text-[9px] tabular-nums text-muted-foreground"
                          >{{ location.qty }}</span
                        >
                        <span class="text-[9px] tracking-tighter">{{
                          location.accountName
                        }}</span>
                        <Badge
                          v-if="location.isSynthetic"
                          variant="outline"
                          class="text-[7px] uppercase tracking-widest border-muted text-muted-foreground"
                          :title="t('custody.synthetic_desc')"
                          >{{ t("custody.synthetic") }}</Badge
                        >
                        <Badge
                          v-else-if="location.parentAccountId !== null"
                          variant="secondary"
                          class="text-[7px] uppercase tracking-widest"
                          :title="t('custody.sub_wallet_desc')"
                          >{{ t("custody.sub_wallet") }}</Badge
                        >
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell
                  data-testid="lot-unit-cost"
                  class="py-2 text-right font-mono text-[10px] tabular-nums relative"
                >
                  <div class="flex items-center justify-end gap-2">
                    <div
                      v-if="isLotInLoss(lot) && lot.remainingQty > 0"
                      data-testid="lot-tax-loss-hint"
                      class="group/tooltip relative cursor-help flex items-center"
                    >
                      <span
                        class="w-1.5 h-1.5 rounded-full bg-warning animate-pulse block"
                      ></span>
                      <div
                        class="absolute right-0 bottom-full mb-2 w-48 p-2.5 bg-popover border border-warning rounded-lg shadow-xl text-[9px] text-popover-foreground opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-opacity z-50 normal-case font-sans tracking-normal leading-relaxed text-left"
                      >
                        <span class="font-bold text-warning block mb-1">{{
                          t("expanded_lots.ai_insight")
                        }}</span>
                        <span class="font-bold">{{
                          t("expanded_lots.tax_loss")
                        }}</span>
                        {{ t("expanded_lots.tax_loss_desc") }}
                      </div>
                    </div>

                    <!-- A basis nobody could resolve arrives as 0, so the figure is withheld and the
                         defect named in its place. -->
                    <div
                      v-if="lotDefectSeverity(lot)"
                      data-testid="lot-quality-flag"
                      class="group/quality relative cursor-help flex items-center gap-1"
                    >
                      <span
                        class="w-1.5 h-1.5 rounded-full block"
                        :class="severityDotClass(lotDefectSeverity(lot)!)"
                      ></span>
                      <span
                        class="text-[8px] font-black uppercase tracking-widest"
                        :class="SEVERITY_CLASSES[lotDefectSeverity(lot)!]"
                        >{{ t(lotDefectLabelKey(lot)) }}</span
                      >
                      <div
                        class="absolute right-0 bottom-full mb-2 w-52 p-2.5 bg-popover border border-border rounded-lg shadow-xl text-[9px] text-popover-foreground opacity-0 group-hover/quality:opacity-100 pointer-events-none transition-opacity z-50 normal-case font-sans tracking-normal leading-relaxed text-left"
                      >
                        {{ t(lotDefectExplanationKey(lot)) }}
                      </div>
                    </div>
                    <template v-else>
                      <Badge
                        v-if="lot.valueProvenance === 'MANUAL'"
                        data-testid="lot-manual-value"
                        variant="outline"
                        class="text-[7px] uppercase tracking-widest border-info text-info"
                        :title="t('value_provenance.manual_desc')"
                        >{{ t("value_provenance.manual") }}</Badge
                      >
                      {{ formatCurrency(lot.unitCost) }}
                    </template>
                  </div>
                </TableCell>
                <TableCell
                  data-testid="lot-total-cost"
                  class="py-2 text-right font-mono text-[10px] tabular-nums"
                  >{{
                    lotDefectSeverity(lot) ? "—" : formatCurrency(lot.totalCost)
                  }}</TableCell
                >
              </TableRow>

              <TableRow
                v-if="expandedLots.has(lot.id)"
                class="border-b border-primary/10"
              >
                <TableCell colspan="8" class="p-0">
                  <LotEventHistory
                    :events="getLotHistory(lot.id)"
                    :relocations="getLotRelocations(lot.id)"
                  />
                </TableCell>
              </TableRow>
            </template>
          </template>
          <TableRow v-else>
            <TableCell
              colspan="8"
              class="text-center py-10 text-muted-foreground/40 italic text-[10px] uppercase font-black tracking-widest"
            >
              {{ t("expanded_lots.no_lots") }}
            </TableCell>
          </TableRow>
        </template>
      </TableBody>
    </Table>
  </div>
</template>
