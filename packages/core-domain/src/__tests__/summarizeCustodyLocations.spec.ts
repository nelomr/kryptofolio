import { describe, it, expect } from "vitest";
import { summarizeCustodyLocations, type CustodyLocationInput } from "../domain/services/summarizeCustodyLocations";

function row(overrides: Partial<CustodyLocationInput>): CustodyLocationInput {
  return {
    tax_lot_id: "lot-1",
    asset_id: "BTC",
    account_id: "kraken",
    account_name: "Kraken",
    is_synthetic: false,
    qty: "1",
    ...overrides,
  };
}

describe("summarizeCustodyLocations", () => {
  it("adds the lots held in one account for one asset, exactly", () => {
    const rows = [
      row({ tax_lot_id: "l1", qty: "0.1" }),
      row({ tax_lot_id: "l2", qty: "0.2" }),
      row({ tax_lot_id: "l3", qty: "12345678901234567890.000000000000000001" }),
    ];

    const { holdings } = summarizeCustodyLocations(rows);

    expect(holdings).toEqual([
      { symbol: "BTC", accountName: "Kraken", quantity: "12345678901234567890.300000000000000001", lotCount: 3 },
    ]);
  });

  it("lists non-synthetic accounts only and counts the synthetic rows without listing them", () => {
    const rows = [
      row({}),
      row({ account_id: "ownwallet-BTC", account_name: "Own Wallet BTC", is_synthetic: true, qty: "5" }),
      row({ tax_lot_id: "l2", account_id: "ownwallet-BTC", account_name: "Own Wallet BTC", is_synthetic: true }),
    ];

    const result = summarizeCustodyLocations(rows);

    expect(result.holdings.map((h) => h.accountName)).toEqual(["Kraken"]);
    expect(result.syntheticRowCount).toBe(2);
  });

  it("filters to one symbol when given", () => {
    const rows = [row({}), row({ asset_id: "ETH", qty: "3" })];

    expect(summarizeCustodyLocations(rows, "ETH").holdings).toEqual([
      { symbol: "ETH", accountName: "Kraken", quantity: "3", lotCount: 1 },
    ]);
  });

  it("drops a zero balance instead of listing an empty location", () => {
    expect(summarizeCustodyLocations([row({ qty: "0" })]).holdings).toEqual([]);
  });

  it("orders by symbol then account name for a stable display", () => {
    const rows = [
      row({ asset_id: "ETH", account_id: "b", account_name: "Bit2Me" }),
      row({ asset_id: "BTC", account_id: "k", account_name: "Kraken" }),
      row({ asset_id: "BTC", account_id: "b", account_name: "Bit2Me" }),
    ];

    expect(summarizeCustodyLocations(rows).holdings.map((h) => `${h.symbol}/${h.accountName}`)).toEqual([
      "BTC/Bit2Me",
      "BTC/Kraken",
      "ETH/Bit2Me",
    ]);
  });
});
