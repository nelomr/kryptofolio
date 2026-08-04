import type { SourceProfileId } from "@kryptofolio/shared-types";

import { SOURCE_FORMAT_PROFILES } from "../domain/services/sourceProfile/profiles";
import type {
  DeclaredMarket,
  DirectionalFill,
  FeeConvention,
  FeeDenomination,
  HeaderSignature,
  ProfileInvariant,
  SourceFormatProfileTable,
} from "../domain/services/sourceProfile/types";

/**
 * Compile-time half of the vocabulary contract. `vitest run` type-checks nothing, so these live in a
 * `.spec-d.ts` under `src/`, which the package's `typecheck` script compiles. A `.spec-d.ts` does not
 * match vitest's spec glob, so nothing here is also claimed as a passing test.
 */

type Assert<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;
type NotAssignable<A, B> = A extends B ? false : true;

/** Dropping an identifier from the table is a type error, not a run-time surprise. */
type _MissingProfileIsRejected = Assert<
  NotAssignable<Omit<SourceFormatProfileTable, "generic">, SourceFormatProfileTable>
>;

/** The table is keyed by exactly the wire vocabulary — no consumer restates the list. */
type _KeysAreTheVocabulary = Assert<
  Equal<keyof SourceFormatProfileTable, SourceProfileId>
>;

/** Every declared dimension is a union over `kind`, never a bag of optional booleans. */
type _DenominationIsDiscriminated = Assert<
  Equal<
    FeeDenomination["kind"],
    "ROW_ASSET" | "NAMED_COLUMN" | "FIAT_VALUATION" | "COLLATERAL_CURRENCY"
  >
>;
type _ConventionIsDiscriminated = Assert<
  Equal<
    FeeConvention["kind"],
    "NET_PLUS_FEE" | "GROSS_AND_NET" | "FEE_INSIDE_TOTAL" | "UNDETERMINED"
  >
>;
type _FillIsDiscriminated = Assert<
  Equal<DirectionalFill["kind"], "ONE_SIDED" | "BOTH_SIDES_WRITTEN">
>;
type _MarketIsDiscriminated = Assert<
  Equal<DeclaredMarket["kind"], "SPOT" | "FUTURES" | "UNDECLARED">
>;
type _InvariantIsDiscriminated = Assert<
  Equal<ProfileInvariant["kind"], "NONE" | "RUNNING_BALANCE" | "OVER_DETERMINED_ROW">
>;
type _SignatureIsDiscriminated = Assert<
  Equal<HeaderSignature["kind"], "HEADER_SET" | "NOT_DETECTABLE">
>;

/** The absence of an invariant is a member, so it can never be an unset field. */
type _NoInvariantIsAValue = Assert<
  NotAssignable<undefined, (typeof SOURCE_FORMAT_PROFILES)["tangem"]["invariant"]>
>;
