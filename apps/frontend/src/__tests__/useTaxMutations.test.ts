import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { createApp } from "vue";
import { PiniaColada, useQueryCache } from "@pinia/colada";
import {
  useUploadTaxFileMutation,
  useImportWalletMutation,
  useSyncWeb3Mutation,
  useDeleteTransactionsMutation,
  useSetSpotTransactionOverrideMutation,
  useRemoveSpotTransactionOverrideMutation,
} from "@/composables/queries/useTaxMutations";
import { TAX_TRANSACTIONS_KEY } from "@/composables/queries/useTaxQueries";
import { TAX_PORT_KEY } from "@/core/injectionKeys";
import type { ITaxPort } from "@/core/domain/ports/ITaxPort";

function createMockTaxPort(): ITaxPort {
  return {
    getFiscalIntegrity: vi.fn(),
    setSpotTransactionOverride: vi.fn(),
    removeSpotTransactionOverride: vi.fn(),
    setTransferDestinations: vi.fn(),
    removeTransferDestinations: vi.fn(),
    getSpotTransactions: vi.fn(),
    getFuturesTransactions: vi.fn(),
    getFuturesDerivatives: vi.fn(),
    getInvalidTransactions: vi.fn(),
    getReport: vi.fn(),
    validateTransaction: vi.fn(),
    uploadTaxFile: vi.fn().mockResolvedValue(undefined),
    deleteAllTransactions: vi.fn().mockResolvedValue(undefined),
    importWallet: vi.fn().mockResolvedValue(undefined),
    syncWeb3: vi.fn().mockResolvedValue(undefined),
    downloadReport: vi.fn().mockResolvedValue(new Blob()),
    getAvailableYears: vi.fn(),
    importTransactions: vi.fn(),
  };
}

describe("Tax Mutations Composables", () => {
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

  it("useUploadTaxFileMutation calls port and invalidates transactions query", async () => {
    const { app, port } = setupApp();

    let composable: ReturnType<typeof useUploadTaxFileMutation>;
    let cache: ReturnType<typeof useQueryCache>;

    app.runWithContext(() => {
      composable = useUploadTaxFileMutation();
      cache = useQueryCache();
    });

    const invalidateSpy = vi.spyOn(cache!, "invalidateQueries");
    const mockFile = new File([""], "test.csv");

    await app.runWithContext(() =>
      composable.mutateAsync({ file: mockFile, market: "spot" }),
    );

    expect(port.uploadTaxFile).toHaveBeenCalledWith(mockFile, "spot");
    expect(invalidateSpy).toHaveBeenCalledWith({
      key: TAX_TRANSACTIONS_KEY("spot"),
    });
  });

  it("useImportWalletMutation calls port and invalidates transactions query", async () => {
    const { app, port } = setupApp();

    let composable: ReturnType<typeof useImportWalletMutation>;
    let cache: ReturnType<typeof useQueryCache>;

    app.runWithContext(() => {
      composable = useImportWalletMutation();
      cache = useQueryCache();
    });

    const invalidateSpy = vi.spyOn(cache!, "invalidateQueries");

    await app.runWithContext(() =>
      composable.mutateAsync({ chain: "solana", address: "123" }),
    );

    expect(port.importWallet).toHaveBeenCalledWith("solana", "123");
    expect(invalidateSpy).toHaveBeenCalledWith({ key: TAX_TRANSACTIONS_KEY() });
  });

  it("useSyncWeb3Mutation calls port and invalidates transactions query", async () => {
    const { app, port } = setupApp();

    let composable: ReturnType<typeof useSyncWeb3Mutation>;
    let cache: ReturnType<typeof useQueryCache>;

    app.runWithContext(() => {
      composable = useSyncWeb3Mutation();
      cache = useQueryCache();
    });

    const invalidateSpy = vi.spyOn(cache!, "invalidateQueries");

    await app.runWithContext(() => composable.mutateAsync());

    expect(port.syncWeb3).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({ key: TAX_TRANSACTIONS_KEY() });
  });

  it("useDeleteTransactionsMutation calls port and invalidates BOTH transactions and tax reports queries", async () => {
    const { app, port } = setupApp();

    let composable: ReturnType<typeof useDeleteTransactionsMutation>;
    let cache: ReturnType<typeof useQueryCache>;

    app.runWithContext(() => {
      composable = useDeleteTransactionsMutation();
      cache = useQueryCache();
    });

    const invalidateSpy = vi.spyOn(cache!, "invalidateQueries");

    await app.runWithContext(() => composable.mutateAsync("spot"));

    expect(port.deleteAllTransactions).toHaveBeenCalledWith("spot");
    expect(invalidateSpy).toHaveBeenCalledWith({
      key: TAX_TRANSACTIONS_KEY("spot"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ key: ["tax-report"] });
  });

  it("useSetSpotTransactionOverrideMutation calls the port and invalidates TAX_TRANSACTIONS_KEY('spot') plus the derived fiscal surface", async () => {
    const { app, port } = setupApp();
    (port.setSpotTransactionOverride as ReturnType<typeof vi.fn>).mockResolvedValue({
      applied: 1,
      materialization: null,
      pendingReview: 0,
      balanceCheck: { kind: "CLEAN" },
    });

    let composable: ReturnType<typeof useSetSpotTransactionOverrideMutation>;
    let cache: ReturnType<typeof useQueryCache>;

    app.runWithContext(() => {
      composable = useSetSpotTransactionOverrideMutation();
      cache = useQueryCache();
    });

    const invalidateSpy = vi.spyOn(cache!, "invalidateQueries");
    const payload = {
      amount_in: { kind: "UNCHANGED" as const },
      amount_out: { kind: "UNCHANGED" as const },
      price_fiat: { kind: "SET" as const, value: "42000", fiatCurrency: "EUR" },
      total_fiat: { kind: "UNCHANGED" as const },
      fee: { kind: "UNCHANGED" as const },
      timestamp: { kind: "UNCHANGED" as const },
      tx_type: { kind: "UNCHANGED" as const },
    };

    await app.runWithContext(() =>
      composable.mutateAsync({ idHash: "hash-a" as never, payload }),
    );

    expect(port.setSpotTransactionOverride).toHaveBeenCalledWith("hash-a", payload);
    // The row values themselves changed — invalidateDerivedFiscalData alone omits the list the
    // Ledgers table renders from, which is exactly the gap this mutation must not repeat.
    expect(invalidateSpy).toHaveBeenCalledWith({ key: TAX_TRANSACTIONS_KEY("spot") });
    expect(invalidateSpy).toHaveBeenCalledWith({ key: ["tax-report"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ key: ["token-history"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ key: ["portfolio-summary"] });
    // invalidateDerivedFiscalData already calls invalidatePortfolioAndMetrics — must not run twice.
    const portfolioCalls = invalidateSpy.mock.calls.filter(
      (call) => JSON.stringify(call[0]) === JSON.stringify({ key: ["portfolio-summary"] }),
    );
    expect(portfolioCalls).toHaveLength(1);
  });

  it("useRemoveSpotTransactionOverrideMutation calls the port and invalidates the same surface", async () => {
    const { app, port } = setupApp();
    (port.removeSpotTransactionOverride as ReturnType<typeof vi.fn>).mockResolvedValue({
      applied: 1,
      materialization: null,
      pendingReview: 0,
      balanceCheck: { kind: "CLEAN" },
    });

    let composable: ReturnType<typeof useRemoveSpotTransactionOverrideMutation>;
    let cache: ReturnType<typeof useQueryCache>;

    app.runWithContext(() => {
      composable = useRemoveSpotTransactionOverrideMutation();
      cache = useQueryCache();
    });

    const invalidateSpy = vi.spyOn(cache!, "invalidateQueries");

    await app.runWithContext(() => composable.mutateAsync("hash-a" as never));

    expect(port.removeSpotTransactionOverride).toHaveBeenCalledWith("hash-a");
    expect(invalidateSpy).toHaveBeenCalledWith({ key: TAX_TRANSACTIONS_KEY("spot") });
  });
});
