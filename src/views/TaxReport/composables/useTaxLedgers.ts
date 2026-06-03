import { computed, ref } from "vue";
import {
  useSpotTransactionsQuery,
  useFuturesTransactionsQuery,
} from "@/composables/queries/useTaxQueries";
import { useAvailableYears } from "./useAvailableYears";
import { useI18n } from "@/composables/useI18n";
import { toast } from "vue-sonner";
import type { TaxTransactionEntity } from "@/core/domain/models/FiscalEntities";

export function useTaxLedgers() {
  const { t } = useI18n();

  // 1. Data Fetching
  const { data: spotData, isLoading: spotLoading } = useSpotTransactionsQuery();
  const { data: futuresData, isLoading: futuresLoading } =
    useFuturesTransactionsQuery();

  // 2. Global available years computation
  const allTransactions = computed(() => [
    ...(spotData.value ?? []),
    ...(futuresData.value ?? []),
  ]);
  const availableYears = useAvailableYears(allTransactions);

  // 3. Local Filters State
  const spotYearFilter = ref<string | null>(null);
  const futuresYearFilter = ref<string | null>(null);

  // 4. Derived Filtered Data
  const filteredSpot = computed(() => {
    if (!spotData.value) return [];
    if (!spotYearFilter.value) return spotData.value;
    return spotData.value.filter(
      (tx) =>
        new Date(tx.timestamp).getFullYear().toString() === spotYearFilter.value,
    );
  });

  const filteredFutures = computed(() => {
    if (!futuresData.value) return [];
    if (!futuresYearFilter.value) return futuresData.value;
    return futuresData.value.filter(
      (tx) =>
        new Date(tx.timestamp).getFullYear().toString() ===
        futuresYearFilter.value,
    );
  });

  // 5. Actions
  function handleEdit(tx: TaxTransactionEntity) {
    // TODO: Link with actual edit mutation/modal when ready
    toast.info(t("common.edit_disabled", { id: tx.id || "unknown" }));
  }

  function handleDelete(id: string) {
    // TODO: Link with actual delete mutation/modal when ready
    toast.info(t("common.delete_disabled", { id }));
  }

  return {
    spotLoading,
    futuresLoading,
    availableYears,
    spotYearFilter,
    futuresYearFilter,
    filteredSpot,
    filteredFutures,
    handleEdit,
    handleDelete,
  };
}
