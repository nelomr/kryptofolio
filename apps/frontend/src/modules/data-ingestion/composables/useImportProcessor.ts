import { ref } from "vue";
import { normalizeToUtcIso } from "@kryptofolio/core-domain";
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

      /**
       * The rows go out as the source wrote them, with only the account and the instant added.
       *
       * Classification, aggregation and the identifier all live behind the ingestion boundary now.
       * Merging here was why the backend never received two legs of a movement, it made re-ingesting
       * one file depend on the client version that submitted it, and it computed the idempotency key
       * over a record the client had already restructured.
       */
      const rows = rowsWithTimestamp.map((row) => ({
        ...row,
        mappedData: { ...row.mappedData, account_id: accountId },
      }));

      await submitIngestion.mutateAsync({
        rows,
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
