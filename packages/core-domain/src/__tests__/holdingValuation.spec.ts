import { describe, it, expect } from "vitest";
import { addRealized, sumValuedHoldings } from "../domain/services/holdingValuation";

type Holding = { id: string; valued?: { value: string; costBasis: string } };

const valueOf = (h: Holding) => h.valued;

describe("sumValuedHoldings", () => {
  it("sums equity and cost basis exactly and derives unrealized from the two sums", () => {
    const totals = sumValuedHoldings(
      [
        { id: "a", valued: { value: "0.10", costBasis: "0.05" } },
        { id: "b", valued: { value: "0.20", costBasis: "0.01" } },
        { id: "c" },
      ],
      valueOf,
    );

    expect(totals).toEqual({ equity: "0.30", costBasis: "0.06", unrealized: "0.24" });
  });

  it("keeps full decimal precision beyond what a float can hold", () => {
    const totals = sumValuedHoldings(
      [
        { id: "a", valued: { value: "9007199254740993.01", costBasis: "0" } },
        { id: "b", valued: { value: "0.01", costBasis: "0" } },
      ],
      valueOf,
    );

    expect(totals.equity).toBe("9007199254740993.02");
  });

  it("excludes holdings the valuer leaves undefined instead of counting them as zero", () => {
    const totals = sumValuedHoldings(
      [{ id: "a", valued: { value: "10", costBasis: "4" } }, { id: "b" }],
      valueOf,
    );

    expect(totals).toEqual({ equity: "10.00", costBasis: "4.00", unrealized: "6.00" });
  });

  it("does not round per holding before summing", () => {
    const totals = sumValuedHoldings(
      [
        { id: "a", valued: { value: "0.004", costBasis: "0" } },
        { id: "b", valued: { value: "0.004", costBasis: "0" } },
      ],
      valueOf,
    );

    expect(totals.equity).toBe("0.01");
  });

  it("returns zero totals for an empty valued set", () => {
    expect(sumValuedHoldings([], valueOf)).toEqual({
      equity: "0.00",
      costBasis: "0.00",
      unrealized: "0.00",
    });
    expect(sumValuedHoldings([{ id: "a" }], valueOf).equity).toBe("0.00");
  });
});

describe("addRealized", () => {
  it("adds the realized figure to unrealized exactly", () => {
    expect(
      addRealized({ equity: "0", costBasis: "0", unrealized: "0.10" }, "0.20"),
    ).toBe("0.30");
  });
});
