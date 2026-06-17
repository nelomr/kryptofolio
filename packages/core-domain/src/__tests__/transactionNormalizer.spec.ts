import { describe, it, expect } from "vitest";
import { normalizeTransactionDirection } from "../domain/services/TransactionNormalizer";
import type { TransactionMappedData } from "@kryptofolio/shared-types";

describe("Transaction Normalizer (Dumb Pipe - Zero Math)", () => {
  describe("Buy Strategy", () => {
    it("should map generic amount/asset to amount_in/asset_in for a BUY", () => {
      const data: TransactionMappedData = {
        date: "2023-01-01",
        time: "12:00",
        tx_type: "buy",
        amount: "1.5",
        asset: "BTC",
        metadata: {
          "quote amount": "30000",
          "quote currency": "USD",
        },
      };

      const result = normalizeTransactionDirection(data);

      expect(result.tx_type).toBe("BUY");
      expect(result.amount_in).toBe("1.5");
      expect(result.asset_in).toBe("BTC");
      // Total fiat is NOT calculated from math. If the aggregator or UI mapped it to metadata,
      // it stays in metadata or is caught by columnAutoMapper.
      // Math is zeroed out.
      expect(result.amount).toBeUndefined();
      expect(result.asset).toBeUndefined();
    });

    it("should pass through explicitly mapped total_fiat without modifying it", () => {
      const data: TransactionMappedData = {
        date: "2023-01-01",
        time: "12:00",
        tx_type: "buy",
        amount_in: "2",
        asset_in: "ETH",
        total_fiat: "3000",
        fiat_currency: "EUR",
        metadata: {},
      };
      const result = normalizeTransactionDirection(data);
      expect(result.amount_in).toBe("2");
      expect(result.total_fiat).toBe("3000");
    });
  });

  describe("Sell Strategy", () => {
    it("should map generic amount/asset to amount_out/asset_out for a SELL", () => {
      const data: TransactionMappedData = {
        date: "2023-01-01",
        time: "12:00",
        tx_type: "sell",
        amount: "0.5",
        asset: "BTC",
        metadata: {},
      };
      const result = normalizeTransactionDirection(data);
      expect(result.tx_type).toBe("SELL");
      expect(result.amount_out).toBe("0.5");
      expect(result.asset_out).toBe("BTC");
      expect(result.amount).toBeUndefined();
    });
  });

  describe("Transfer Strategies", () => {
    it("should handle deposit mapping generic to IN", () => {
      const data: TransactionMappedData = {
        date: "2023-01-01",
        time: "12:00",
        tx_type: "deposit",
        amount: "100",
        asset: "XRP",
        metadata: {},
      };
      const result = normalizeTransactionDirection(data);
      expect(result.tx_type).toBe("DEPOSIT");
      expect(result.amount_in).toBe("100");
      expect(result.asset_in).toBe("XRP");
      expect(result.amount_out).toBeUndefined();
    });

    it("should handle withdrawal mapping generic to OUT", () => {
      const data: TransactionMappedData = {
        date: "2023-01-01",
        time: "12:00",
        tx_type: "withdrawal",
        amount: "50",
        asset: "ADA",
        metadata: {},
      };
      const result = normalizeTransactionDirection(data);
      expect(result.tx_type).toBe("WITHDRAWAL");
      expect(result.amount_out).toBe("50");
      expect(result.asset_out).toBe("ADA");
      expect(result.amount_in).toBeUndefined();
    });

    it("should split generic transfer based on sign", () => {
      const dataIn: TransactionMappedData = {
        date: "2023-01-01",
        time: "12:00",
        tx_type: "transfer",
        amount: "100",
        asset: "USDT",
        metadata: {},
      };
      const resultIn = normalizeTransactionDirection(dataIn);
      expect(resultIn.tx_type).toBe("TRANSFER_IN");
      expect(resultIn.amount_in).toBe("100");

      const dataOut: TransactionMappedData = {
        date: "2023-01-01",
        time: "12:00",
        tx_type: "transfer",
        amount: "-100",
        asset: "USDT",
        metadata: {},
      };
      const resultOut = normalizeTransactionDirection(dataOut);
      expect(resultOut.tx_type).toBe("TRANSFER_OUT");
      expect(resultOut.amount_out).toBe("100"); // Note: absolute value
    });
  });

  describe("Crypto Native Strategies (Staking, Airdrop)", () => {
    it("should handle staking as a pure receive", () => {
      const data: TransactionMappedData = {
        date: "2023-01-01",
        time: "12:00",
        tx_type: "staking",
        amount: "5",
        asset: "SOL",
        metadata: {},
      };
      const result = normalizeTransactionDirection(data);
      expect(result.amount_in).toBe("5");
      expect(result.asset_in).toBe("SOL");
    });
  });

  describe("Metadata Normalizer", () => {
    it("should normalize obscure metadata keys", () => {
      const data: TransactionMappedData = {
        date: "2023-01-01",
        time: "12:00",
        tx_type: "buy",
        metadata: {
          chain: "Ethereum",
          estado: "Completed",
          wallet: "My Main Account",
        },
      };
      const result = normalizeTransactionDirection(data);
      expect(result.metadata.network).toBe("Ethereum");
      expect(result.metadata.status).toBe("Completed");
      expect(result.metadata.account_id).toBe("My Main Account");
      expect(result.metadata.chain).toBeUndefined();
    });
  });
});
