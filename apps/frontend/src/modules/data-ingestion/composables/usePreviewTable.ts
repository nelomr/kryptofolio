import { ref, computed, type Ref } from "vue";
import { mapToEntity, validateRow } from "@kryptofolio/core-domain";
import type { TransactionRow, ValidTransactionRow, InvalidTransactionRow } from "@kryptofolio/shared-types";
import type { MarketType } from "../utils/marketDetector";

export function usePreviewTable(marketType: Ref<MarketType>) {
  const rows = ref<TransactionRow[]>([]);

  const generatePreview = (
    rawRows: Record<string, unknown>[],
    mapping: Record<string, string | null>,
  ) => {
    rows.value = rawRows.map((raw, index) => mapToEntity(raw, mapping, index, marketType.value));
  };

  const updateRowField = (rowId: string, field: string, value: string) => {
    const index = rows.value.findIndex((r) => r.id === rowId);
    if (index === -1) return;

    const row = rows.value[index];
    const updatedMappedData = { ...row.mappedData, [field]: value };

    const updatedRow = validateRow({
      ...row,
      mappedData: updatedMappedData,
    } as TransactionRow, marketType.value);

    rows.value[index] = updatedRow;
  };

  const deleteRow = (rowId: string) => {
    rows.value = rows.value.filter((r) => r.id !== rowId);
  };

  const validRows = computed(() => rows.value.filter((r): r is ValidTransactionRow => !r.hasError));
  const invalidRows = computed(() => rows.value.filter((r): r is InvalidTransactionRow => r.hasError));
  const hasErrors = computed(() => invalidRows.value.length > 0);

  return {
    rows,
    generatePreview,
    updateRowField,
    deleteRow,
    validRows,
    invalidRows,
    hasErrors,
  };
}
