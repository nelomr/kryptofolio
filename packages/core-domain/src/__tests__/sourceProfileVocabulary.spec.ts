import { describe, expect, it } from "vitest";
import { SOURCE_PROFILE_IDS } from "@kryptofolio/shared-types";

import { COLUMN_DICTIONARY } from "../application/use-cases/AutoMapColumnsUseCase";
import { SOURCE_FORMAT_PROFILES } from "../domain/services/sourceProfile/profiles";
import type {
  DeclaredMarket,
  DirectionalFill,
  FeeConvention,
  FeeDenomination,
  HeaderSignature,
  ProfileInvariant,
  SourceFormatProfile,
} from "../domain/services/sourceProfile/types";
import {
  BIT2ME_ROWS,
  BITUNIX_ROWS,
  BITVAVO_ROWS,
  KRAKEN_FUTURES_ROWS,
  KRAKEN_SPOT_ROWS,
  TANGEM_ROWS,
} from "./fixtures/realSourceRows";

/**
 * Exhaustive over each `kind` with no `default` arm: a member added to any dimension fails to
 * compile here rather than falling through at run time.
 */
function describeDenomination(value: FeeDenomination): string {
  switch (value.kind) {
    case "ROW_ASSET":
      return "row asset";
    case "NAMED_COLUMN":
      return `named column ${value.sourceColumn}`;
    case "COLLATERAL_CURRENCY":
      return "collateral currency";
  }
}

function describeConvention(value: FeeConvention): string {
  switch (value.kind) {
    case "NET_PLUS_FEE":
      return "net + fee";
    case "GROSS_AND_NET":
      return "gross and net";
    case "FEE_INSIDE_TOTAL":
      return "fee inside total";
    case "UNDETERMINED":
      return "undetermined";
  }
}

function describeFill(value: DirectionalFill): string {
  switch (value.kind) {
    case "ONE_SIDED":
      return "one side";
    case "BOTH_SIDES_WRITTEN":
      return "both sides";
  }
}

function describeMarket(value: DeclaredMarket): string {
  switch (value.kind) {
    case "SPOT":
      return "spot";
    case "FUTURES":
      return "futures";
    case "UNDECLARED":
      return "undeclared";
  }
}

function describeInvariant(value: ProfileInvariant): string {
  switch (value.kind) {
    case "NONE":
      return "none";
    case "RUNNING_BALANCE":
      return `running balance, ${value.rowOrder}`;
    case "OVER_DETERMINED_ROW":
      return "over-determined row";
  }
}

function describeSignature(value: HeaderSignature): string {
  switch (value.kind) {
    case "HEADER_SET":
      return `${value.required.length} required, ${value.forbidden.length} forbidden`;
    case "NOT_DETECTABLE":
      return "not detectable";
  }
}

const profiles: readonly SourceFormatProfile[] = Object.values(SOURCE_FORMAT_PROFILES);

describe("the source format profile table", () => {
  it("has exactly one profile per declared identifier, with no missing and no extra key", () => {
    expect(Object.keys(SOURCE_FORMAT_PROFILES).sort()).toEqual(
      [...SOURCE_PROFILE_IDS].sort(),
    );
  });

  it("gives every profile its own identifier as its key", () => {
    for (const [key, profile] of Object.entries(SOURCE_FORMAT_PROFILES)) {
      expect(profile.id).toBe(key);
    }
  });

  it("declares every dimension of every profile as a discriminated union member", () => {
    for (const profile of profiles) {
      expect(describeDenomination(profile.feeDenomination)).toBeTruthy();
      expect(describeConvention(profile.feeConvention)).toBeTruthy();
      expect(describeFill(profile.directionalFill)).toBeTruthy();
      expect(describeMarket(profile.market)).toBeTruthy();
      expect(describeInvariant(profile.invariant)).toBeTruthy();
      expect(describeSignature(profile.signature)).toBeTruthy();
    }
  });

  it("is data and not a parser: no profile carries a callable member", () => {
    for (const profile of profiles) {
      for (const value of Object.values(profile)) {
        expect(typeof value).not.toBe("function");
      }
      expect(Object.values(profile.columnRoles).every(Array.isArray)).toBe(true);
    }
  });

  it("leaves only the fallback profile undetectable, so every named source has a signature", () => {
    const undetectable = profiles
      .filter((p) => p.signature.kind === "NOT_DETECTABLE")
      .map((p) => p.id);
    expect(undetectable).toEqual(["generic"]);
  });

  it("declares the fallback's convention undetermined and its market unstated", () => {
    expect(SOURCE_FORMAT_PROFILES.generic.feeConvention.kind).toBe("UNDETERMINED");
    expect(SOURCE_FORMAT_PROFILES.generic.market.kind).toBe("UNDECLARED");
  });

  it("declares a market for every named source", () => {
    for (const profile of profiles) {
      if (profile.id === "generic") continue;
      expect(profile.market.kind).not.toBe("UNDECLARED");
    }
    expect(SOURCE_FORMAT_PROFILES["kraken-futures"].market.kind).toBe("FUTURES");
    expect(SOURCE_FORMAT_PROFILES["kraken-spot"].market.kind).toBe("SPOT");
  });

  it("records the two measured invariants and states the absence of the others as a value", () => {
    expect(SOURCE_FORMAT_PROFILES["kraken-spot"].invariant).toEqual({
      kind: "RUNNING_BALANCE",
      rowOrder: "OLDEST_FIRST",
    });
    expect(SOURCE_FORMAT_PROFILES["bitvavo-spot"].invariant.kind).toBe(
      "OVER_DETERMINED_ROW",
    );
    // Not an omission: these three ship no redundancy independent of their own derivation.
    expect(SOURCE_FORMAT_PROFILES["bit2me-spot"].invariant.kind).toBe("NONE");
    expect(SOURCE_FORMAT_PROFILES["bitunix-spot"].invariant.kind).toBe("NONE");
    expect(SOURCE_FORMAT_PROFILES.tangem.invariant.kind).toBe("NONE");
  });

  it("records the measured fee denominations", () => {
    expect(SOURCE_FORMAT_PROFILES["kraken-spot"].feeDenomination.kind).toBe("ROW_ASSET");
    expect(SOURCE_FORMAT_PROFILES.tangem.feeDenomination.kind).toBe("ROW_ASSET");
    expect(SOURCE_FORMAT_PROFILES["bitvavo-spot"].feeDenomination).toEqual({
      kind: "NAMED_COLUMN",
      sourceColumn: "Fee currency",
    });
    expect(SOURCE_FORMAT_PROFILES["bitunix-spot"].feeDenomination).toEqual({
      kind: "NAMED_COLUMN",
      sourceColumn: "Fee Asset",
    });
    // Measured, not assumed: `Moneda de la comisión` names the acquired asset on 98 of the 118
    // trade rows and EUR on the movement rows, so it varies per row exactly as Bitvavo's does.
    expect(SOURCE_FORMAT_PROFILES["bit2me-spot"].feeDenomination).toEqual({
      kind: "NAMED_COLUMN",
      sourceColumn: "Moneda de la comisión",
    });
    expect(SOURCE_FORMAT_PROFILES["kraken-futures"].feeDenomination.kind).toBe(
      "COLLATERAL_CURRENCY",
    );
  });

  it("records the measured fee conventions", () => {
    expect(SOURCE_FORMAT_PROFILES["kraken-spot"].feeConvention.kind).toBe("NET_PLUS_FEE");
    expect(SOURCE_FORMAT_PROFILES["bitunix-spot"].feeConvention.kind).toBe("NET_PLUS_FEE");
    expect(SOURCE_FORMAT_PROFILES.tangem.feeConvention.kind).toBe("NET_PLUS_FEE");
    expect(SOURCE_FORMAT_PROFILES["bit2me-spot"].feeConvention.kind).toBe("GROSS_AND_NET");
    expect(SOURCE_FORMAT_PROFILES["bitvavo-spot"].feeConvention.kind).toBe("FEE_INSIDE_TOTAL");
  });

  it("declares Bit2Me alone as writing both directional sides", () => {
    const bothSides = profiles
      .filter((p) => p.directionalFill.kind === "BOTH_SIDES_WRITTEN")
      .map((p) => p.id);
    expect(bothSides).toEqual(["bit2me-spot"]);
  });

  it("declares Bit2Me with no reference column and Grupo as a category label", () => {
    expect(SOURCE_FORMAT_PROFILES["bit2me-spot"].columnRoles.references).toEqual([]);
    expect(SOURCE_FORMAT_PROFILES["bit2me-spot"].columnRoles.categoryLabels).toContain("Grupo");
  });

  it("declares Kraken's refid as a genuine reference", () => {
    expect(SOURCE_FORMAT_PROFILES["kraken-spot"].columnRoles.references).toContain("refid");
  });
});

/**
 * A declared reference is a claim about the source's data, and it can be false. Two of them were:
 * Bitvavo's `Transaction ID` and Kraken futures' `uid` were declared references while being unique
 * on every row of the real export — 42 of 42 and 1100 of 1100 — so neither could ever link two rows
 * into one operation, which is the whole meaning of the declaration.
 *
 * Both were inert, because neither column maps to `group_id` and a row without one is never grouped.
 * Inert is not the same as true: `isMergeKey` answered `true` for a per-row identifier, and the guard
 * that trusts a shared identifier reads this list's length. This is the `Grupo` defect with the
 * polarity reversed — there a category column was mistaken for a reference by its name, here a row
 * identifier was, and the seam exists to make that mistake impossible rather than merely unlucky.
 *
 * The two conditions are independent and a genuine reference passes both: the mapper must route the
 * column to `group_id`, and the column must actually repeat in the file.
 */
describe("every declared reference is one, measured against the real export", () => {
  const CORPUS: ReadonlyArray<{
    readonly profileId: string;
    readonly rows: ReadonlyArray<Readonly<Record<string, string>>>;
  }> = [
    { profileId: "kraken-spot", rows: KRAKEN_SPOT_ROWS },
    { profileId: "kraken-futures", rows: KRAKEN_FUTURES_ROWS },
    { profileId: "bitvavo-spot", rows: BITVAVO_ROWS },
    { profileId: "bitunix-spot", rows: BITUNIX_ROWS },
    { profileId: "bit2me-spot", rows: BIT2ME_ROWS },
    { profileId: "tangem", rows: TANGEM_ROWS },
  ];

  /** The field the mapper routes a header to, by the same dictionary the wizard uses. */
  function mappedFieldOf(header: string): string | undefined {
    const wanted = header.trim().toLowerCase();
    const entry = Object.entries(COLUMN_DICTIONARY).find(([, patterns]) =>
      patterns.some((pattern) => pattern.toLowerCase() === wanted),
    );
    return entry?.[0];
  }

  for (const { profileId, rows } of CORPUS) {
    const profile = SOURCE_FORMAT_PROFILES[profileId as keyof typeof SOURCE_FORMAT_PROFILES];

    for (const reference of profile.columnRoles.references) {
      it(`routes ${profileId}'s declared '${reference}' to the field aggregation groups on`, () => {
        expect(mappedFieldOf(reference)).toBe("group_id");
      });

      it(`finds ${profileId}'s declared '${reference}' repeating in the real file`, () => {
        const present = rows.filter((row) => (row[reference] ?? "").trim() !== "");
        expect(
          present.length,
          `'${reference}' is absent from every row of ${profileId}'s fixture`,
        ).toBeGreaterThan(0);

        const occurrences = new Map<string, number>();
        for (const row of present) {
          const value = row[reference].trim();
          occurrences.set(value, (occurrences.get(value) ?? 0) + 1);
        }
        const linked = [...occurrences.values()].filter((count) => count > 1);

        expect(
          linked.length,
          `every '${reference}' value is unique across ${present.length} rows, so it identifies a row rather than linking two`,
        ).toBeGreaterThan(0);
      });
    }
  }

  it("finds exactly one genuine leg-linking reference in the whole corpus", () => {
    // Kraken spot's `refid` is the only one: 24 values over 34 rows, 10 of them pairs.
    const declared = CORPUS.flatMap(({ profileId }) =>
      SOURCE_FORMAT_PROFILES[
        profileId as keyof typeof SOURCE_FORMAT_PROFILES
      ].columnRoles.references.map((reference) => `${profileId}:${reference}`),
    );

    expect(declared).toEqual(["kraken-spot:refid"]);
  });
});
