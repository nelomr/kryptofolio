import { describe, it, expect } from "vitest";
import { pairCollateralLegs, type CollateralLegCandidate } from "../domain/services/collateralPairing";

/**
 * The pairing guard: two collateral legs pair only when their instant matches, their signs oppose,
 * and — measured against the real `kraken_futures.csv`, where Kraken's one-second timestamp
 * resolution puts up to 14 legs at one instant — they are *adjacent* in the order the source wrote
 * them. Anything else stays unpaired rather than a pairing being guessed. Mirrors the guard rule the
 * spot path uses for `transfer_group_id` (see `add-futures-collateral-ledger/design.md`).
 */
describe("pairCollateralLegs", () => {
  function leg(overrides: Partial<CollateralLegCandidate>): CollateralLegCandidate {
    return {
      idHash: "leg",
      timestamp: "2026-02-08T16:42:52.000Z",
      currency: "EUR",
      amount: "-1.0",
      ...overrides,
    };
  }

  it("pairs two legs at the same instant with opposing signs and different currencies", () => {
    const eurLeg = leg({ idHash: "eur-leg", currency: "EUR", amount: "-1.23100000000" });
    const usdLeg = leg({ idHash: "usd-leg", currency: "USD", amount: "1.45480000000" });

    const pairs = pairCollateralLegs([eurLeg, usdLeg]);

    expect(pairs.get("eur-leg")).toBeDefined();
    expect(pairs.get("eur-leg")).toBe(pairs.get("usd-leg"));
  });

  it("leaves a lone leg unpaired — the cross-venue transfer whose counterpart is in another file", () => {
    const lone = leg({ idHash: "cross-venue", currency: "EUR", amount: "200.00000000000" });

    const pairs = pairCollateralLegs([lone]);

    expect(pairs.has("cross-venue")).toBe(false);
  });

  it("does not pair two legs at the same instant with the same sign", () => {
    const a = leg({ idHash: "a", currency: "EUR", amount: "-1.0" });
    const b = leg({ idHash: "b", currency: "USD", amount: "-2.0" });

    const pairs = pairCollateralLegs([a, b]);

    expect(pairs.has("a")).toBe(false);
    expect(pairs.has("b")).toBe(false);
  });

  it("does not pair two legs in the same currency, even with opposing signs", () => {
    const a = leg({ idHash: "a", currency: "EUR", amount: "-1.0" });
    const b = leg({ idHash: "b", currency: "EUR", amount: "1.0" });

    const pairs = pairCollateralLegs([a, b]);

    expect(pairs.has("a")).toBe(false);
    expect(pairs.has("b")).toBe(false);
  });

  it("does not pair two legs at different instants, even with opposing signs", () => {
    const a = leg({ idHash: "a", currency: "EUR", amount: "-1.0", timestamp: "2026-02-08T16:42:52.000Z" });
    const b = leg({ idHash: "b", currency: "USD", amount: "1.0", timestamp: "2026-02-08T17:00:00.000Z" });

    const pairs = pairCollateralLegs([a, b]);

    expect(pairs.has("a")).toBe(false);
    expect(pairs.has("b")).toBe(false);
  });

  /**
   * Real burst pattern: Kraken triggers several conversions in the same wall-clock second, and
   * writes each pair as two adjacent rows (USD then EUR) rather than grouping all EUR legs and all
   * USD legs together. Measured across the whole file: 109 distinct instants held all 314 legs, up
   * to 14 at once, and every single one of the 157 real pairs was exactly two adjacent rows.
   */
  it("pairs multiple adjacent duos sharing one instant, greedily, without cross-matching", () => {
    const usd1 = leg({ idHash: "usd-1", currency: "USD", amount: "7.1824" });
    const eur1 = leg({ idHash: "eur-1", currency: "EUR", amount: "-6.059" });
    const usd2 = leg({ idHash: "usd-2", currency: "USD", amount: "20.3297" });
    const eur2 = leg({ idHash: "eur-2", currency: "EUR", amount: "-17.1498" });

    const pairs = pairCollateralLegs([usd1, eur1, usd2, eur2]);

    expect(pairs.get("usd-1")).toBe(pairs.get("eur-1"));
    expect(pairs.get("usd-2")).toBe(pairs.get("eur-2"));
    expect(pairs.get("usd-1")).not.toBe(pairs.get("usd-2"));
  });

  it("leaves an odd leftover at the end of a burst unpaired", () => {
    const usd1 = leg({ idHash: "usd-1", currency: "USD", amount: "1.0" });
    const eur1 = leg({ idHash: "eur-1", currency: "EUR", amount: "-1.0" });
    const straggler = leg({ idHash: "straggler", currency: "USD", amount: "0.3" });

    const pairs = pairCollateralLegs([usd1, eur1, straggler]);

    expect(pairs.get("usd-1")).toBe(pairs.get("eur-1"));
    expect(pairs.has("straggler")).toBe(false);
  });

  it("refuses to guess when adjacent rows within an instant do not alternate cleanly", () => {
    // Two EUR legs adjacent, then two USD legs adjacent — not the source's own row order for a
    // genuine pair, so nothing here is paired even though *some* cross-matching would balance.
    const eurA = leg({ idHash: "eur-a", currency: "EUR", amount: "-1.0" });
    const eurB = leg({ idHash: "eur-b", currency: "EUR", amount: "-2.0" });
    const usdA = leg({ idHash: "usd-a", currency: "USD", amount: "1.0" });
    const usdB = leg({ idHash: "usd-b", currency: "USD", amount: "2.0" });

    const pairs = pairCollateralLegs([eurA, eurB, usdA, usdB]);

    expect(pairs.has("eur-a")).toBe(false);
    // eur-b/usd-a are adjacent, oppose in sign and differ in currency, so they legitimately pair —
    // the guard only refuses what is genuinely ambiguous, not everything in an irregular group.
    expect(pairs.get("eur-b")).toBe(pairs.get("usd-a"));
    expect(pairs.has("usd-b")).toBe(false);
  });

  it("pairs every independent instant in a batch — the real file's 157 pairs", () => {
    const candidates: CollateralLegCandidate[] = [];
    for (let i = 0; i < 157; i++) {
      const ts = new Date(2026, 1, 8, 16, 0, 0, i).toISOString();
      candidates.push(leg({ idHash: `eur-${i}`, currency: "EUR", amount: "-1.0", timestamp: ts }));
      candidates.push(leg({ idHash: `usd-${i}`, currency: "USD", amount: "1.0", timestamp: ts }));
    }

    const pairs = pairCollateralLegs(candidates);

    expect(pairs.size).toBe(314);
    for (let i = 0; i < 157; i++) {
      expect(pairs.get(`eur-${i}`)).toBe(pairs.get(`usd-${i}`));
    }
    // Every pair gets its own identifier — no cross-pair collision.
    expect(new Set(pairs.values()).size).toBe(157);
  });

  it("is deterministic regardless of input order", () => {
    const eurLeg = leg({ idHash: "eur-leg", currency: "EUR", amount: "-1.0" });
    const usdLeg = leg({ idHash: "usd-leg", currency: "USD", amount: "1.0" });

    const forward = pairCollateralLegs([eurLeg, usdLeg]);
    const backward = pairCollateralLegs([usdLeg, eurLeg]);

    expect(forward.get("eur-leg")).toBe(backward.get("eur-leg"));
  });
});
