import type { ValidTransactionRow, TransactionMappedData } from "@kryptofolio/shared-types";

/** The instant a row was recorded, however the source spelled it. */
function instantOf(data: TransactionMappedData): string {
  return data.timestamp ?? `${data.date ?? ""}T${data.time ?? ""}`;
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
export function aggregateRows(rows: ValidTransactionRow[]): ValidTransactionRow[] {
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

  const mergedGroups = Array.from(groups.values()).map((groupRows) =>
    groupRows.length === 1
      ? groupRows[0]
      : mergeRows(groupRows, groupRows[0].mappedData.group_id ?? "")
  );

  return [...standalone, ...mergedGroups];
}

function mergeRows(groupRows: ValidTransactionRow[], groupId: string): ValidTransactionRow {
  // 1. Extract base data, omitting properties we plan to calculate/distribute
  const { amount, asset, fee_amount, fee_currency, ...baseMappedData } = groupRows[0].mappedData;

  // 2. Functional reduction of all rows in the group
  const mergedMappedData = groupRows.reduce((acc, { mappedData: data }) => {
    // Merge metadata immutably
    acc.metadata = { ...acc.metadata, ...data.metadata };

    // Accumulate absolute fees
    if (data.fee_amount) {
      const currentFee = Number(acc.fee_amount || 0) + Math.abs(Number(data.fee_amount));
      acc.fee_amount = String(currentFee);
      acc.fee_currency = data.fee_currency || data.asset || acc.fee_currency;
    }

    // Distribute generic amount/asset directionally
    if (data.amount && data.asset) {
      const numAmount = Number(data.amount);
      if (numAmount < 0) {
        acc.amount_out = String(Math.abs(numAmount));
        acc.asset_out = data.asset;
      } else if (numAmount > 0) {
        acc.amount_in = String(numAmount);
        acc.asset_in = data.asset;
      }
    }

    return acc;
  }, { ...baseMappedData, metadata: { ...baseMappedData.metadata } } as Partial<TransactionMappedData>);

  return {
    id: `merged-${groupId}`,
    originalData: { ...groupRows[0].originalData, _merged_rows: groupRows.length },
    mappedData: mergedMappedData as TransactionMappedData,
    errors: [],
    hasError: false,
  };
}
