import { Money } from "../../value-objects/Money";

export interface CustodyLocationInput {
  tax_lot_id: string;
  asset_id: string;
  account_id: string;
  account_name: string;
  is_synthetic: boolean;
  qty: string;
}

export interface CustodyHolding {
  symbol: string;
  accountName: string;
  quantity: string;
  lotCount: number;
}

export interface CustodySummary {
  holdings: CustodyHolding[];
  /** Synthetic `ownwallet-*` rows are custody arithmetic, not places the user can name, so they are counted and never listed. */
  syntheticRowCount: number;
}

interface Accumulator {
  symbol: string;
  accountName: string;
  quantity: Money;
  lotCount: number;
}

/** Adds the lot quantities held in each (asset, account) pair. Reads the custody ledger only; tax ordering plays no part. */
export function summarizeCustodyLocations(rows: readonly CustodyLocationInput[], symbol?: string): CustodySummary {
  const groups = new Map<string, Accumulator>();
  let syntheticRowCount = 0;

  for (const row of rows) {
    if (symbol !== undefined && row.asset_id !== symbol) continue;
    if (row.is_synthetic) {
      syntheticRowCount += 1;
      continue;
    }
    const key = `${row.asset_id}\u0000${row.account_id}`;
    const existing = groups.get(key);
    const quantity = new Money(row.qty);
    if (existing === undefined) {
      groups.set(key, { symbol: row.asset_id, accountName: row.account_name, quantity, lotCount: 1 });
    } else {
      existing.quantity = existing.quantity.add(quantity);
      existing.lotCount += 1;
    }
  }

  const holdings = [...groups.values()]
    .filter((group) => !group.quantity.isZero())
    .sort((a, b) =>
      a.symbol === b.symbol ? (a.accountName < b.accountName ? -1 : a.accountName > b.accountName ? 1 : 0) : a.symbol < b.symbol ? -1 : 1,
    )
    .map((group) => ({
      symbol: group.symbol,
      accountName: group.accountName,
      quantity: group.quantity.toFixed(),
      lotCount: group.lotCount,
    }));

  return { holdings, syntheticRowCount };
}
