import { describe, it, expectTypeOf } from "vitest";
import { rankHoldingsByValue } from "../domain/services/holdingRanking";

interface Holding {
  readonly id: string;
  readonly value: string | undefined;
  readonly count: number;
}

/**
 * `vitest run` compiles `expectTypeOf` to nothing, so this file only asserts anything because
 * `tsconfig.typecheck.json` includes `src/**` and `pnpm typecheck` runs `tsc` over it.
 */
describe("rankHoldingsByValue signature", () => {
  it("takes a value accessor returning exactly string | undefined, so the absent case cannot be hidden", () => {
    type Accessor = Parameters<typeof rankHoldingsByValue<Holding>>[1];

    expectTypeOf<Accessor>().toEqualTypeOf<(h: Holding) => string | undefined>();
    expectTypeOf<ReturnType<Accessor>>().toEqualTypeOf<string | undefined>();
  });

  it("rejects an accessor whose value type cannot express absence", () => {
    // @ts-expect-error a number return would let a missing value collapse to 0
    rankHoldingsByValue<Holding>([], (h) => h.count, 1);
    // @ts-expect-error null is not the absent case this contract recognises
    rankHoldingsByValue<Holding>([], () => null, 1);
    rankHoldingsByValue<Holding>([], (h) => h.value, 1);
  });
});
