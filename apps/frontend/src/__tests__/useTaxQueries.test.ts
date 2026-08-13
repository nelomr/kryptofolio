import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { createApp } from "vue";
import { ref } from "vue";
import { PiniaColada } from "@pinia/colada";
import {
  useSpotTransactionsQuery,
  useFuturesTransactionsQuery,
  useTaxReportQuery,
} from "@/composables/queries/useTaxQueries";
import { TAX_PORT_KEY } from "@/core/injectionKeys";
import type { ITaxPort } from "@/core/domain/ports/ITaxPort";
import type {
  TaxTransactionEntity,
  TaxReportEntity,
} from "@/core/domain/models/FiscalEntities";
import { TransactionIdSchema } from "@/core/infrastructure/dtos/BrandedTypeSchemas";

const mockTx: TaxTransactionEntity = {
  id: TransactionIdSchema.parse("tx-mock"),
  type: "BUY",
  symbol: "BTC",
  amount: 1,
  priceEur: 50000,
  feeEur: 10,
  totalEur: 50010,
  timestamp: new Date("2026-06-02T10:00:00Z"),
};

const mockReport: TaxReportEntity = {
  year: 2026,
  method: "FIFO", currency: "EUR", conversion: { kind: "NATIVE" }, unconvertibleEvents: [],
  summary: {
    capitalGains: '1000',
    capitalLosses: '0',
    savingsBaseYields: '0',
    generalBaseAirdrops: '0',
    netPatrimonialResult: '1000',
    estimatedIrpf: '190',
  },
  auditTrail: [],
  excludedFlaggedEvents: 0,
  excludedUnresolvedIncomeCount: 0,
};

function createMockTaxPort(): ITaxPort {
  return {
    getFiscalIntegrity: vi.fn(),
    setManualPriceOverrides: vi.fn(),
    removeManualPriceOverrides: vi.fn(),
    setTransferDestinations: vi.fn(),
    removeTransferDestinations: vi.fn(),
    getSpotTransactions: vi.fn().mockResolvedValue([mockTx]),
    getFuturesTransactions: vi.fn().mockResolvedValue([mockTx]),
    getFuturesDerivatives: vi.fn().mockResolvedValue([]),
    getInvalidTransactions: vi.fn().mockResolvedValue([]),
    getReport: vi.fn().mockResolvedValue(mockReport),
    getAvailableYears: vi.fn().mockResolvedValue([2026]),
    downloadReport: vi.fn().mockResolvedValue(new Blob()),
    deleteTransaction: vi.fn().mockResolvedValue(undefined),
    updateTransaction: vi.fn().mockResolvedValue(undefined),
    validateTransaction: vi.fn().mockResolvedValue(undefined),
    uploadTaxFile: vi.fn().mockResolvedValue(undefined),
    deleteAllTransactions: vi.fn().mockResolvedValue(undefined),
    importWallet: vi.fn().mockResolvedValue(undefined),
    syncWeb3: vi.fn().mockResolvedValue(undefined),
    importTransactions: vi.fn().mockResolvedValue(undefined),
  };
}

describe("Tax Queries Composables", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function setupApp() {
    const app = createApp({});
    app.use(createPinia());
    app.use(PiniaColada);
    const port = createMockTaxPort();
    app.provide(TAX_PORT_KEY, port);
    return { app, port };
  }

  it("useSpotTransactionsQuery fetches transactions and returns reactive state", async () => {
    const { app, port } = setupApp();

    let composable: ReturnType<typeof useSpotTransactionsQuery>;
    app.runWithContext(() => {
      composable = useSpotTransactionsQuery();
    });

    expect(composable!.isLoading.value).toBe(true);

    // wait for query resolution
    await new Promise((r) => setTimeout(r, 10));

    expect(port.getSpotTransactions).toHaveBeenCalled();
    expect(composable!.isLoading.value).toBe(false);
    expect(composable!.data.value).toEqual([mockTx]);
  });

  it("useFuturesTransactionsQuery fetches futures transactions and returns reactive state", async () => {
    const { app, port } = setupApp();

    let composable: ReturnType<typeof useFuturesTransactionsQuery>;
    app.runWithContext(() => {
      composable = useFuturesTransactionsQuery();
    });

    expect(composable!.isLoading.value).toBe(true);

    // wait for query resolution
    await new Promise((r) => setTimeout(r, 10));

    expect(port.getFuturesTransactions).toHaveBeenCalled();
    expect(composable!.isLoading.value).toBe(false);
    expect(composable!.data.value).toEqual([mockTx]);
  });

  it("useTaxReportQuery fetches report correctly when year > 0", async () => {
    const { app, port } = setupApp();
    const year = ref(2026);
    const method = ref("FIFO");

    let composable: ReturnType<typeof useTaxReportQuery>;
    app.runWithContext(() => {
      composable = useTaxReportQuery(year, method);
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(port.getReport).toHaveBeenCalledWith(2026, "FIFO");
    expect(composable!.data.value).toEqual(mockReport);
  });

  it("useTaxReportQuery is disabled when year is 0", async () => {
    const { app, port } = setupApp();
    const year = ref(0);
    const method = ref("FIFO");

    let composable: ReturnType<typeof useTaxReportQuery>;
    app.runWithContext(() => {
      composable = useTaxReportQuery(year, method);
    });

    await new Promise((r) => setTimeout(r, 10));

    // Query disabled means it never calls port
    expect(port.getReport).not.toHaveBeenCalled();
    expect(composable!.data.value).toBeUndefined();
  });
});
