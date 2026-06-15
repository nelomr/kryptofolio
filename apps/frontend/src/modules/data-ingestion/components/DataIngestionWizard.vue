<script setup lang="ts">
import { onUnmounted, computed } from "vue";
import { useCsvImportWizardProvider } from "../composables/useCsvImportWizard";
import DropzoneArea from "./DropzoneArea.vue";
import DataGridValidator from "./DataGridValidator.vue";
import BaseSelect from "@/components/ui/select/BaseSelect.vue";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, FileUp, CheckCircle2, X, Loader2 } from "lucide-vue-next";
import { useI18n } from "@/composables/useI18n";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const TIMEZONES = [
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "Europe/Madrid", label: "Europe/Madrid (CET/CEST)" },
  { value: "America/New_York", label: "America/New_York (EST/EDT)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST/PDT)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST/AEDT)" },
];

// Initialize the wizard orchestrator (provides to children via Provide/Inject)
const wizard = useCsvImportWizardProvider();
const { t } = useI18n();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const handleSubmit = async () => {
  await wizard.submitImport();
};

const handleReset = () => {
  wizard.resetWizard();
};

const handleCancel = () => {
  wizard.resetWizard();
  emit("close");
};

const handleClose = () => {
  emit("close");
};

onUnmounted(() => {
  wizard.resetWizard();
});

// Computed properties for UI state
const isParsing = computed(() => wizard.fileParser.isParsing.value);
const isProcessing = computed(() => wizard.importProcessor.isProcessing.value);
const errorCount = computed(() => wizard.previewTable.invalidRows.value.length);
const globalErrors = computed(() => [
  ...wizard.fileParser.parseErrors.value,
  ...wizard.importProcessor.processingErrors.value,
]);
const isReadyToSubmit = computed(
  () =>
    errorCount.value === 0 &&
    wizard.previewTable.rows.value.length > 0 &&
    !isProcessing.value,
);
</script>

<template>
  <Card
    class="w-full h-full max-h-[90vh] mx-auto bg-transparent border-none shadow-none rounded-none relative flex flex-col"
  >
    <CardHeader class="border-b border-border-soft pb-6 shrink-0">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div
            class="w-12 h-12 rounded-xl flex items-center justify-center transition-colors shrink-0"
            :class="[
              wizard.step.value === 3
                ? 'bg-profit-soft text-profit'
                : wizard.step.value === 2 && errorCount > 0
                  ? 'bg-loss-soft text-loss'
                  : 'bg-brand-soft text-brand',
            ]"
          >
            <CheckCircle2 v-if="wizard.step.value === 3" class="w-6 h-6" />
            <AlertCircle
              v-else-if="wizard.step.value === 2 && errorCount > 0"
              class="w-6 h-6"
            />
            <FileUp v-else class="w-6 h-6" />
          </div>

          <div>
            <span
              class="font-mono text-[11px] uppercase tracking-[0.18em] text-muted block mb-1"
              >{{ t("ingestion.wizard.label") }}</span
            >
            <CardTitle
              class="text-xl leading-6 font-bold text-fg tracking-tight"
              >{{ t("ingestion.wizard.title") }}</CardTitle
            >
            <CardDescription class="text-sm text-muted mt-1 max-w-lg">
              {{ t("ingestion.wizard.subtitle") }}
            </CardDescription>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <button
            @click="handleClose"
            class="text-muted-foreground hover:text-foreground transition-colors bg-surface hover:bg-surface-2 p-2 rounded-full focus:outline-none"
          >
            <X class="h-5 w-5" />
          </button>
        </div>
      </div>
    </CardHeader>

    <CardContent class="space-y-6 flex-1 overflow-y-auto custom-scrollbar py-6">
      <Alert
        v-if="globalErrors.length > 0"
        variant="destructive"
        class="bg-loss-soft border-loss/20 text-loss rounded-xl"
      >
        <AlertCircle class="w-4 h-4" />
        <AlertTitle>{{ t("errors.validation.title") }}</AlertTitle>
        <AlertDescription>
          <ul class="list-disc pl-5 mt-2 space-y-1">
            <li v-for="(err, idx) in globalErrors" :key="idx">
              {{ err }}
            </li>
          </ul>
        </AlertDescription>
      </Alert>

      <div v-if="wizard.step.value === 1">
        <DropzoneArea v-if="!isParsing" />
        <div
          v-else
          class="mt-4 flex justify-center flex-col items-center gap-2"
        >
          <Skeleton class="h-4 w-32 rounded bg-brand/20" />
          <div class="text-muted font-mono text-xs tracking-widest uppercase">
            {{ t("ingestion.grid.parsing") }}
          </div>
        </div>
      </div>

      <div v-else-if="wizard.step.value === 2" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <!-- Market Type Toggle -->
          <BaseSelect
            v-model="wizard.marketType.value"
            :label="t('ingestion.wizard.market_type_label')"
            :placeholder="t('ingestion.wizard.market_type_label')"
            :options="[
              { value: 'SPOT', label: t('ingestion.wizard.market_spot') },
              { value: 'FUTURES', label: t('ingestion.wizard.market_futures') },
            ]"
          />

          <!-- Timezone Selector -->
          <BaseSelect
            v-model="wizard.importProcessor.timezone.value"
            :label="t('ingestion.wizard.timezone_label')"
            placeholder="Select a timezone"
            :options="TIMEZONES"
          />
        </div>

        <div
          v-if="errorCount > 0"
          class="flex items-center gap-3 p-4 rounded-xl bg-loss-soft border border-loss text-loss"
        >
          <AlertCircle class="w-5 h-5 flex-shrink-0" />
          <div>
            <h4 class="font-semibold text-sm">
              {{ t("errors.validation.title") }}
            </h4>
            <p class="text-sm mt-0.5">
              {{
                t("ingestion.grid.fix_errors", {
                  count: errorCount.toString(),
                })
              }}
            </p>
          </div>
        </div>
        <div
          v-else
          class="flex items-center gap-3 p-4 rounded-xl bg-profit-soft border border-profit-soft text-profit"
        >
          <CheckCircle2 class="w-5 h-5 flex-shrink-0" />
          <div>
            <h4 class="font-semibold text-sm">
              {{ t("ingestion.wizard.step_success") }}
            </h4>
            <p class="text-sm mt-0.5">
              <strong class="num">{{
                wizard.previewTable.rows.value.length
              }}</strong>
              {{ t("ingestion.grid.ready_to_import") }}
            </p>
          </div>
        </div>

        <DataGridValidator />
      </div>

      <div
        v-else-if="wizard.step.value === 3"
        class="flex flex-col items-center justify-center py-12 text-center"
      >
        <div
          class="w-20 h-20 bg-profit-soft rounded-full flex items-center justify-center mb-6"
        >
          <CheckCircle2 class="w-10 h-10 text-profit" />
        </div>
        <h3 class="text-xl font-semibold text-fg mb-2">
          {{ t("ingestion.wizard.step_success") }}
        </h3>
        <p class="text-muted text-sm max-w-sm mb-8">
          {{ t("ingestion.grid.imported_success") }}
        </p>
        <div class="flex gap-4 justify-center">
          <Button
            @click="handleReset"
            variant="outline"
            class="border-border text-fg hover:bg-surface-2 hover:text-brand"
          >
            {{ t("ingestion.wizard.step_upload") }}
          </Button>
          <Button
            @click="handleClose"
            class="bg-brand hover:bg-brand-hover text-white transition-colors"
          >
            Cerrar
          </Button>
        </div>
      </div>
    </CardContent>

    <CardFooter
      v-if="wizard.step.value === 2"
      class="border-t border-border-soft py-4 px-6 shrink-0 flex justify-between"
    >
      <Button
        variant="ghost"
        @click="handleCancel"
        class="text-muted hover:text-fg"
      >
        Cancel
      </Button>
      <Button
        @click="handleSubmit"
        :disabled="!isReadyToSubmit"
        class="bg-brand hover:bg-brand-hover text-white transition-colors flex items-center gap-2"
      >
        <Loader2
          v-if="isProcessing"
          class="animate-spin h-4 w-4"
        />
        {{ t("tax.import.btn") }}
      </Button>
    </CardFooter>
  </Card>
</template>
