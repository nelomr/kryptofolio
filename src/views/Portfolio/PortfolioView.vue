<script setup lang="ts">
/**
 * PortfolioView — Component description.
 */

import { usePortfolioData } from "./composables/usePortfolioData";
import { useChartData } from "./composables/useChartData";
import { usePortfolioMetrics } from "@/composables/usePortfolioMetrics";
import { formatCurrency } from "@/composables/useFormatters";

import { useI18n } from "@/composables/useI18n";

import PortfolioHeader from "@/components/portfolio/PortfolioHeader.vue";
import MetricsRow from "@/components/portfolio/MetricsRow.vue";
import MetricsRowSkeleton from "@/components/portfolio/MetricsRowSkeleton.vue";
import ChartsRow from "@/components/portfolio/ChartsRow.vue";
import ChartsRowSkeleton from "@/components/portfolio/ChartsRowSkeleton.vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import LotHierarchyTable from "./components/LotHierarchyTable.vue";
import TokenDetailsModal from "./components/TokenDetailsModal.vue";

// 1. Data Fetching & State
const { t } = useI18n();

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
    <Tabs defaultValue="holdings" class="flex-1 min-h-0 flex flex-col">
      <div class="flex items-center justify-between mb-6">
        <TabsList>
          <TabsTrigger value="holdings">{{ t('portfolio.holdings') }}</TabsTrigger>
          <TabsTrigger value="metrics">{{ t('portfolio.metrics') }}</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="holdings" class="flex-1 min-h-0 flex flex-col gap-6 lg:gap-8 mt-0 border-0 p-0 outline-none">
        <!-- Metrics row -->
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
      </TabsContent>

      <TabsContent value="metrics" class="flex-1 min-h-0 flex flex-col gap-6 lg:gap-8 mt-0 border-0 p-0 outline-none">
        <ChartsRowSkeleton v-if="isFetching" />
        <ChartsRow
          v-else
          :performanceData="performanceData"
          :allocationData="allocationData"
        />
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
