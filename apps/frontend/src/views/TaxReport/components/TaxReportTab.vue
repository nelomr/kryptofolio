<script setup lang="ts">
/**
 * TaxReportTab — Container component for the "Auditoría e Informes" tab.
 *
 * Orchestrates:
 *   - TaxFiscalControls (presentational): exposes year selector + action buttons.
 *   - TaxReportDetailsTable (presentational): renders FIFO audit trail.
 *
 * All data access is performed via the ITaxPort port (injected adapter),
 * through the useTaxReportQuery composable, maintaining clean Hexagonal Architecture.
 * No direct API calls from this component.
 *
 * State owned here:
 *   - selectedYear: the currently selected fiscal year (FIFO fixed).
 *   - isDownloading: whether a report download is in-flight.
 */

import { useDownloadTaxReportMutation } from "@/composables/queries/useTaxMutations";
import { useTaxReportPort } from "../composables/useTaxReportPort";
import TaxFiscalControls from "./TaxFiscalControls.vue";
import TaxReportDetailsTable from "./TaxReportDetailsTable.vue";
import { toast } from "vue-sonner";
import { useI18n } from "@/composables/useI18n";

// ---------------------------------------------------------------------------
// Port & i18n
// ---------------------------------------------------------------------------

const { t } = useI18n();

// ---------------------------------------------------------------------------
// Report state (lifted to Port for global metrics sync)
// ---------------------------------------------------------------------------

const {
  availableYears,
  selectedYear,
  effectiveYear,
  report,
  isLoading: reportLoading,
  refetchReport,
} = useTaxReportPort();

// ---------------------------------------------------------------------------
// Download state
// ---------------------------------------------------------------------------

const { mutateAsync: downloadReport, isLoading: isDownloading } =
  useDownloadTaxReportMutation();

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function handleRecalculate(year: number) {
  selectedYear.value = year;
  // useTaxReportQuery is reactive on effectiveYear — refetch is triggered automatically.
  // An explicit refresh is called to force a refetch even for the same key.
  refetchReport();
}

async function handleDownload(year: number, format: "csv") {
  try {
    await downloadReport({ year, format });
  } catch (err) {
    console.error("[TaxReportTab] Download failed:", err);
    toast.error(t("tax.audit.downloading"), { description: String(err) });
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Fiscal Controls Panel (presentational) -->
    <TaxFiscalControls
      :available-years="availableYears"
      :selected-year="effectiveYear"
      :is-loading="reportLoading"
      :is-downloading="isDownloading"
      @update:selected-year="handleRecalculate"
      @download="handleDownload"
    />

    <!-- FIFO Audit Trail Table (presentational) -->
    <TaxReportDetailsTable
      :audit-trail="report?.auditTrail ?? []"
      :is-loading="reportLoading"
    />
  </div>
</template>
