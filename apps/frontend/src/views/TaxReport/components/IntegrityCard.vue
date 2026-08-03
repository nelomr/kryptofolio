<script setup lang="ts">
/**
 * IntegrityCard — the Fiscal Hospital.
 *
 * Every warning shown here was found by the calculation engine and arrives already grouped, counted
 * and severity-ranked. Nothing is inferred from portfolio data on this side, and no defect blocks
 * access to the portfolio or the report: the user is told the count, never stopped.
 */

import { computed } from "vue";
import { AlertTriangle, CheckCircle2, Hospital, RefreshCw } from "lucide-vue-next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/composables/useI18n";
import {
  highestSeverity,
  qualityFlagExplanationKey,
  qualityFlagLabelKey,
  SEVERITY_CLASSES,
  severityDotClass,
} from "@/views/TaxReport/composables/useTaxCalculations";
import type { FlagSeverity } from "@kryptofolio/shared-types";
import type { FiscalIntegrityReportEntity } from "@/core/domain/models/FiscalEntities";

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    report: FiscalIntegrityReportEntity | null;
    isLoading?: boolean;
    isRebuilding?: boolean;
  }>(),
  { isLoading: false, isRebuilding: false },
);

const emit = defineEmits<{ rebuild: [] }>();

const SEVERITY_ORDER: Record<FlagSeverity, number> = { high: 0, medium: 1, low: 2 };

/** Worst first: a low-severity group with a large count must not outrank a single untracked inflow. */
const orderedGroups = computed(() =>
  [...(props.report?.groups ?? [])].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  ),
);

const headlineSeverity = computed(() =>
  highestSeverity(orderedGroups.value.map((group) => group.qualityFlag)),
);

const isHealthy = computed(
  () => !props.isLoading && (props.report?.groups.length ?? 0) === 0,
);

/** Distinct assets behind a group, so the user knows what to look at without expanding it. */
function assetsOf(rows: { assetId: string | null }[]): string[] {
  return [...new Set(rows.map((row) => row.assetId).filter((id): id is string => id !== null))];
}
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between gap-2 pb-3">
      <div class="flex items-center gap-2">
        <Hospital class="h-5 w-5 text-muted-foreground" />
        <CardTitle class="text-lg">{{ t("tax.integrity.title") }}</CardTitle>
        <span
          v-if="headlineSeverity"
          data-testid="integrity-headline-severity"
          class="text-[10px] font-black uppercase tracking-widest"
          :class="SEVERITY_CLASSES[headlineSeverity]"
          >{{ headlineSeverity }}</span
        >
      </div>

      <!-- An explicit retry, available even on a clean ledger: the user may have changed inputs. -->
      <Button
        data-testid="rebuild-action"
        variant="outline"
        size="sm"
        :disabled="isRebuilding"
        @click="emit('rebuild')"
      >
        <RefreshCw :class="isRebuilding && 'animate-spin'" />
        {{ isRebuilding ? t("tax.audit.recalculating") : t("tax.audit.recalculate") }}
      </Button>
    </CardHeader>

    <CardContent class="space-y-3">
      <template v-if="isLoading">
        <Skeleton class="h-5 w-48 rounded-md" />
        <Skeleton v-for="n in 2" :key="n" class="h-16 w-full rounded-lg" />
      </template>

      <template v-else>
        <div
          v-if="report?.needsRecalculation"
          data-testid="needs-recalculation"
          class="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3"
        >
          <AlertTriangle class="h-4 w-4 text-warning" />
          <span class="text-sm text-warning">{{
            t("tax.integrity.needs_recalculation")
          }}</span>
        </div>

        <div
          v-if="isHealthy"
          class="flex items-center gap-2 text-profit"
        >
          <CheckCircle2 class="h-5 w-5" />
          <span class="text-sm font-medium">{{ t("tax.integrity.healthy") }}</span>
        </div>

        <template v-else>
          <p
            v-if="report"
            data-testid="integrity-pending-count"
            class="text-sm text-muted-foreground"
          >
            <span class="font-mono tabular-nums">{{ report.pendingReview }}</span>
            {{ t("tax.integrity.pending_review") }}
          </p>

          <div
            v-for="group in orderedGroups"
            :key="group.qualityFlag"
            data-testid="integrity-group"
            :data-severity="group.severity"
            class="flex flex-col gap-1.5 rounded-lg border border-border/40 bg-surface-2 p-3"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="w-1.5 h-1.5 rounded-full block"
                :class="severityDotClass(group.severity)"
              ></span>
              <span
                class="text-[10px] font-black uppercase tracking-widest"
                :class="SEVERITY_CLASSES[group.severity]"
                >{{ t(qualityFlagLabelKey(group.qualityFlag)) }}</span
              >
              <span class="font-mono text-xs tabular-nums text-muted-foreground">{{
                group.count
              }}</span>
              <Badge
                v-for="asset in assetsOf(group.rows)"
                :key="asset"
                variant="outline"
                class="font-mono text-[10px] tabular-nums"
                >{{ asset }}</Badge
              >
            </div>
            <p class="text-xs text-muted-foreground">
              {{ t(qualityFlagExplanationKey(group.qualityFlag)) }}
            </p>
          </div>
        </template>
      </template>
    </CardContent>
  </Card>
</template>
