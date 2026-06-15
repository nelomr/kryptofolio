import { ref } from "vue";
import { generateIdHash } from "../utils/hash";
import type { ValidTransactionRow } from "../types";
import { useSubmitIngestionMutation } from "@/composables/queries/useTaxMutations";
import { normalizeToUtcIso } from "../utils/dateNormalizer";
import { normalizeTransactionDirection } from "../utils/transactionNormalizer";
import { aggregateRows } from "../utils/normalizer/rowAggregator";

export function useImportProcessor() {
  const isProcessing = ref(false);
  const processingErrors = ref<string[]>([]);
  const timezone = ref("UTC"); // New state for timezone, defaults to UTC

  const submitIngestion = useSubmitIngestionMutation();

  const processAndSubmit = async (
    validRows: ValidTransactionRow[],
    marketType: "spot" | "futures",
  ) => {
    if (validRows.length === 0) {
      processingErrors.value = ["ingestion.errors.no_valid_rows_to_import"];
      return false;
    }

    isProcessing.value = true;
    processingErrors.value = [];

    try {
      const rowsWithTimestamp = await Promise.all(
        validRows.map(async (row) => {
          const rowTimezone = row.mappedData.timezone || timezone.value;
          const timestamp = normalizeToUtcIso(
            row.mappedData.date ?? null,
            row.mappedData.time ?? null,
            rowTimezone,
          );
          row.mappedData.timestamp = timestamp;
          return row;
        })
      );

      // --- NEW AGGREGATION PHASE ---
      const aggregatedRows = aggregateRows(rowsWithTimestamp);

      const rowsWithHash = await Promise.all(
        aggregatedRows.map(async (row) => {
          const normalizedMappedData = normalizeTransactionDirection(row.mappedData);

          const id_hash = await generateIdHash(normalizedMappedData);
          return { ...row, mappedData: normalizedMappedData, id_hash };
        }),
      );

      // FIXME: Temporary console logs until backend is fully implemented
      console.log("🚀 [Data Ingestion] Payload ready to be sent:", {
        market: marketType,
        totalRows: rowsWithHash.length,
        timezone: timezone.value
      });
      console.table(rowsWithHash.map((r) => ({ ...r.mappedData, id_hash: r.id_hash })));

      await submitIngestion.mutateAsync({
        rows: rowsWithHash,
        market: marketType,
        timezone: timezone.value
      });

      return true;
    } catch (err) {
      processingErrors.value = [
        err instanceof Error
          ? err.message
          : "ingestion.errors.unknown_submission_error",
      ];
      return false;
    } finally {
      isProcessing.value = false;
    }
  };

  return {
    isProcessing,
    processingErrors,
    timezone,
    processAndSubmit,
  };
}
