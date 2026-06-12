<script setup lang="ts">
/**
 * PortfolioView — Component description.
 */

import { usePortfolioData } from "./composables/usePortfolioData";
import { useI18n } from "@/composables/useI18n";
import { RefreshCw } from "lucide-vue-next";

import MetricsDashboard from "./components/metrics/MetricsDashboard.vue";
import PerformanceHistory from "./components/metrics/PerformanceHistory.vue";
import VolatilityHeatmap from "./components/metrics/VolatilityHeatmap.vue";
import AssetAllocation from "./components/metrics/AssetAllocation.vue";
import RiskMetricsCard from "./components/metrics/RiskMetricsCard.vue";
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
        <button
          @click="handleRebuild"
          :disabled="isRebuilding"
          class="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-border/40 text-[10px] font-black uppercase tracking-widest hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw
            class="w-3.5 h-3.5"
            :class="{ 'animate-spin': isRebuilding }"
          />
          {{ isRebuilding ? t("portfolio.syncing") : t("portfolio.sync_btn") }}
        </button>
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
        <div class="grid lg:grid-cols-2 gap-6 lg:gap-8 items-start">
          <PerformanceHistory />
          <VolatilityHeatmap />
        </div>
        <div class="grid lg:grid-cols-2 gap-6 lg:gap-8 items-start">
          <AssetAllocation />
          <RiskMetricsCard />
        </div>
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
