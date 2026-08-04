<script setup lang="ts">
import { computed } from "vue";
import { SOURCE_FORMAT_PROFILES, type SourceProfileDetection } from "@kryptofolio/core-domain";
import { SOURCE_PROFILE_IDS, type SourceProfileId } from "@kryptofolio/shared-types";
import BaseSelect from "@/components/ui/select/BaseSelect.vue";
import { AlertCircle, CheckCircle2, HelpCircle } from "lucide-vue-next";
import { useI18n } from "@/composables/useI18n";
import type { InvariantStatus } from "../composables/useCsvImportWizard";

/**
 * The third detect-or-choose control in this wizard, after the account and the market.
 *
 * A profile carries facts no column mapping can express — that Bit2Me's fee column is a euro
 * valuation of a fee paid in the asset, that Kraken's amount is net of its fee — so it decides
 * quantities. It is therefore always shown and always editable, and the outcome of whatever check
 * the source ships is shown beside it: a convention nobody could verify must not read as a verified
 * one.
 */
const props = defineProps<{
  modelValue: SourceProfileId | "";
  detection: SourceProfileDetection;
  invariantStatus: InvariantStatus;
  rowsChecked: number | null;
}>();

defineEmits<{ (e: "update:modelValue", value: SourceProfileId | ""): void }>();

const { t } = useI18n();

const options = computed(() =>
  SOURCE_PROFILE_IDS.map((id) => ({ value: id, label: SOURCE_FORMAT_PROFILES[id].label })),
);

const candidates = computed(() =>
  props.detection.kind === "AMBIGUOUS" ? props.detection.candidates : [],
);

/** `FAILED` is the only outcome that says something is wrong with the data itself. */
const isFailure = computed(() => props.invariantStatus === "FAILED");

const invariantKey = computed(() => {
  switch (props.invariantStatus) {
    case "VERIFIED":
      return "ingestion.profile.invariant.verified";
    case "NOT_DECLARED":
      return "ingestion.profile.invariant.not_declared";
    case "COULD_NOT_VERIFY":
      return "ingestion.profile.invariant.could_not_verify";
    case "FAILED":
      return "ingestion.profile.invariant.failed";
    case "PROFILE_NOT_CHOSEN":
      return "ingestion.profile.invariant.profile_not_chosen";
  }
});
</script>

<template>
  <div class="flex flex-col gap-2">
    <BaseSelect
      :model-value="props.modelValue"
      :label="t('ingestion.profile.label')"
      :placeholder="t('ingestion.profile.placeholder')"
      :options="options"
      @update:model-value="$emit('update:modelValue', $event as SourceProfileId | '')"
    />

    <p v-if="candidates.length > 0" class="text-xs text-muted">
      {{ t("ingestion.profile.ambiguous") }}
      <span class="text-fg">{{ candidates.join(", ") }}</span>
    </p>

    <div
      class="flex items-start gap-2 text-xs"
      :class="isFailure ? 'text-loss' : 'text-muted'"
    >
      <CheckCircle2 v-if="invariantStatus === 'VERIFIED'" class="w-3.5 h-3.5 mt-0.5 shrink-0 text-profit" />
      <AlertCircle v-else-if="isFailure" class="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <HelpCircle v-else class="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span>
        {{ t(invariantKey) }}
        <span
          v-if="invariantStatus === 'VERIFIED' && rowsChecked !== null"
          data-testid="invariant-rows"
          class="font-mono"
          >{{ rowsChecked }}</span
        >
      </span>
    </div>
  </div>
</template>
