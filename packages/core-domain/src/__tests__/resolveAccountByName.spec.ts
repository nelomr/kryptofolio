import { describe, it, expect } from "vitest";
import { accountSubtree, resolveAccountByName } from "../domain/services/resolveAccountByName";

const account = (id: string, name: string, parentAccountId: string | null = null) => ({ id, name, parentAccountId });

const ACCOUNTS = [
  account("kraken", "Kraken"),
  account("kraken-futures", "Kraken Futures"),
  account("bit2me", "Bit2Me"),
  account("bitvavo", "Bitvavo"),
  account("kraken:spot", "Kraken:spot", "kraken"),
];

describe("resolveAccountByName", () => {
  it("resolves an exact name case-insensitively", () => {
    expect(resolveAccountByName(ACCOUNTS, "KRAKEN")).toEqual({ kind: "resolved", account: ACCOUNTS[0] });
  });

  it("lets an exact match beat a prefix match", () => {
    const result = resolveAccountByName(ACCOUNTS, "kraken");

    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") expect(result.account.id).toBe("kraken");
  });

  it("resolves when exactly one name starts with the input", () => {
    const result = resolveAccountByName(ACCOUNTS, "bit2");

    expect(result).toEqual({ kind: "resolved", account: ACCOUNTS[2] });
  });

  it("is ambiguous when several names start with the input and no name equals it, listing names only", () => {
    const result = resolveAccountByName(ACCOUNTS, "bit");

    expect(result).toEqual({ kind: "ambiguous", candidates: ["Bit2Me", "Bitvavo"] });
  });

  it("caps ambiguous candidates at 10 names", () => {
    const many = Array.from({ length: 14 }, (_, i) => account(`id${i}`, `Venue ${String(i).padStart(2, "0")}`));

    const result = resolveAccountByName(many, "venue");

    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") expect(result.candidates).toHaveLength(10);
  });

  it("reports not_found with the top-level names only, capped at 20", () => {
    const many = Array.from({ length: 25 }, (_, i) => account(`id${i}`, `Venue ${String(i).padStart(2, "0")}`));

    const result = resolveAccountByName([...many, account("child", "Child", "id0")], "nothing");

    expect(result.kind).toBe("not_found");
    if (result.kind === "not_found") {
      expect(result.available).toHaveLength(20);
      expect(result.available).not.toContain("Child");
    }
  });

  it("treats an empty candidate list as not_found", () => {
    expect(resolveAccountByName([], "kraken")).toEqual({ kind: "not_found", available: [] });
  });
});

describe("accountSubtree", () => {
  it("returns the account followed by its descendants at any depth, in input order", () => {
    const tree = [
      account("a", "A"),
      account("a1", "A1", "a"),
      account("a1x", "A1x", "a1"),
      account("b", "B"),
    ];

    expect(accountSubtree(tree, "a").map((a) => a.id)).toEqual(["a", "a1", "a1x"]);
  });

  it("returns just the account when it has no children", () => {
    expect(accountSubtree(ACCOUNTS, "bitvavo").map((a) => a.id)).toEqual(["bitvavo"]);
  });
});
