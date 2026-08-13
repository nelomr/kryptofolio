<script setup lang="ts">
/**
 * LotEventHistory — Component description.
 */

import { computed } from "vue";
import { ArrowRight, ShieldCheck } from "lucide-vue-next";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatDate } from "@/composables/useFormatters";
import { useI18n } from "@/composables/useI18n";
import {
  figureClass,
  figureText,
  figureTone,
} from "@/composables/useConvertedAmountDisplay";
import {
  disposalTypeLabelKey,
  mergeLotTimeline,
  qualityFlagExplanationKey,
  qualityFlagLabelKey,
  qualityFlagSeverity,
  severityDotClass,
  SEVERITY_CLASSES,
} from "@/views/TaxReport/composables/useTaxCalculations";
import type {
  LotRelocationEntity,
  TaxLotHistoryEvent,
} from "@/core/domain/models/FiscalEntities";

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    events: TaxLotHistoryEvent[];
    /** Custody movements of this lot. They carry no P&L and never will. */
    relocations?: LotRelocationEntity[];
  }>(),
  { relocations: () => [] },
);

// Level 2 answers where the lot is now; this answers where it has been.
const timeline = computed(() => mergeLotTimeline(props.events, props.relocations));

const getEventBadge = (
  event: TaxLotHistoryEvent,
): { variant: "secondary" | "profit" | "loss" | "warning"; label: string } => {
  if (event.flag === "WALLET_ACTIVATION")
    return { variant: "secondary", label: t("lot_events.badge_activation") };
  if (!event.isTaxable)
    return { variant: "secondary", label: t("lot_events.badge_exempt") };
  // Four states, not three. `null >= 0` is `true` in JavaScript, and an unconvertible figure carries
  // a native amount that is usually positive — either one, compared directly, renders as a profit.
  switch (figureTone(event.gainLoss)) {
    case "unconverted":
      return { variant: "warning", label: t("tax.audit.badge_unconverted") };
    case "gain":
      return { variant: "profit", label: t("lot_events.badge_gain") };
    case "loss":
      return { variant: "loss", label: t("lot_events.badge_loss") };
    default:
      return event.gainLoss === null
        ? { variant: "secondary", label: t("tax.audit.badge_unresolved") }
        : { variant: "profit", label: t("lot_events.badge_gain") };
  }
};
</script>

<template>
  <div class="border-l-2 border-primary/40 ml-12 bg-background">
    <Table>
      <TableHeader>
        <TableRow class="hover:bg-transparent">
          <TableHead
            class="h-7 text-[9px] text-muted-foreground/60 uppercase tracking-widest pl-4 font-black"
            >{{ t("lot_events.date") }}</TableHead
          >
          <TableHead
            class="h-7 text-[9px] text-muted-foreground/60 uppercase tracking-widest font-black"
            >{{ t("lot_events.concept") }}</TableHead
          >
          <TableHead
            class="h-7 text-[9px] text-muted-foreground/60 uppercase tracking-widest text-right font-black"
            >{{ t("lot_events.affected_amount") }}</TableHead
          >
          <TableHead
            class="h-7 text-[9px] text-muted-foreground/60 uppercase tracking-widest text-right font-black"
            >{{ t("lot_events.sell_price") }}</TableHead
          >
          <TableHead
            class="h-7 text-[9px] text-muted-foreground/60 uppercase tracking-widest text-right font-black"
            >{{ t("lot_events.pnl") }}</TableHead
          >
          <TableHead
            class="h-7 text-[9px] text-muted-foreground/60 uppercase tracking-widest text-right font-black"
            >{{ t("lot_events.notes") }}</TableHead
          >
        </TableRow>
      </TableHeader>
      <TableBody>
        <template
          v-for="row in timeline"
          :key="row.kind === 'DISPOSAL' ? row.event.id : row.relocation.id"
        >
          <template v-if="row.kind === 'DISPOSAL'">
            <TableRow
              data-testid="timeline-row"
              data-kind="DISPOSAL"
              :class="
                cn('border-b border-border/5', !row.event.isTaxable && 'opacity-60')
              "
            >
            <TableCell
              class="py-2 font-mono text-[10px] text-muted-foreground pl-4"
              >{{ formatDate(row.event.disposalDate) }}</TableCell
            >
            <TableCell class="py-2">
              <div class="flex items-center gap-1.5 flex-wrap">
                <!-- What consumed the lot, before any judgement about the result of it. -->
                <Badge
                  data-testid="event-disposal-type"
                  variant="outline"
                  class="text-[8px] font-black uppercase tracking-widest"
                >
                  {{ t(disposalTypeLabelKey(row.event.disposalType)) }}
                </Badge>
                <Badge
                  :variant="getEventBadge(row.event).variant"
                  class="text-[8px] font-black uppercase tracking-widest border-none"
                >
                  {{ getEventBadge(row.event).label }}
                </Badge>
                <!-- Orthogonal to the badge above: a classified event can also carry a defect. -->
                <span
                  v-if="row.event.qualityFlag"
                  data-testid="event-quality-flag"
                  :data-severity="qualityFlagSeverity(row.event.qualityFlag)"
                  class="group/quality relative inline-flex items-center gap-1 cursor-help"
                >
                  <span
                    class="w-1.5 h-1.5 rounded-full block"
                    :class="severityDotClass(qualityFlagSeverity(row.event.qualityFlag))"
                  ></span>
                  <span
                    class="text-[8px] font-black uppercase tracking-widest"
                    :class="SEVERITY_CLASSES[qualityFlagSeverity(row.event.qualityFlag)]"
                    >{{ t(qualityFlagLabelKey(row.event.qualityFlag)) }}</span
                  >
                  <span
                    class="absolute left-0 bottom-full mb-2 w-52 p-2.5 bg-popover border border-border rounded-lg shadow-xl text-[9px] text-popover-foreground opacity-0 group-hover/quality:opacity-100 pointer-events-none transition-opacity z-50 normal-case font-sans tracking-normal leading-relaxed text-left"
                    >{{ t(qualityFlagExplanationKey(row.event.qualityFlag)) }}</span
                  >
                </span>
                <Badge
                  v-if="row.event.valueProvenance === 'MANUAL'"
                  data-testid="event-manual-value"
                  variant="outline"
                  class="text-[7px] uppercase tracking-widest border-info text-info"
                  :title="t('value_provenance.manual_desc')"
                  >{{ t("value_provenance.manual") }}</Badge
                >
              </div>
            </TableCell>
            <TableCell
              class="py-2 text-right font-mono text-[10px] tabular-nums text-muted-foreground"
            >
              -{{ (row.event.amountFromLot || 0).toFixed(8) }}
            </TableCell>
            <TableCell
              class="py-2 text-right font-mono text-[10px] tabular-nums"
              >{{ figureText(row.event.salePrice) }}</TableCell
            >
            <TableCell
              data-testid="event-pnl"
              class="py-2 text-right font-mono text-[10px] tabular-nums font-bold"
              :class="figureClass(row.event.gainLoss)"
              >{{ figureText(row.event.gainLoss) }}</TableCell
            >
            <TableCell class="py-2 text-right">
              <div
                v-if="!row.event.isTaxable"
                data-testid="event-non-taxable"
                class="group/tooltip relative inline-flex items-center justify-end cursor-help"
              >
                <ShieldCheck class="w-3.5 h-3.5 text-muted-foreground/50" />
                <div
                  class="absolute right-0 bottom-full mb-2 w-52 p-2.5 bg-popover border border-border rounded-lg shadow-xl text-[9px] text-popover-foreground opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-opacity z-50 normal-case font-sans tracking-normal leading-relaxed text-left"
                >
                  <span class="font-bold text-muted-foreground block mb-1">{{
                    t("lot_events.non_taxable")
                  }}</span>
                  {{ t("lot_events.non_taxable_desc") }}
                </div>
              </div>
              <span
                v-else-if="row.event.notes"
                class="text-[9px] font-mono text-muted-foreground/50 uppercase"
                >{{ row.event.notes }}</span
              >
            </TableCell>
            </TableRow>
          </template>
          <template v-else>
          <TableRow
            data-testid="timeline-row"
            data-kind="RELOCATION"
            class="border-b border-border/5 opacity-60"
          >
            <TableCell class="py-2 font-mono text-[10px] text-muted-foreground pl-4">{{
              formatDate(row.relocation.occurredAt)
            }}</TableCell>
            <TableCell class="py-2">
              <div class="flex items-center gap-1.5 flex-wrap">
                <Badge
                  variant="outline"
                  class="text-[8px] font-black uppercase tracking-widest"
                >
                  {{ t("custody.relocation") }}
                </Badge>
                <span class="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span class="font-mono">{{ row.relocation.fromAccountName }}</span>
                  <ArrowRight class="w-3 h-3" />
                  <span class="font-mono">{{ row.relocation.toAccountName }}</span>
                </span>
                <!-- A synthetic destination means no real counterparty was recorded, which the
                     pending-review surface exists to let the user correct. -->
                <Badge
                  v-if="row.relocation.toIsSynthetic"
                  data-testid="relocation-synthetic"
                  variant="outline"
                  class="text-[7px] uppercase tracking-widest border-warning text-warning"
                  :title="t('custody.synthetic_desc')"
                  >{{ t("custody.synthetic") }}</Badge
                >
              </div>
            </TableCell>
            <TableCell
              data-testid="relocation-qty"
              class="py-2 text-right font-mono text-[10px] tabular-nums text-muted-foreground"
            >
              {{ row.relocation.qty.toFixed(8) }}
            </TableCell>
            <TableCell class="py-2 text-right font-mono text-[10px] text-muted-foreground">—</TableCell>
            <!-- Not "zero profit": a movement realises nothing, so there is no figure to show. -->
            <TableCell
              data-testid="relocation-pnl"
              class="py-2 text-right font-mono text-[10px] text-muted-foreground"
              >—</TableCell
            >
            <TableCell class="py-2 text-right">
              <span
                class="group/tooltip relative inline-flex items-center justify-end cursor-help"
                :title="t('custody.no_pnl')"
              >
                <ShieldCheck class="w-3.5 h-3.5 text-muted-foreground/50" />
                <span class="text-[9px] uppercase text-muted-foreground/50 ml-1">{{
                  t("lot_events.non_taxable")
                }}</span>
              </span>
            </TableCell>
          </TableRow>
          </template>
        </template>
      </TableBody>
    </Table>
  </div>
</template>
