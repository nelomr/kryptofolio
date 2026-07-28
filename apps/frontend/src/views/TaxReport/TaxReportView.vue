<script setup lang="ts">
import { ref, watch } from "vue";
import TaxReportHeader from "./components/TaxReportHeader.vue";
import TaxReportSummaryCards from "./components/TaxReportSummaryCards.vue";

import TaxReportTab from "./components/TaxReportTab.vue";
import YearFilter from "./components/YearFilter.vue";
import TaxTransactionsTable from "./components/TaxTransactionsTable.vue";
import TaxDerivativesTable from "./components/TaxDerivativesTable.vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataIngestionWizard } from "@/modules/data-ingestion";
import { BookText, FileText, MessageSquare } from "lucide-vue-next";
import { useTaxReportPort } from "./composables/useTaxReportPort";
import { useTaxLedgers } from "./composables/useTaxLedgers";
import { useI18n } from "@/composables/useI18n";

const { t } = useI18n();
const { metrics, syncWeb3, selectedYear, effectiveYear } = useTaxReportPort();

const {
  spotLoading,
  derivativesLoading,
  availableYears,
  spotYearFilter,
  derivativesYearFilter,
  filteredSpot,
  filteredDerivatives,
  handleEdit,
  handleEditDerivative,
  handleDelete,
} = useTaxLedgers();

// Sync table year filter with global report year state
watch(spotYearFilter, (newYear) => {
  if (newYear) {
    selectedYear.value = Number(newYear);
  } else {
    selectedYear.value = null;
  }
});

// Also keep spotYearFilter synced if effectiveYear is determined automatically
watch(
  () => effectiveYear.value,
  (newYear) => {
    if (newYear && !spotYearFilter.value) {
      spotYearFilter.value = String(newYear);
    }
  },
  { immediate: true },
);

const activeMarket = ref<"spot" | "futures">("spot");
const isUploadModalOpen = ref(false);
</script>

<template>
  <div class="space-y-6 relative w-full">
    <div class="absolute -z-10 inset-0 overflow-hidden pointer-events-none">
      <div
        class="absolute -top-1/2 -right-1/2 w-[1000px] h-[1000px] rounded-full bg-primary/5 blur-[120px]"
      />
      <div
        class="absolute -bottom-1/2 -left-1/2 w-[800px] h-[800px] rounded-full bg-primary/5 blur-[100px]"
      />
    </div>

    <!-- Adapter orchestrating Dumb components -->
    <TaxReportHeader @sync="syncWeb3" @upload="isUploadModalOpen = true" />

    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="isUploadModalOpen"
          id="tax-upload-modal"
          class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto"
        >
          <div
            class="fixed inset-0 transition-opacity"
            aria-hidden="true"
            @click="isUploadModalOpen = false"
          ></div>

          <div
            class="modal-panel relative z-10 flex flex-col bg-background rounded-2xl text-left shadow-2xl w-full max-w-5xl border border-border max-h-[90vh] overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            <DataIngestionWizard @close="isUploadModalOpen = false" />
          </div>
        </div>
      </Transition>
    </Teleport>

    <TaxReportSummaryCards :metrics="metrics" />

    <Tabs defaultValue="ledgers" class="space-y-4">
      <TabsList>
        <TabsTrigger value="ledgers" class="cursor-pointer">
          <div class="flex items-center gap-2">
            <BookText class="w-4 h-4" />
            {{ t("tax.tabs.ledgers") }}
          </div>
        </TabsTrigger>
        <TabsTrigger value="report" class="cursor-pointer">
          <div class="flex items-center gap-2">
            <FileText class="w-4 h-4" />
            {{ t("tax.tabs.report") }}
          </div>
        </TabsTrigger>
        <TabsTrigger value="chat" class="cursor-pointer">
          <div class="flex items-center gap-2">
            <MessageSquare class="w-4 h-4" />
            {{ t("tax.tabs.chat") }}
          </div>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="ledgers" class="space-y-4 mt-4">
        <!-- Integrity summary card (Fiscal Hospital) TODO: Functionality not implemented yet 
        <IntegrityCard :warnings="warnings" :isLoading="isLoading" />
        -->

        <!-- Operations Ledgers Sub-Tabs -->
        <Tabs v-model="activeMarket" class="space-y-4 mt-4">
          <TabsList>
            <TabsTrigger value="spot" class="cursor-pointer">
              {{ t("tax.tabs.spot") }}
            </TabsTrigger>
            <TabsTrigger value="futures" class="cursor-pointer">
              {{ t("tax.tabs.futures") }}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="spot">
            <div class="flex items-center justify-between py-2 mb-4">
              <YearFilter
                :available-years="availableYears"
                v-model="spotYearFilter"
              />
            </div>

            <TaxTransactionsTable
              :transactions="filteredSpot"
              :isLoading="spotLoading"
              @edit="handleEdit"
              @delete="handleDelete"
            />
          </TabsContent>
          <TabsContent value="futures">
            <div class="flex items-center justify-between py-2 mb-4">
              <YearFilter
                :available-years="availableYears"
                v-model="derivativesYearFilter"
              />
            </div>

            <TaxDerivativesTable
              :transactions="filteredDerivatives"
              :isLoading="derivativesLoading"
              @edit="handleEditDerivative"
              @delete="handleDelete"
            />
          </TabsContent>
        </Tabs>
      </TabsContent>

      <TabsContent value="report" class="space-y-4 mt-4">
        <!-- Fiscal audit controls + FIFO traceability table -->
        <TaxReportTab />
      </TabsContent>

      <TabsContent value="chat" class="space-y-4 mt-4">
        <!-- Placeholder for chat -->
        <div
          class="h-64 rounded-xl border border-primary/10 bg-card/50 flex items-center justify-center text-muted-foreground"
        >
          {{ t("tax.tabs.chat_dev") }}
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>

<style scoped>
/* Modern CSS way to lock scroll globally while modal is mounted */
:global(body:has(#tax-upload-modal)) {
  overflow: hidden;
}

/* Base transition for the container (opacity only) */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

/* Specific transition for the panel (smooth transform and scale) */
.modal-enter-active .modal-panel {
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-leave-active .modal-panel {
  transition: transform 0.3s cubic-bezier(0.5, 0, 0, 1);
}

.modal-enter-from .modal-panel {
  transform: scale(0.95) translateY(15px);
}

.modal-leave-to .modal-panel {
  transform: scale(0.97) translateY(5px);
}
</style>
