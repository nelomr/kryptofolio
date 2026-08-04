import Decimal from "decimal.js";
import type {
  TransactionRow,
  ValidTransactionRow,
  TransactionMappedData,
} from "@kryptofolio/shared-types";

import { resolveFeeDenomination } from "../sourceProfile/appliers";
import type { SourceFormatProfile } from "../sourceProfile/types";

/** The instant a row was recorded, however the source spelled it. */
function instantOf(data: TransactionMappedData): string {
  return data.timestamp ?? `${data.date ?? ""}T${data.time ?? ""}`;
}

/** One side of a leg, as a magnitude: direction is the side it sits on, never a sign. */
interface LegSide {
  readonly asset: string;
  readonly amount: string;
}

interface LegSides {
  readonly inbound: LegSide | null;
  readonly outbound: LegSide | null;
}

/**
 * Which side or sides a leg states, however it states them.
 *
 * A leg whose direction has already been resolved carries it in the directional fields, and its
 * digits are passed through untouched — a magnitude put through `Decimal` comes back reformatted, and
 * `17.720` is not `17.72` to a reader comparing against the source. A leg the normalizer left generic
 * states its side in the sign of its amount, which is the only place the direction exists.
 */
function sidesOf(data: TransactionMappedData): LegSides {
  const inbound =
    data.amount_in && data.asset_in ? { asset: data.asset_in, amount: data.amount_in } : null;
  const outbound =
    data.amount_out && data.asset_out ? { asset: data.asset_out, amount: data.amount_out } : null;
  if (inbound !== null || outbound !== null) return { inbound, outbound };

  if (data.amount && data.asset) {
    const value = new Decimal(data.amount);
    if (value.isNegative()) {
      return { inbound: null, outbound: { asset: data.asset, amount: value.abs().toString() } };
    }
    if (!value.isZero()) {
      return { inbound: { asset: data.asset, amount: value.toString() }, outbound: null };
    }
  }

  return { inbound: null, outbound: null };
}

/**
 * Whether a group's legs move one asset in two directions rather than trading two assets.
 *
 * Aggregation exists to reunite a trade — fiat out, crypto in. The same asset leaving one account and
 * arriving in another is a movement, and merging it yields a single record whose inbound and outbound
 * asset are identical: an operation no exchange performs, which `classifyCustodyMovement` then cannot
 * resolve and the custody engine has no two legs to pair.
 */
function namesOneAssetOnBothSides(groupRows: readonly ValidTransactionRow[]): boolean {
  const inbound = new Set<string>();
  const outbound = new Set<string>();

  for (const { mappedData } of groupRows) {
    const sides = sidesOf(mappedData);
    if (sides.inbound !== null) inbound.add(sides.inbound.asset.toUpperCase());
    if (sides.outbound !== null) outbound.add(sides.outbound.asset.toUpperCase());
  }

  for (const asset of inbound) {
    if (outbound.has(asset)) return true;
  }
  return false;
}

/**
 * Reunites the several rows an exchange writes for a single operation — Kraken exports one trade as
 * a negative leg and a positive leg sharing a `refid`.
 *
 * Grouping is keyed on the identifier **and the instant**, because a shared identifier alone does not
 * mean one operation: Bit2Me's `Grupo` column names a wallet compartment (`earn`, `trading`,
 * `pocket`), so an entire multi-year history shares five values. Keying on the identifier alone
 * collapsed 706 real rows into 5 transactions, keeping only the first quantity of each. The legs of a
 * genuine trade are recorded at the same instant, which is what distinguishes them from rows that
 * merely share a category.
 */
export function aggregateRows(
  rows: ValidTransactionRow[],
  profile: SourceFormatProfile,
): TransactionRow[] {
  const groups = new Map<string, ValidTransactionRow[]>();
  const standalone: ValidTransactionRow[] = [];

  rows.forEach((row) => {
    const groupId = row.mappedData.group_id;
    if (!groupId) {
      standalone.push(row);
      return;
    }
    // Serialised rather than concatenated: a group identifier may itself contain the separator,
    // which would merge two groups that only look alike.
    const key = JSON.stringify([groupId, instantOf(row.mappedData)]);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  });

  const merged: TransactionRow[] = [];
  for (const groupRows of groups.values()) {
    if (groupRows.length === 1) {
      merged.push(groupRows[0]);
    } else if (namesOneAssetOnBothSides(groupRows)) {
      // Both legs survive as recorded. What links them is the identifier they share, which the
      // ledger keeps, not a record that spends and receives one asset at once.
      merged.push(...groupRows);
    } else {
      merged.push(mergeRows(groupRows, groupRows[0].mappedData.group_id ?? "", profile));
    }
  }

  return [...standalone, ...merged];
}

/**
 * The unit a leg's fee is charged in, or `null` when the leg has no fee to charge.
 *
 * Resolved through the profile rather than read off the leg's own `fee_currency`, because the sources
 * that state no fee currency are exactly the ones where two legs of one trade are charged in two
 * different units — the case a "last column value wins" rule reports as a single unit.
 */
function feeUnitOf(profile: SourceFormatProfile, data: TransactionMappedData): string | null {
  const resolution = resolveFeeDenomination(profile, data);
  switch (resolution.kind) {
    case "ASSET_QUANTITY":
      return resolution.asset;
    case "FIAT_VALUATION":
      return resolution.currency;
    // An absent fee and an explicit zero alike leave nothing to combine, so neither can conflict.
    case "ABSENT":
    case "ZERO":
    case "PENDING_REVIEW":
      return null;
  }
}

function mergeRows(
  groupRows: ValidTransactionRow[],
  groupId: string,
  profile: SourceFormatProfile,
): TransactionRow {
  /**
   * Every field the merge derives is dropped from the base, the directional ones included: inheriting
   * the first leg's side and then filling the other from a second leg would keep whichever of the two
   * happened to be first even when a later leg states the same side differently.
   */
  const {
    amount,
    asset,
    amount_in,
    asset_in,
    amount_out,
    asset_out,
    fee_amount,
    fee_currency,
    ...baseMappedData
  } = groupRows[0].mappedData;

  /**
   * Fees are accumulated as decimals and the unit is carried with them. A sum recorded under a unit it
   * was not charged in is silent: nothing downstream can tell 0.3 EUR from 0.1 EUR plus 0.2 XLM.
   */
  let feeTotal: Decimal | null = null;
  let feeUnit: string | null = null;
  /** The one leg's own text, kept verbatim while it is still the only fee in the group. */
  let loneFeeText: string | null = null;
  const conflicts: string[] = [];

  // 2. Functional reduction of all rows in the group
  const mergedMappedData = groupRows.reduce((acc, { mappedData: data }) => {
    // Merge metadata immutably
    acc.metadata = { ...acc.metadata, ...data.metadata };

    const unit = feeUnitOf(profile, data);
    if (unit !== null && data.fee_amount) {
      // The sign survives: a negative fee is a rebate the venue credited, not a direction.
      const legFee = new Decimal(data.fee_amount);
      if (feeUnit === null) {
        feeUnit = unit;
        feeTotal = legFee;
        loneFeeText = data.fee_amount;
      } else if (feeUnit === unit) {
        feeTotal = (feeTotal as Decimal).plus(legFee);
        loneFeeText = null;
      } else {
        conflicts.push(`${data.fee_amount} ${unit}`);
      }
    }

    // Each leg contributes the side it states, and only that side.
    const sides = sidesOf(data);
    if (sides.inbound !== null) {
      acc.amount_in = sides.inbound.amount;
      acc.asset_in = sides.inbound.asset;
    }
    if (sides.outbound !== null) {
      acc.amount_out = sides.outbound.amount;
      acc.asset_out = sides.outbound.asset;
    }

    return acc;
  }, { ...baseMappedData, metadata: { ...baseMappedData.metadata } } as Partial<TransactionMappedData>);

  if (feeTotal !== null && feeUnit !== null) {
    mergedMappedData.fee_amount = loneFeeText ?? (feeTotal as Decimal).toString();
    mergedMappedData.fee_currency = feeUnit;
  }

  const base = {
    id: `merged-${groupId}`,
    originalData: { ...groupRows[0].originalData, _merged_rows: groupRows.length },
  };

  if (conflicts.length > 0) {
    /**
     * Refused rather than combined. Summing the figures needs a single unit to record them under, and
     * every candidate is a unit some part of the sum was never charged in.
     */
    return {
      ...base,
      mappedData: mergedMappedData,
      errors: [
        `ingestion.errors.fee_denomination_conflict: ${[
          `${mergedMappedData.fee_amount ?? ""} ${feeUnit ?? ""}`,
          ...conflicts,
        ].join(", ")}`,
      ],
      hasError: true,
    };
  }

  return {
    ...base,
    mappedData: mergedMappedData as TransactionMappedData,
    errors: [],
    hasError: false,
  };
}
