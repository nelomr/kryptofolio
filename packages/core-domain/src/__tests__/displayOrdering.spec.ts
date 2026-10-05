import { describe, it, expect } from "vitest";
import { orderByCountDescending, orderByIsoDateDescending, orderByIsoDateDescendingThenKey } from "../domain/services/displayOrdering";

type Group = { id: string; count: number };
type Lot = { id: string; date: string };

describe("orderByCountDescending", () => {
  it("orders by the integer key, largest first", () => {
    const groups: Group[] = [
      { id: "a", count: 2 },
      { id: "b", count: 30 },
      { id: "c", count: 7 },
    ];

    expect(orderByCountDescending(groups, (g) => g.count).map((g) => g.id)).toEqual(["b", "c", "a"]);
  });

  it("keeps the input order for equal keys", () => {
    const groups: Group[] = [
      { id: "a", count: 5 },
      { id: "b", count: 9 },
      { id: "c", count: 5 },
      { id: "d", count: 9 },
      { id: "e", count: 5 },
    ];

    expect(orderByCountDescending(groups, (g) => g.count).map((g) => g.id)).toEqual(["b", "d", "a", "c", "e"]);
  });

  it("does not mutate its input", () => {
    const groups: Group[] = [
      { id: "a", count: 1 },
      { id: "b", count: 2 },
    ];
    const snapshot = [...groups];

    const result = orderByCountDescending(groups, (g) => g.count);

    expect(groups).toEqual(snapshot);
    expect(result).not.toBe(groups);
  });

  it("returns an empty array for an empty input", () => {
    expect(orderByCountDescending([], (g: Group) => g.count)).toEqual([]);
  });
});

describe("orderByIsoDateDescending", () => {
  it("orders by the date string, newest first", () => {
    const lots: Lot[] = [
      { id: "a", date: "2024-03-01" },
      { id: "b", date: "2025-01-15" },
      { id: "c", date: "2023-12-31" },
    ];

    expect(orderByIsoDateDescending(lots, (l) => l.date).map((l) => l.id)).toEqual(["b", "a", "c"]);
  });

  it("keeps the input order for equal dates", () => {
    const lots: Lot[] = [
      { id: "a", date: "2024-03-01" },
      { id: "b", date: "2025-01-15" },
      { id: "c", date: "2024-03-01" },
      { id: "d", date: "2025-01-15" },
    ];

    expect(orderByIsoDateDescending(lots, (l) => l.date).map((l) => l.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("does not mutate its input", () => {
    const lots: Lot[] = [
      { id: "a", date: "2024-01-01" },
      { id: "b", date: "2025-01-01" },
    ];
    const snapshot = [...lots];

    const result = orderByIsoDateDescending(lots, (l) => l.date);

    expect(lots).toEqual(snapshot);
    expect(result).not.toBe(lots);
  });
});

describe("orderByIsoDateDescendingThenKey", () => {
  type Tx = { hash: string; at: string };

  it("orders newest first and breaks a tie on the key ascending", () => {
    const txs: Tx[] = [
      { hash: "b", at: "2025-01-02T00:00:00.000Z" },
      { hash: "z", at: "2025-03-01T00:00:00.000Z" },
      { hash: "a", at: "2025-01-02T00:00:00.000Z" },
    ];

    const result = orderByIsoDateDescendingThenKey(txs, (t) => t.at, (t) => t.hash);

    expect(result.map((t) => t.hash)).toEqual(["z", "a", "b"]);
  });

  it("returns the same order whatever order the input arrives in", () => {
    const txs: Tx[] = [
      { hash: "c", at: "2025-01-01T00:00:00.000Z" },
      { hash: "a", at: "2025-01-01T00:00:00.000Z" },
      { hash: "b", at: "2025-01-01T00:00:00.000Z" },
    ];

    const forward = orderByIsoDateDescendingThenKey(txs, (t) => t.at, (t) => t.hash);
    const backward = orderByIsoDateDescendingThenKey([...txs].reverse(), (t) => t.at, (t) => t.hash);

    expect(forward.map((t) => t.hash)).toEqual(["a", "b", "c"]);
    expect(backward).toEqual(forward);
  });

  it("does not mutate its input", () => {
    const txs: Tx[] = [
      { hash: "b", at: "2025-01-01" },
      { hash: "a", at: "2025-01-02" },
    ];
    const snapshot = [...txs];

    orderByIsoDateDescendingThenKey(txs, (t) => t.at, (t) => t.hash);

    expect(txs).toEqual(snapshot);
  });
});
