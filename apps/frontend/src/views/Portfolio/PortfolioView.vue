<script setup lang="ts">
/**
 * PortfolioView — Component description.
 */

import { usePortfolioData } from "./composables/usePortfolioData";
import { useI18n } from "@/composables/useI18n";

import PortfolioHeader from "@/components/portfolio/PortfolioHeader.vue";
import MetricsDashboard from "./components/metrics/MetricsDashboard.vue";
import PerformanceHistory from "./components/metrics/PerformanceHistory.vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import LotHierarchyTable from "./components/LotHierarchyTable.vue";
import TokenDetailsModal from "./components/TokenDetailsModal.vue";

// 1. Data Fetching & State
const { t } = useI18n();

const {
  isFetching,
  isRebuilding,
  handleRebuild,
  filteredHoldings,

  // Modal & Details State (from Port/Adapter)
  isModalOpen,
  selectedSymbol,
  selectedHolding,
  tokenDetails,
  isFetchingDetails,
  handleExpandSymbol,
  expandedDetailsMap,
  handleRowExpand,
} = usePortfolioData();
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden bg-transparent">
    <!-- Header -->
    <PortfolioHeader
      :isFetching="isFetching"
      :isRebuilding="isRebuilding"
      @rebuild="handleRebuild"
    />

    <!-- Content Grid -->
    <Tabs defaultValue="holdings" class="flex-1 min-h-0 flex flex-col">
      <div class="flex items-center justify-between mb-6">
        <TabsList>
          <TabsTrigger value="holdings">{{
            t("portfolio.holdings")
          }}</TabsTrigger>
          <TabsTrigger value="metrics">{{
            t("portfolio.metrics")
          }}</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent
        value="holdings"
        class="flex-1 min-h-0 flex flex-col gap-6 lg:gap-8 mt-0 border-0 p-0 outline-none"
      >
        <!-- Metrics dashboard -->
        <MetricsDashboard />

        <!-- Holdings Table -->
        <LotHierarchyTable
          :data="filteredHoldings as any"
          :isLoading="isFetching"
          :onExpand="handleExpandSymbol"
          :detailsMap="expandedDetailsMap"
          @expandRow="handleRowExpand"
        />
      </TabsContent>

      <TabsContent
        value="metrics"
        class="flex-1 min-h-0 flex flex-col gap-6 lg:gap-8 mt-0 border-0 p-0 outline-none"
      >
        <PerformanceHistory />
      </TabsContent>
    </Tabs>

    <!-- Token Details Modal -->
    <TokenDetailsModal
      :isOpen="isModalOpen"
      :symbol="selectedSymbol"
      :holding="selectedHolding"
      :lots="tokenDetails?.lots"
      :history="tokenDetails?.history"
      :loading="isFetchingDetails"
      @close="isModalOpen = false"
    />
  </div>
</template>
