<script setup lang="ts">
/**
 * TokenDetailsContent — Component description.
 */

import { computed } from "vue";
import TokenSummaryCards from "./TokenSummaryCards.vue";
import TokenActiveLots from "./TokenActiveLots.vue";
import TokenSalesHistory from "./TokenSalesHistory.vue";
import TokenDetailsSkeleton from "./TokenDetailsSkeleton.vue";
import type { CryptoAssetEntity } from "@/core/domain/models/PortfolioEntities";
import type { TaxLotEntity, TaxLotHistoryEvent } from "@/core/domain/models/FiscalEntities";
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const props = defineProps<{
  holding?: CryptoAssetEntity | null;
  lots?: TaxLotEntity[];
  history?: Record<string, TaxLotHistoryEvent[]>;
  loading: boolean;
}>();

const disposalHistory = computed(() => {
  if (!props.history) return [];
  return Object.values(props.history)
    .flatMap((events) => events || [])
    .sort((a, b) => b.disposalDate.getTime() - a.disposalDate.getTime());
});
</script>

<template>
  <TokenDetailsSkeleton v-if="loading" />
  <div v-else class="px-6 py-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
    <div v-if="holding" class="space-y-8">
      <TokenSummaryCards :holding="holding" />

      <TokenActiveLots :lots="lots || []" />
      <TokenSalesHistory :history="disposalHistory" />
    </div>

    <div v-else class="py-12 text-center text-muted-foreground">
      <p>{{ t('token.no_details') }}</p>
    </div>
  </div>
</template>

