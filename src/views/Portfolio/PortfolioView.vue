<script setup lang="ts">
/**
 * PortfolioView — Component description.
 */

import { usePortfolioData } from "./composables/usePortfolioData";
import { useChartData } from "./composables/useChartData";
import { usePortfolioMetrics } from "@/composables/usePortfolioMetrics";
import { formatCurrency } from "@/composables/useFormatters";

import PortfolioHeader from "@/components/portfolio/PortfolioHeader.vue";
import MetricsRow from "@/components/portfolio/MetricsRow.vue";
import MetricsRowSkeleton from "@/components/portfolio/MetricsRowSkeleton.vue";
import ChartsRow from "@/components/portfolio/ChartsRow.vue";
import ChartsRowSkeleton from "@/components/portfolio/ChartsRowSkeleton.vue";

import LotHierarchyTable from "./components/LotHierarchyTable.vue";
import TokenDetailsModal from "./components/TokenDetailsModal.vue";

// 1. Data Fetching & State
const {
  metrics,
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

// 2. Formatting & Calculations
const {
  pnlValue,
  roiFormatted,
  isBullish,
  realizedIsPositive,
  realizedPnlValue,
} = usePortfolioMetrics(metrics);

// 3. UI Chart Data Transformation
const { allocationData, performanceData } = useChartData(
  metrics,
  filteredHoldings,
);
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
    <div class="flex-1 min-h-0 flex flex-col gap-6 lg:gap-8">
      <!-- 1. Charts first (reference layout) -->
      <ChartsRowSkeleton v-if="isFetching" />
      <ChartsRow
        v-else
        :performanceData="performanceData"
        :allocationData="allocationData"
      />

      <!-- Metrics row below charts -->
      <MetricsRowSkeleton v-if="isFetching" />
      <MetricsRow
        v-else
        :totalEquity="formatCurrency(metrics?.totalEquityEur)"
        :unrealizedPnl="formatCurrency(pnlValue)"
        :realizedPnl="formatCurrency(realizedPnlValue)"
        :roiFormatted="roiFormatted"
        :isBullish="isBullish"
        :realizedIsPositive="realizedIsPositive"
      />

      <!-- Holdings Table -->
      <LotHierarchyTable
        :data="filteredHoldings as any"
        :isLoading="isFetching"
        :onExpand="handleExpandSymbol"
        :detailsMap="expandedDetailsMap"
        @expandRow="handleRowExpand"
      />
    </div>

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
