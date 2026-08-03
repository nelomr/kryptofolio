<script setup lang="ts">
/**
 * PendingValuesReview — the defects a user can resolve, and the affordance to resolve them.
 *
 * Presentational: it receives rows and emits declarations. The owning view holds the query and the
 * mutation, so nothing here fetches or caches, and no state is global.
 */

import { computed, ref } from "vue";
import { Pencil, MapPin } from "lucide-vue-next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/composables/useI18n";
import {
  qualityFlagExplanationKey,
  qualityFlagLabelKey,
  SEVERITY_CLASSES,
  severityDotClass,
} from "@/views/TaxReport/composables/useTaxCalculations";
import type { FiscalIntegrityDefectEntity } from "@/core/domain/models/FiscalEntities";

/** An account the user can name as a movement's real counterparty. Synthetic ones never appear. */
export interface SelectableAccount {
  id: string;
  name: string;
}

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    rows: FiscalIntegrityDefectEntity[];
    accounts?: SelectableAccount[];
    isLoading?: boolean;
    isSubmitting?: boolean;
    /** The currency a declared price is denominated in. Recorded explicitly, never inferred. */
    fiatCurrency?: string;
  }>(),
  {
    accounts: () => [],
    isLoading: false,
    isSubmitting: false,
    fiatCurrency: "EUR",
  },
);

const emit = defineEmits<{
  assignPrice: [
    payload: { idHash: string; priceFiat: string; fiatCurrency: string },
  ];
  assignDestination: [payload: { idHash: string; counterpartyAccountId: string }];
}>();

/** Only rows the user can actually act on: a diagnostic with no affordance is noise here. */
const actionableRows = computed(() =>
  props.rows.filter((row) => row.pendingReview && row.txId !== null),
);

/** A missing value is declared as a price; a holding with no origin is declared as a destination. */
const needsDestination = (row: FiscalIntegrityDefectEntity) =>
  row.qualityFlag === "UNTRACKED_INFLOW" || row.qualityFlag === "CUSTODY_RESIDUAL";

const openEditor = ref<string | null>(null);
const priceDraft = ref("");
const destinationDraft = ref("");

function startEditing(row: FiscalIntegrityDefectEntity) {
  openEditor.value = row.txId;
  priceDraft.value = "";
  destinationDraft.value = "";
}

function submitPrice(row: FiscalIntegrityDefectEntity) {
  // An empty declaration would key an override to no value at all.
  if (!row.txId || priceDraft.value.trim() === "") return;
  emit("assignPrice", {
    idHash: row.txId,
    priceFiat: priceDraft.value.trim(),
    fiatCurrency: props.fiatCurrency,
  });
  openEditor.value = null;
}

function submitDestination(row: FiscalIntegrityDefectEntity) {
  if (!row.txId || destinationDraft.value === "") return;
  emit("assignDestination", {
    idHash: row.txId,
    counterpartyAccountId: destinationDraft.value,
  });
  openEditor.value = null;
}
</script>

<template>
  <Card>
    <CardHeader class="pb-3">
      <CardTitle class="text-lg">{{ t("tax.pending.title") }}</CardTitle>
      <p class="text-sm text-muted-foreground">
        {{ t("tax.pending.excluded_notice") }}
      </p>
    </CardHeader>
    <CardContent class="space-y-3">
      <template v-if="isLoading">
        <!-- One skeleton per row slot, at the row's own height, so nothing shifts on load. -->
        <Skeleton
          v-for="n in 3"
          :key="n"
          data-testid="pending-skeleton"
          class="h-14 w-full rounded-lg"
        />
      </template>

      <p
        v-else-if="actionableRows.length === 0"
        class="text-sm text-muted-foreground"
      >
        {{ t("tax.pending.none") }}
      </p>

      <template v-else>
        <div
          v-for="row in actionableRows"
          :key="row.txId ?? ''"
          data-testid="pending-row"
          class="flex flex-col gap-2 rounded-lg border border-border/40 bg-surface-2 p-4"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <span
                class="w-1.5 h-1.5 rounded-full block"
                :class="severityDotClass(row.severity)"
              ></span>
              <span
                class="text-[10px] font-black uppercase tracking-widest"
                :class="SEVERITY_CLASSES[row.severity]"
                >{{ t(qualityFlagLabelKey(row.qualityFlag)) }}</span
              >
              <Badge
                v-if="row.assetId"
                variant="outline"
                class="font-mono text-[10px] tabular-nums"
                >{{ row.assetId }}</Badge
              >
              <span
                v-if="row.occurredAt"
                class="font-mono text-[10px] tabular-nums text-muted-foreground"
                >{{ row.occurredAt.slice(0, 10) }}</span
              >
            </div>

            <Button
              v-if="needsDestination(row)"
              data-testid="assign-destination"
              variant="outline"
              size="sm"
              :disabled="isSubmitting"
              @click="startEditing(row)"
            >
              <MapPin />
              {{ t("tax.pending.declare_destination") }}
            </Button>
            <Button
              v-else
              data-testid="assign-price"
              variant="outline"
              size="sm"
              :disabled="isSubmitting"
              @click="startEditing(row)"
            >
              <Pencil />
              {{ t("tax.pending.declare_price") }}
            </Button>
          </div>

          <p class="text-xs text-muted-foreground">
            {{ t(qualityFlagExplanationKey(row.qualityFlag)) }}
          </p>

          <form
            v-if="openEditor === row.txId && !needsDestination(row)"
            data-testid="price-submit"
            class="flex items-center gap-2"
            @submit.prevent="submitPrice(row)"
          >
            <Input
              v-model="priceDraft"
              data-testid="price-input"
              inputmode="decimal"
              class="h-9 max-w-40 font-mono tabular-nums"
              :placeholder="t('tax.pending.price_placeholder')"
            />
            <span class="font-mono text-xs text-muted-foreground">{{
              fiatCurrency
            }}</span>
            <Button type="submit" size="sm" :disabled="isSubmitting">
              {{ t("tax.pending.save") }}
            </Button>
          </form>

          <form
            v-if="openEditor === row.txId && needsDestination(row)"
            data-testid="destination-submit"
            class="flex items-center gap-2"
            @submit.prevent="submitDestination(row)"
          >
            <select
              v-model="destinationDraft"
              data-testid="destination-select"
              class="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{{ t("tax.pending.select_account") }}</option>
              <option
                v-for="account in accounts"
                :key="account.id"
                :value="account.id"
              >
                {{ account.name }}
              </option>
            </select>
            <Button type="submit" size="sm" :disabled="isSubmitting">
              {{ t("tax.pending.save") }}
            </Button>
          </form>
        </div>
      </template>
    </CardContent>
  </Card>
</template>
