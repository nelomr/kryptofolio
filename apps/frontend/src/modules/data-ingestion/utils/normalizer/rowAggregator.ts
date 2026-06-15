import type { ValidTransactionRow, TransactionMappedData } from "../../types";

/**
 * Aggregates multiple TransactionRows that share the same group_id.
 * This is crucial for exchanges like Kraken that export a single trade as multiple rows.
 */
export function aggregateRows(rows: ValidTransactionRow[]): ValidTransactionRow[] {
  const groups = new Map<string, ValidTransactionRow[]>();
  const standalone: ValidTransactionRow[] = [];

  // 1. O(N) grouping pass
  rows.forEach((row) => {
    const groupId = row.mappedData.group_id;
    if (!groupId) {
      standalone.push(row);
    } else {
      const group = groups.get(groupId);
      if (group) group.push(row);
      else groups.set(groupId, [row]);
    }
  });

  // 2. Functional map to merge groups
  const mergedGroups = Array.from(groups.entries()).map(([groupId, groupRows]) =>
    groupRows.length === 1 ? groupRows[0] : mergeRows(groupRows, groupId)
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
