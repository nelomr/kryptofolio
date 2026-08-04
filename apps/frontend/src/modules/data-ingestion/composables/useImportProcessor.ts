import { ref } from "vue";
import { generateIdHash, normalizeTransactionDirection, aggregateRows, normalizeToUtcIso } from "@kryptofolio/core-domain";
import type { SourceProfileId, ValidTransactionRow } from "@kryptofolio/shared-types";
import { useSubmitIngestionMutation } from "@/composables/queries/useTaxMutations";


export function useImportProcessor() {
  const isProcessing = ref(false);
  const processingErrors = ref<string[]>([]);
  const timezone = ref("UTC"); // New state for timezone, defaults to UTC

  const submitIngestion = useSubmitIngestionMutation();

  /**
   * `sourceProfileId` is required rather than defaulted: which source wrote the file decides how its
   * fee column is read, and a default would let an unmeasured export be ingested under someone
   * else's convention with nothing reporting it.
   */
  const processAndSubmit = async (
    validRows: ValidTransactionRow[],
    marketType: "spot" | "futures",
    accountId: string,
    sourceProfileId: SourceProfileId
  ) => {
    if (validRows.length === 0) {
      processingErrors.value = ["ingestion.errors.no_valid_rows_to_import"];
      return false;
    }

    if (!accountId) {
      processingErrors.value = ["ingestion.errors.account_required"];
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

          // Inject account ID before hash generation
          normalizedMappedData.account_id = accountId;

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
        timezone: timezone.value,
        sourceProfileId
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
