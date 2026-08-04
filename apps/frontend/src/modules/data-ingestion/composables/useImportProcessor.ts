import { ref } from "vue";
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
      /**
       * The rows go out as the source wrote them, with only the account added.
       *
       * Classification, aggregation, the identifier and the instant all live behind the ingestion
       * boundary now. Merging here was why the backend never received two legs of a movement, it made
       * re-ingesting one file depend on the client version that submitted it, and it computed the
       * idempotency key over a record the client had already restructured. Converting the instant here
       * was the same mistake in its last remaining corner: the rows still carried `date` and `time`, so
       * whatever ran behind the boundary converted them a second time and won.
       */
      const rows = validRows.map((row) => ({
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
