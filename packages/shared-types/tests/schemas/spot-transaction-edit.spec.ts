import { describe, it, expect } from "vitest";
import { spotTransactionEditSchema, isAllUnchanged } from "../../src/schemas/spot-transaction-edit";

const unchanged = { kind: "UNCHANGED" as const };

function basePayload() {
  return {
    amount_in: unchanged,
    amount_out: unchanged,
    price_fiat: unchanged,
    total_fiat: unchanged,
    fee: unchanged,
    timestamp: unchanged,
    tx_type: unchanged,
  };
}

describe("spotTransactionEditSchema", () => {
  it("accepts a SET price_fiat carrying its own fiatCurrency", () => {
    const payload = {
      ...basePayload(),
      price_fiat: { kind: "SET", value: "42000", fiatCurrency: "EUR" },
    };
    const res = spotTransactionEditSchema.safeParse(payload);
    if (!res.success) console.log(res.error);
    expect(res.success).toBe(true);
  });

  it("rejects a SET price_fiat with no fiatCurrency — a declared price without its currency is not interpretable", () => {
    const payload = {
      ...basePayload(),
      price_fiat: { kind: "SET", value: "42000" },
    };
    const res = spotTransactionEditSchema.safeParse(payload);
    expect(res.success).toBe(false);
  });

  it("accepts exactly the editable fields, all UNCHANGED except one SET field", () => {
    const payload = {
      ...basePayload(),
      amount_in: { kind: "SET", value: "10.5" },
    };
    const res = spotTransactionEditSchema.safeParse(payload);
    if (!res.success) console.log(res.error);
    expect(res.success).toBe(true);
  });

  it("accepts a SET fee_amount charged fee", () => {
    const payload = {
      ...basePayload(),
      fee: { kind: "CHARGED", amount: "0.001", assetId: "BTC" },
    };
    const res = spotTransactionEditSchema.safeParse(payload);
    expect(res.success).toBe(true);
  });

  it("accepts a NONE fee", () => {
    const payload = { ...basePayload(), fee: { kind: "NONE" } };
    const res = spotTransactionEditSchema.safeParse(payload);
    expect(res.success).toBe(true);
  });

  it("accepts a SET tx_type field", () => {
    const payload = { ...basePayload(), tx_type: { kind: "SET", value: "SWAP" } };
    const res = spotTransactionEditSchema.safeParse(payload);
    expect(res.success).toBe(true);
  });

  it("rejects a payload defining account_id", () => {
    const payload = { ...basePayload(), amount_in: { kind: "SET", value: "1" }, account_id: "acct-1" };
    const res = spotTransactionEditSchema.safeParse(payload);
    expect(res.success).toBe(false);
  });

  it("rejects a payload defining asset_in_id", () => {
    const payload = { ...basePayload(), amount_in: { kind: "SET", value: "1" }, asset_in_id: "BTC" };
    const res = spotTransactionEditSchema.safeParse(payload);
    expect(res.success).toBe(false);
  });

  it("rejects a payload defining asset_out_id", () => {
    const payload = { ...basePayload(), amount_in: { kind: "SET", value: "1" }, asset_out_id: "USD" };
    const res = spotTransactionEditSchema.safeParse(payload);
    expect(res.success).toBe(false);
  });

  it("rejects a payload defining transfer_group_id", () => {
    const payload = { ...basePayload(), amount_in: { kind: "SET", value: "1" }, transfer_group_id: "tg-1" };
    const res = spotTransactionEditSchema.safeParse(payload);
    expect(res.success).toBe(false);
  });

  it("rejects a payload defining status", () => {
    const payload = { ...basePayload(), amount_in: { kind: "SET", value: "1" }, status: "COMPLETED" };
    const res = spotTransactionEditSchema.safeParse(payload);
    expect(res.success).toBe(false);
  });

  it("fails a payload where every field is UNCHANGED", () => {
    const res = spotTransactionEditSchema.safeParse(basePayload());
    expect(res.success).toBe(false);
  });

  it("isAllUnchanged flags an all-UNCHANGED payload", () => {
    expect(isAllUnchanged(basePayload())).toBe(true);
  });

  it("isAllUnchanged is false when one field is SET", () => {
    expect(isAllUnchanged({ ...basePayload(), timestamp: { kind: "SET", value: "2024-01-01T00:00:00Z" } })).toBe(false);
  });

  it("rejects a non-decimal-string price_fiat", () => {
    const payload = { ...basePayload(), price_fiat: { kind: "SET", value: "abc" } };
    const res = spotTransactionEditSchema.safeParse(payload);
    expect(res.success).toBe(false);
  });

  it("rejects a negative amount_in", () => {
    const payload = { ...basePayload(), amount_in: { kind: "SET", value: "-5" } };
    const res = spotTransactionEditSchema.safeParse(payload);
    expect(res.success).toBe(false);
  });

  it("rejects a negative price_fiat", () => {
    const payload = { ...basePayload(), price_fiat: { kind: "SET", value: "-1" } };
    const res = spotTransactionEditSchema.safeParse(payload);
    expect(res.success).toBe(false);
  });

  it("rejects a non-ISO-8601 timestamp", () => {
    const payload = { ...basePayload(), timestamp: { kind: "SET", value: "not-a-date" } };
    const res = spotTransactionEditSchema.safeParse(payload);
    expect(res.success).toBe(false);
  });
});
