import { describe, it, expect } from "vitest";
import {
  SpotTransactionSchema,
  FuturesTransactionSchema,
  createTransactionIdHash,
} from "../../src/schemas/ledger";

describe("Ledger Schemas", () => {
  describe("SpotTransactionSchema", () => {
    it("should accept valid spot transaction", () => {
      const valid = {
        id: "id-123",
        id_hash: "hash-123",
        account_id: "5a68d802-7105-46d9-b314-8fd5fbd731f8",
        timestamp: "2023-01-01T12:00:00Z",
        tx_type: "BUY",
        amount_in: "100.5",
        asset_in_id: "BTC",
        amount_out: "5000",
        asset_out_id: "USD",
        fee_amount: "0.1",
        fee_asset_id: "BTC",
        total_fiat: "5000",
        price_fiat: "50",
        fiat_currency: "USD",
        status: "COMPLETED",
      };
      const res = SpotTransactionSchema.safeParse(valid);
      if (!res.success) console.log(res.error);
      expect(res.success).toBe(true);
    });

    it("should reject invalid amount format", () => {
      const invalid = {
        tx_id: "tx-123",
        account_id: '10000000-0000-0000-0000-000000000001',
        timestamp: "2023-01-01T12:00:00Z",
        type: "buy",
        amount_in: "100.5.5", // invalid
        asset_in: "BTC",
        amount_out: "2000.0",
        asset_out: "USD",
        fee_amount: "0.1",
        fee_asset: "BTC",
        exchange: "binance"
      };
      expect(SpotTransactionSchema.safeParse(invalid).success).toBe(false);
    });
    
    it("should reject missing required fields", () => {
      const invalid = {
        timestamp: "2023-01-01T12:00:00Z",
        type: "buy",
        amount_in: "100.5",
        asset_in: "BTC",
        amount_out: "2000.0",
        asset_out: "USD"
      };
      expect(SpotTransactionSchema.safeParse(invalid).success).toBe(false);
    });
  });

  describe("FuturesTransactionSchema", () => {
    it("should accept valid futures transaction", () => {
      const valid = {
        id: "id-456",
        id_hash: "hash-456",
        account_id: "5a68d802-7105-46d9-b314-8fd5fbd731f8",
        timestamp: "2023-01-01T12:00:00Z",
        tx_type: "TRADE",
        symbol: "USDT",
        amount: "500.50",
        trade_price: "1.0",
        realized_pnl: "10.0",
        settlement_asset_id: "USDT",
        funding_amount: "0",
        fee_amount: "1.2",
        fee_asset_id: "USDT",
        fiat_currency: "USD",
        status: "COMPLETED",
      };
      const res = FuturesTransactionSchema.safeParse(valid);
      if (!res.success) console.log(res.error);
      expect(res.success).toBe(true);
    });

    it("should reject invalid negative amounts if required positive or format is bad", () => {
      const invalid = {
        tx_id: "tx-456",
        account_id: "5a68d802-7105-46d9-b314-8fd5fbd731f8",
        timestamp: "2023-01-01T12:00:00Z",
        type: "realized_pnl",
        asset: "USDT",
        amount: "500.50.12", // bad format
        fee_amount: "1.2",
        fee_asset: "USDT",
        exchange: "binance"
      };
      expect(FuturesTransactionSchema.safeParse(invalid).success).toBe(false);
    });
  });
});

describe("createTransactionIdHash", () => {
  it("carries the deterministic transaction identity that overrides key on", () => {
    expect(createTransactionIdHash("a3f1c2")).toBe("a3f1c2");
  });

  it("rejects an empty identity, which would silently apply an override to every row", () => {
    // Matched on the full message on purpose: a bare /TransactionIdHash/ also matches
    // "createTransactionIdHash is not a function", so the assertion would pass before the function
    // existed at all.
    expect(() => createTransactionIdHash("")).toThrow(/^Invalid TransactionIdHash/);
  });
});
