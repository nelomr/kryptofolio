import { orderByIsoDateDescendingThenKey } from '@kryptofolio/core-domain';
import type { SpotTxType } from '@kryptofolio/shared-types';
import type { ILedgerPort, LedgerSpotTransaction } from '../../domain/ports/ILedgerPort.js';
import {
  withOverrideView,
  type SpotTransactionOverrideView,
} from '../../domain/services/EffectiveSpotTransactionView.js';

export type SpotTransactionRow = LedgerSpotTransaction & { override: SpotTransactionOverrideView };

export type SpotPaging = { kind: 'all' } | { kind: 'page'; page: number; pageSize: number };

export interface SearchSpotTransactionsRequest {
  /** Only the route supplies an account; the advisor always reads every account. */
  accountId?: string;
  symbol?: string;
  /** Inclusive ISO dates, compared against the effective (post-edit) timestamp. */
  from?: string;
  to?: string;
  types?: readonly SpotTxType[];
  paging: SpotPaging;
}

export type SearchSpotTransactionsResult =
  | { kind: 'all'; rows: SpotTransactionRow[] }
  | {
      kind: 'page';
      rows: SpotTransactionRow[];
      page: number;
      pageSize: number;
      /** Computed from the whole filtered set, never from the returned page. */
      totalPages: number;
      totalCount: number;
    };

const DATE_LENGTH = 'YYYY-MM-DD'.length;

function matches(row: SpotTransactionRow, request: SearchSpotTransactionsRequest): boolean {
  if (request.symbol !== undefined && row.asset_in_id !== request.symbol && row.asset_out_id !== request.symbol) {
    return false;
  }
  if (request.types !== undefined && !request.types.includes(row.tx_type)) return false;
  const day = row.timestamp.slice(0, DATE_LENGTH);
  if (request.from !== undefined && day < request.from) return false;
  if (request.to !== undefined && day > request.to) return false;
  return true;
}

/**
 * The single read path for spot transactions, shared by the tax route and the advisor. Every filter
 * runs on the effective (post-edit) row, so an edited type or date is searched as edited. Reads
 * only; nothing is persisted.
 */
export class SearchSpotTransactionsUseCase {
  private readonly ledgerPort: Pick<ILedgerPort, 'getSpotTransactions' | 'getSpotTransactionOverrides'>;

  constructor(ledgerPort: Pick<ILedgerPort, 'getSpotTransactions' | 'getSpotTransactionOverrides'>) {
    this.ledgerPort = ledgerPort;
  }

  async execute(request: SearchSpotTransactionsRequest): Promise<SearchSpotTransactionsResult> {
    const [transactions, overrides] = await Promise.all([
      this.ledgerPort.getSpotTransactions(request.accountId),
      this.ledgerPort.getSpotTransactionOverrides(),
    ]);
    const rows = withOverrideView(transactions, overrides).filter((row) => matches(row, request));
    if (request.paging.kind === 'all') return { kind: 'all', rows };

    const { page, pageSize } = request.paging;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1) {
      throw new RangeError('page and pageSize must be integers of at least 1');
    }
    // A page past the end is returned empty with the true totals so a caller can see the valid range.
    const ordered = orderByIsoDateDescendingThenKey(
      rows,
      (row) => row.timestamp,
      (row) => row.id_hash,
    );
    const start = (page - 1) * pageSize;
    return {
      kind: 'page',
      rows: ordered.slice(start, start + pageSize),
      page,
      pageSize,
      totalPages: Math.ceil(ordered.length / pageSize),
      totalCount: ordered.length,
    };
  }
}

/** An absent fee and an explicit zero fee are different facts, so the fee is a union rather than a nullable amount. */
export type AdvisorSpotFee = { kind: 'NONE' } | { kind: 'CHARGED'; amount: string; assetId?: string };

export interface AdvisorSpotRow {
  date: string;
  type: SpotTxType;
  assetIn?: string;
  amountIn?: string;
  assetOut?: string;
  amountOut?: string;
  priceFiat: string | null;
  totalFiat: string | null;
  fiatCurrency: string;
  fee: AdvisorSpotFee;
  exchange?: string;
  edited: boolean;
}

/**
 * What an answer needs and no more: effective values, whether they were edited, and no internal
 * identifier. The pre-edit `original` stays on the route's row and never reaches the model.
 */
export function toAdvisorSpotRow(row: SpotTransactionRow): AdvisorSpotRow {
  return {
    date: row.timestamp,
    type: row.tx_type,
    ...(row.asset_in_id === undefined ? {} : { assetIn: row.asset_in_id }),
    ...(row.amount_in === undefined ? {} : { amountIn: row.amount_in }),
    ...(row.asset_out_id === undefined ? {} : { assetOut: row.asset_out_id }),
    ...(row.amount_out === undefined ? {} : { amountOut: row.amount_out }),
    priceFiat: row.price_fiat,
    totalFiat: row.total_fiat,
    fiatCurrency: row.fiat_currency,
    fee:
      row.fee_amount === undefined
        ? { kind: 'NONE' }
        : { kind: 'CHARGED', amount: row.fee_amount, ...(row.fee_asset_id === undefined ? {} : { assetId: row.fee_asset_id }) },
    ...(row.exchange === undefined ? {} : { exchange: row.exchange }),
    edited: row.override.kind === 'ACTIVE',
  };
}
