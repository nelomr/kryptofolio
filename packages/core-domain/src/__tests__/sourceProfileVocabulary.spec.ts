import { describe, expect, it } from "vitest";
import { SOURCE_PROFILE_IDS } from "@kryptofolio/shared-types";

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
    case "FIAT_VALUATION":
      return `fiat valuation in ${value.sourceColumn}`;
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

  it("records the four measured fee denominations", () => {
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
    expect(SOURCE_FORMAT_PROFILES["bit2me-spot"].feeDenomination).toEqual({
      kind: "FIAT_VALUATION",
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
