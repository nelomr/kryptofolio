<script setup lang="ts">
import TaxReportHeader from "./components/TaxReportHeader.vue";
import TaxReportSummaryCards from "./components/TaxReportSummaryCards.vue";
import IntegrityCard from "./components/IntegrityCard.vue";
import TaxReportTab from "./components/TaxReportTab.vue";
import YearFilter from "./components/YearFilter.vue";
import TaxTransactionsTable from "./components/TaxTransactionsTable.vue";
import TaxDerivativesTable from "./components/TaxDerivativesTable.vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookText, FileText, MessageSquare } from "lucide-vue-next";
import { useTaxReportPort } from "./composables/useTaxReportPort";
import { useTaxLedgers } from "./composables/useTaxLedgers";
import { useI18n } from "@/composables/useI18n";

const { t } = useI18n();
const { isLoading, metrics, warnings, syncWeb3, uploadCsv, clearData } =
  useTaxReportPort();

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
</script>

<template>
  <div class="space-y-6 relative w-full">
    <!-- Background Decoration -->
    <div class="absolute -z-10 inset-0 overflow-hidden pointer-events-none">
      <div
        class="absolute -top-1/2 -right-1/2 w-[1000px] h-[1000px] rounded-full bg-primary/5 blur-[120px]"
      />
      <div
        class="absolute -bottom-1/2 -left-1/2 w-[800px] h-[800px] rounded-full bg-primary/5 blur-[100px]"
      />
    </div>

    <!-- Adapter orchestrating Dumb components -->
    <TaxReportHeader @sync="syncWeb3" @upload="uploadCsv" @clear="clearData" />

    <TaxReportSummaryCards :metrics="metrics" />

    <Tabs defaultValue="ledgers" class="space-y-4">
      <TabsList class="bg-card/50 backdrop-blur-sm border-primary/10">
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
        <Tabs defaultValue="spot" class="space-y-4 mt-4">
          <TabsList class="bg-transparent border border-primary/10">
            <TabsTrigger
              value="spot"
              class="cursor-pointer rounded-sm data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
            >
              {{ t("tax.tabs.spot") }}
            </TabsTrigger>
            <TabsTrigger
              value="futures"
              class="cursor-pointer rounded-sm data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
            >
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
