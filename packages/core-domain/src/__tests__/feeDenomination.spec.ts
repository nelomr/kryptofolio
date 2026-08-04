import { describe, it, expect } from "vitest";
import { normalizeTransactionDirection } from "../domain/services/TransactionNormalizer";
import type { TransactionMappedData } from "@kryptofolio/shared-types";

/**
 * Row shapes taken from `kraken_spot.csv`, whose export has no fee-currency column at all: the fee is
 * denominated in the row's own `asset`. Row aggregation only ever sees merged groups, so a single-leg
 * row reached the ledger with an amount and no denomination — a pair rejected both by
 * `LedgerSpotTransactionSchema`'s refine and by the `CHECK ((fee_amount IS NULL) = (fee_asset_id IS NULL))`.
 */
describe("fee denomination on a single-leg row", () => {
  it("denominates a Kraken withdrawal fee in the asset that left", () => {
    const data: TransactionMappedData = {
      date: "2025-11-10 15:48:07",
      tx_type: "withdrawal",
      amount: "-0.0060000000",
      asset: "SOL",
      fee_amount: "0.0050000000",
      metadata: { subclass: "crypto" },
    };

    const result = normalizeTransactionDirection(data);

    expect(result.tx_type).toBe("TRANSFER_OUT");
    expect(result.amount_out).toBe("0.006");
    expect(result.fee_amount).toBe("0.0050000000");
    expect(result.fee_currency).toBe("SOL");
  });

  it("denominates a zero fee too, because zero is a value and not missing information", () => {
    const data: TransactionMappedData = {
      date: "2025-09-16 13:07:47",
      tx_type: "deposit",
      amount: "24.00000",
      asset: "HBAR",
      fee_amount: "0",
      metadata: { subclass: "crypto" },
    };

    const result = normalizeTransactionDirection(data);

    expect(result.tx_type).toBe("TRANSFER_IN");
    expect(result.fee_amount).toBe("0");
    expect(result.fee_currency).toBe("HBAR");
  });

  it("keeps a negative fee's sign, since a rebate is a credit and not a disposal", () => {
    const data: TransactionMappedData = {
      date: "2025-09-16 12:06:58",
      tx_type: "deposit",
      amount: "50.0000",
      asset: "EUR",
      fee_amount: "-0.00543739",
      metadata: { subclass: "fiat" },
    };

    const result = normalizeTransactionDirection(data);

    expect(result.fee_amount).toBe("-0.00543739");
    expect(result.fee_currency).toBe("EUR");
  });

  it("never overwrites a denomination the source stated, even when it differs from the asset", () => {
    const data: TransactionMappedData = {
      date: "2025-04-01 09:00:00",
      tx_type: "withdrawal",
      amount: "-179.5",
      asset: "XRP",
      fee_amount: "0.7499",
      fee_currency: "EUR",
      metadata: { subclass: "crypto" },
    };

    const result = normalizeTransactionDirection(data);

    expect(result.fee_currency).toBe("EUR");
  });

  it("invents no denomination where the source recorded no fee at all", () => {
    const data: TransactionMappedData = {
      date: "2025-09-16 13:07:47",
      tx_type: "deposit",
      amount: "24.00000",
      asset: "HBAR",
      metadata: { subclass: "crypto" },
    };

    const result = normalizeTransactionDirection(data);

    expect(result.fee_amount).toBeUndefined();
    expect(result.fee_currency).toBeUndefined();
  });

  it("leaves an empty fee cell as the absence it is, rather than denominating nothing", () => {
    const data: TransactionMappedData = {
      date: "2025-09-16 13:07:47",
      tx_type: "deposit",
      amount: "24.00000",
      asset: "HBAR",
      fee_amount: "",
      metadata: { subclass: "crypto" },
    };

    const result = normalizeTransactionDirection(data);

    expect(result.fee_currency ?? undefined).toBeUndefined();
  });

  it("denominates a trade fee in the asset the row names", () => {
    const data: TransactionMappedData = {
      date: "2025-05-02 10:00:00",
      tx_type: "buy",
      amount: "1000",
      asset: "PUMP",
      fee_amount: "0.42",
      metadata: {},
    };

    const result = normalizeTransactionDirection(data);

    expect(result.tx_type).toBe("BUY");
    expect(result.fee_currency).toBe("PUMP");
  });
});
