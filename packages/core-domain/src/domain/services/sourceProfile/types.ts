import type { SourceProfileId } from "@kryptofolio/shared-types";

/**
 * What a header name cannot say.
 *
 * The ingestion pipeline has three layers. The reader turns bytes into rows of strings and knows
 * nothing about any exchange. The column mapper turns header names into canonical fields, and can
 * say that `Comisión de la operación` holds `fee_amount`. Neither can say that the number in that
 * column is a *euro valuation* of a fee actually paid in HBAR, or that the quantity that really
 * moved is the origin column minus the destination column. This is where facts of that class live.
 *
 * Two vocabularies appear below and they are deliberately different:
 *
 * - a **header signature** names the source's own column headings, because detection runs before any
 *   mapping exists and header names are the only signature available at that point;
 * - every **applied** dimension is expressed over the canonical mapped fields, because the appliers
 *   run twice over the same rows — in the wizard's preview and in the backend's persistence — and
 *   the backend never sees a header. A dimension expressed in source-column terms could only be
 *   applied on one side, which is the drift this seam exists to remove.
 */

/** How a row's fee denomination is resolved. Never a global default. */
export type FeeDenomination =
  /** The source has no fee-currency column: the fee is charged in the asset the row moves. */
  | { readonly kind: "ROW_ASSET" }
  /** The source names the fee currency per row, and it really does vary within one file. */
  | { readonly kind: "NAMED_COLUMN"; readonly sourceColumn: string }
  /**
   * The fee column holds a fiat valuation of a fee paid in the asset. The number is a basis figure,
   * never a quantity: recording it as one credits the user with a fee in the wrong unit.
   */
  | { readonly kind: "FIAT_VALUATION"; readonly sourceColumn: string }
  /** Futures: fees settle in the account's collateral currency, not in the contract's asset. */
  | { readonly kind: "COLLATERAL_CURRENCY" };

/**
 * Which two of `gross`, `net` and `fee` the source supplies, so the third is derived rather than
 * guessed. Deducting a fee the source already applied destroys quantity that is still held;
 * ignoring one charged on top leaves quantity unaccounted for. Both are silent.
 */
export type FeeConvention =
  /** The reported amount is net and the fee is charged on top: `gross = net + fee`. */
  | { readonly kind: "NET_PLUS_FEE" }
  /** Both magnitudes are written and the fee is their difference: `fee = gross − net`. */
  | { readonly kind: "GROSS_AND_NET" }
  /** The reported total already contains the fee: it must not be added again. */
  | { readonly kind: "FEE_INSIDE_TOTAL" }
  /**
   * Nobody has measured this source. A zero fee is still fully determined — `gross = net + 0` under
   * either convention — so only a non-zero fee is reported pending review.
   */
  | { readonly kind: "UNDETERMINED" };

/** Whether one source row writes a one-sided movement onto both directional columns. */
export type DirectionalFill =
  | { readonly kind: "ONE_SIDED" }
  | { readonly kind: "BOTH_SIDES_WRITTEN" };

/** Which market a source's rows belong to, as a declared fact rather than a guess at its filename. */
export type DeclaredMarket =
  | { readonly kind: "SPOT" }
  | { readonly kind: "FUTURES" }
  /** The fallback profile declares no market, which is what leaves the user's choice standing. */
  | { readonly kind: "UNDECLARED" };

/**
 * Which columns are genuine per-operation references and which are category labels.
 *
 * `COLUMN_DICTIONARY` mapped `grupo` onto `group_id`, the field row aggregation merges on, and
 * Bit2Me's `Grupo` holds wallet compartments — five values across a multi-year history. Whether a
 * column identifies an operation is a property of the source, not of its name.
 */
export interface ColumnRoles {
  readonly references: readonly string[];
  readonly categoryLabels: readonly string[];
}

/**
 * Redundancy the source ships that is independent of the profile's own derivation.
 *
 * The qualifying test is independence, not the presence of a column. `gross = net + fee` is a
 * tautology wherever the profile derives the third value, so asserting it can never fail and would
 * give a profile the appearance of verification with none of the substance.
 */
export type ProfileInvariant =
  /** Stated, not omitted: a reviewer can see that this source cannot check itself. */
  | { readonly kind: "NONE" }
  /**
   * `balance = previous ± amount − fee`, per asset. `balance` takes no part in any derivation.
   * The row order matters and is therefore declared: an export written newest-first reconciles
   * only when read backwards.
   */
  | {
      readonly kind: "RUNNING_BALANCE";
      readonly rowOrder: "OLDEST_FIRST" | "NEWEST_FIRST";
    }
  /**
   * `quantity × price + fee = paid` — four columns, none derived from the others. The paid figure is
   * recorded at the source's own scale, so the comparison is made at that many decimal places.
   */
  | { readonly kind: "OVER_DETERMINED_ROW" };

/** How a file is recognised, before any column has been mapped. */
export type HeaderSignature =
  | {
      readonly kind: "HEADER_SET";
      readonly required: readonly string[];
      /**
       * Headers whose presence means the file is some other source. They pick a sensible default;
       * they are not a correctness mechanism, because the profile is a required field on the
       * ingestion contract and the user confirms it. A misdetection therefore degrades into a wrong
       * default in a selector, never into wrongly interpreted data.
       */
      readonly forbidden: readonly string[];
    }
  /** The fallback profile is reached by the absence of a match, never by matching. */
  | { readonly kind: "NOT_DETECTABLE" };

export interface SourceFormatProfile {
  readonly id: SourceProfileId;
  /** Shown in the wizard's selector. */
  readonly label: string;
  readonly market: DeclaredMarket;
  readonly signature: HeaderSignature;
  readonly feeDenomination: FeeDenomination;
  readonly feeConvention: FeeConvention;
  readonly directionalFill: DirectionalFill;
  readonly columnRoles: ColumnRoles;
  readonly invariant: ProfileInvariant;
}

export type SourceFormatProfileTable = Readonly<
  Record<SourceProfileId, SourceFormatProfile>
>;
