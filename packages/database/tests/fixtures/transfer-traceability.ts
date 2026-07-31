/**
 * transfer-traceability — Regression fixture for the FIFO custody-traceability defects.
 *
 * Reproduces, in one ledger, every defect measured against the live development ledger, plus the
 * custody scenarios the fix must newly support.
 *
 * The fixture seeds the TARGET schema (post `004_fifo_traceability.sql`): `assets.is_fiat`,
 * `accounts.parent_account_id`, `accounts.is_synthetic`. It therefore fails to seed against the
 * pre-migration schema — which is the intended Red state.
 *
 * Synthetic `ownwallet-<ASSET>` accounts are deliberately NOT seeded: the engine must create them
 * on demand, because an unknown destination has to resolve to the synthetic account.
 *
 */

import type { DatabaseSync } from 'node:sqlite';

/** Stable account identifiers so assertions can reference them without a lookup. */
export const ACCOUNTS = {
  krakenVenue: 'acc-kraken',
  krakenSpot: 'acc-kraken-spot',
  krakenEarn: 'acc-kraken-earn',
  ledger: 'acc-ledger',
  binance: 'acc-binance',
} as const;

/** Stable transaction identifiers, one per scenario, so failures name the scenario. */
export const TX = {
  /** BUY with the CSV's negative `total_fiat` — source of `unit_cost_fiat = -1.6724`. */
  buyNegativeFiat: 'tx-buy-neg-fiat',
  /** Clean BUY, positive basis — the lot a genuine SELL should consume. */
  buyClean: 'tx-buy-clean',
  /** Crypto DEPOSIT — today fabricates a zero-cost phantom lot. */
  cryptoDeposit: 'tx-crypto-deposit',
  /** Fiat DEPOSIT — must be excluded from FIFO entirely via `is_fiat`. */
  fiatDeposit: 'tx-fiat-deposit',
  /** WITHDRAWAL with a crypto network fee, destination unknown → `ownwallet-XRP`. */
  withdrawalUnknownDest: 'tx-withdrawal-unknown',
  /** STAKING receipt with no resolvable price → `MISSING_PRICE`, not a genuine zero basis. */
  stakingUnpriced: 'tx-staking-unpriced',
  /** Kraken sub-wallet move, outbound leg (spot → earn). */
  subWalletOut: 'tx-subwallet-out',
  /** Kraken sub-wallet move, inbound leg (spot → earn). */
  subWalletIn: 'tx-subwallet-in',
  /** Partial transfer of one lot, Ledger → Binance, splitting custody without splitting the lot. */
  partialTransferOut: 'tx-partial-transfer-out',
  /** Partial transfer inbound leg. */
  partialTransferIn: 'tx-partial-transfer-in',
  /** The only genuine taxable disposal in the fixture. */
  genuineSell: 'tx-genuine-sell',
} as const;

/** Quantities and values the assertions depend on. Mirrors the real XRP figures from baseline.md. */
export const AMOUNTS = {
  /** Quantity of the negative-basis BUY. Real ledger value. */
  buyNegativeQty: '179.11',
  /** As stored by the buggy ingestion path: the CSV's EUR outflow sign is preserved. */
  buyNegativeTotalFiat: '-300.00',
  /** The magnitude the fix must persist instead. */
  buyNegativeTotalFiatAbs: '300.00',
  /** Expected unit cost after sign normalisation: 300.00 / 179.11. */
  buyNegativeUnitCost: '1.674948356875',

  buyCleanQty: '192.44',
  buyCleanTotalFiat: '299.89',

  cryptoDepositQty: '100.00',
  fiatDepositAmount: '500.00',

  withdrawalQty: '179.11',
  withdrawalFeeQty: '0.20',

  stakingQty: '50.00',
  subWalletQty: '120.00',
  partialTransferQty: '60.00',

  sellQty: '100.00',
  sellTotalFiat: '200.00',
} as const;

/** Chronological order matters: FIFO ordering and custody replay both depend on it. */
export const TIMESTAMPS = {
  buyNegativeFiat: '2025-12-15T10:00:00.000Z',
  fiatDeposit: '2025-12-20T10:00:00.000Z',
  withdrawalUnknownDest: '2026-01-04T10:00:00.000Z',
  cryptoDeposit: '2026-01-05T10:00:00.000Z',
  buyClean: '2026-01-25T10:00:00.000Z',
  stakingUnpriced: '2026-02-01T10:00:00.000Z',
  subWallet: '2026-02-10T10:00:00.000Z',
  partialTransfer: '2026-02-20T10:00:00.000Z',
  genuineSell: '2026-03-01T10:00:00.000Z',
} as const;

interface SpotRow {
  id: string;
  tx_type: string;
  account_id: string;
  timestamp: string;
  asset_in_id?: string;
  amount_in?: string;
  asset_out_id?: string;
  amount_out?: string;
  fee_asset_id?: string;
  fee_amount?: string;
  total_fiat: string;
  price_fiat: string;
  fiat_currency: string;
}

/**
 * Seeds assets with their fiat classification.
 *
 * XRP has NO `historical_prices` row in the fixture, which is what makes the STAKING receipt
 * unpriceable and the crypto fee unvaluable — the conditions the removed
 * `COALESCE(price, 1.0)` / `COALESCE(price, 0.0)` fallbacks used to mask.
 */
function seedAssets(db: DatabaseSync): void {
  const insert = db.prepare(
    'INSERT INTO assets (id, symbol, is_fiat) VALUES (?, ?, ?)'
  );
  insert.run('XRP', 'XRP', 0);
  insert.run('BTC', 'BTC', 0);
  insert.run('EUR', 'EUR', 1);
}

/** Seeds the venue parent, its two sub-wallets, and two flat accounts. */
function seedAccounts(db: DatabaseSync): void {
  const insert = db.prepare(
    'INSERT INTO accounts (id, name, type, parent_account_id, is_synthetic) VALUES (?, ?, ?, ?, ?)'
  );
  insert.run(ACCOUNTS.krakenVenue, 'Kraken', 'exchange', null, 0);
  insert.run(ACCOUNTS.krakenSpot, 'Kraken:spot', 'exchange', ACCOUNTS.krakenVenue, 0);
  insert.run(ACCOUNTS.krakenEarn, 'Kraken:earn', 'exchange', ACCOUNTS.krakenVenue, 0);
  insert.run(ACCOUNTS.ledger, 'Ledger', 'wallet', null, 0);
  insert.run(ACCOUNTS.binance, 'Binance', 'exchange', null, 0);
}

function insertSpot(db: DatabaseSync, row: SpotRow): void {
  db.prepare(
    `INSERT INTO spot_transactions (
       id, id_hash, account_id, tx_type,
       asset_in_id, amount_in, asset_out_id, amount_out,
       fee_asset_id, fee_amount,
       total_fiat, price_fiat, fiat_currency,
       timestamp, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')`
  ).run(
    row.id,
    // id_hash is deterministic per scenario so re-seeding is idempotent, mirroring the
    // deterministic `id_hash` contract the parsers must honour.
    `hash-${row.id}`,
    row.account_id,
    row.tx_type,
    row.asset_in_id ?? null,
    row.amount_in ?? null,
    row.asset_out_id ?? null,
    row.amount_out ?? null,
    row.fee_asset_id ?? null,
    row.fee_amount ?? null,
    row.total_fiat,
    row.price_fiat,
    row.fiat_currency,
    row.timestamp
  );
}

/**
 * Seeds the full scenario set.
 *
 * Pass `normaliseFiatSign: true` to seed the POST-fix magnitude for the negative-basis BUY. The
 * default (`false`) reproduces the defect, so engine-level guards can be exercised against a
 * negative basis that slipped past ingestion.
 */
export function seedTransferTraceabilityFixture(
  db: DatabaseSync,
  options: { normaliseFiatSign?: boolean } = {}
): void {
  const { normaliseFiatSign = false } = options;

  seedAssets(db);
  seedAccounts(db);

  // ── 1. BUY 179.11 XRP whose stored total_fiat carries the CSV's negative sign.
  //    Buggy path yields unit_cost_fiat = -1.6724; combined with a zero-priced disposal it
  //    manufactures a POSITIVE gain of +299.46 (baseline.md).
  insertSpot(db, {
    id: TX.buyNegativeFiat,
    tx_type: 'BUY',
    account_id: ACCOUNTS.krakenSpot,
    timestamp: TIMESTAMPS.buyNegativeFiat,
    asset_in_id: 'XRP',
    amount_in: AMOUNTS.buyNegativeQty,
    total_fiat: normaliseFiatSign
      ? AMOUNTS.buyNegativeTotalFiatAbs
      : AMOUNTS.buyNegativeTotalFiat,
    price_fiat: '1.6724',
    fiat_currency: 'EUR',
  });

  // ── 2. Fiat DEPOSIT of 500 EUR. Must produce no FIFO event at all: EUR is is_fiat = 1.
  insertSpot(db, {
    id: TX.fiatDeposit,
    tx_type: 'DEPOSIT',
    account_id: ACCOUNTS.krakenSpot,
    timestamp: TIMESTAMPS.fiatDeposit,
    asset_in_id: 'EUR',
    amount_in: AMOUNTS.fiatDepositAmount,
    total_fiat: AMOUNTS.fiatDepositAmount,
    price_fiat: '1.00',
    fiat_currency: 'EUR',
  });

  // ── 3. WITHDRAWAL of the whole 179.11 XRP with a 0.20 XRP network fee, destination unknown.
  //    Must emit ONLY the fee disposal; the principal becomes a custody credit to ownwallet-XRP.
  //    total_fiat is 0 because a transfer has no fiat proceeds — the old engine read that 0 as a
  //    genuine sale price.
  insertSpot(db, {
    id: TX.withdrawalUnknownDest,
    tx_type: 'WITHDRAWAL',
    account_id: ACCOUNTS.krakenSpot,
    timestamp: TIMESTAMPS.withdrawalUnknownDest,
    asset_out_id: 'XRP',
    amount_out: AMOUNTS.withdrawalQty,
    fee_asset_id: 'XRP',
    fee_amount: AMOUNTS.withdrawalFeeQty,
    total_fiat: '0',
    price_fiat: '0',
    fiat_currency: 'EUR',
  });

  // ── 4. Crypto DEPOSIT of 100 XRP into Ledger from an unrecorded source.
  //    Today fabricates a zero-cost lot. After the fix it is a custody debit against
  //    ownwallet-XRP — and because nothing of that size was withdrawn, it drives the balance
  //    negative, which must surface as UNTRACKED_INFLOW.
  insertSpot(db, {
    id: TX.cryptoDeposit,
    tx_type: 'DEPOSIT',
    account_id: ACCOUNTS.ledger,
    timestamp: TIMESTAMPS.cryptoDeposit,
    asset_in_id: 'XRP',
    amount_in: AMOUNTS.cryptoDepositQty,
    total_fiat: '0',
    price_fiat: '0',
    fiat_currency: 'EUR',
  });

  // ── 5. Clean BUY, positive basis. This is the lot the genuine SELL must consume by global FIFO
  //    once the phantom disposals stop consuming the earlier one.
  insertSpot(db, {
    id: TX.buyClean,
    tx_type: 'BUY',
    account_id: ACCOUNTS.krakenSpot,
    timestamp: TIMESTAMPS.buyClean,
    asset_in_id: 'XRP',
    amount_in: AMOUNTS.buyCleanQty,
    total_fiat: AMOUNTS.buyCleanTotalFiat,
    price_fiat: '1.5583',
    fiat_currency: 'EUR',
  });

  // ── 6. STAKING receipt with no resolvable price. Must be flagged MISSING_PRICE rather than
  //    presented as a genuine zero-cost acquisition.
  insertSpot(db, {
    id: TX.stakingUnpriced,
    tx_type: 'STAKING',
    account_id: ACCOUNTS.krakenEarn,
    timestamp: TIMESTAMPS.stakingUnpriced,
    asset_in_id: 'XRP',
    amount_in: AMOUNTS.stakingQty,
    total_fiat: '0',
    price_fiat: '0',
    fiat_currency: 'EUR',
  });

  // ── 7. Kraken sub-wallet move, spot → earn, as two legs on two child accounts of one venue.
  //    Net zero at the venue; must be visible as blocked balance under Kraken:earn.
  insertSpot(db, {
    id: TX.subWalletOut,
    tx_type: 'TRANSFER_OUT',
    account_id: ACCOUNTS.krakenSpot,
    timestamp: TIMESTAMPS.subWallet,
    asset_out_id: 'XRP',
    amount_out: AMOUNTS.subWalletQty,
    total_fiat: '0',
    price_fiat: '0',
    fiat_currency: 'EUR',
  });
  insertSpot(db, {
    id: TX.subWalletIn,
    tx_type: 'TRANSFER_IN',
    account_id: ACCOUNTS.krakenEarn,
    timestamp: TIMESTAMPS.subWallet,
    asset_in_id: 'XRP',
    amount_in: AMOUNTS.subWalletQty,
    total_fiat: '0',
    price_fiat: '0',
    fiat_currency: 'EUR',
  });

  // ── 8. Partial transfer Ledger → Binance: 60 of the 100 deposited XRP.
  //    Custody must split across two accounts while the lot stays a single row.
  insertSpot(db, {
    id: TX.partialTransferOut,
    tx_type: 'TRANSFER_OUT',
    account_id: ACCOUNTS.ledger,
    timestamp: TIMESTAMPS.partialTransfer,
    asset_out_id: 'XRP',
    amount_out: AMOUNTS.partialTransferQty,
    total_fiat: '0',
    price_fiat: '0',
    fiat_currency: 'EUR',
  });
  insertSpot(db, {
    id: TX.partialTransferIn,
    tx_type: 'TRANSFER_IN',
    account_id: ACCOUNTS.binance,
    timestamp: TIMESTAMPS.partialTransfer,
    asset_in_id: 'XRP',
    amount_in: AMOUNTS.partialTransferQty,
    total_fiat: '0',
    price_fiat: '0',
    fiat_currency: 'EUR',
  });

  // ── 9. The one genuine taxable disposal: SELL 100 XRP for 200 EUR.
  insertSpot(db, {
    id: TX.genuineSell,
    tx_type: 'SELL',
    account_id: ACCOUNTS.krakenSpot,
    timestamp: TIMESTAMPS.genuineSell,
    asset_out_id: 'XRP',
    amount_out: AMOUNTS.sellQty,
    total_fiat: AMOUNTS.sellTotalFiat,
    price_fiat: '2.00',
    fiat_currency: 'EUR',
  });
}

/** Transaction ids that must never yield a principal (non-fee) disposal event. */
export const NON_DISPOSAL_TX_IDS: readonly string[] = [
  TX.withdrawalUnknownDest,
  TX.subWalletOut,
  TX.partialTransferOut,
];

/** Transaction ids that must never yield an acquisition lot. */
export const NON_ACQUISITION_TX_IDS: readonly string[] = [
  TX.cryptoDeposit,
  TX.fiatDeposit,
  TX.subWalletIn,
  TX.partialTransferIn,
];

/** Transaction ids that legitimately open a lot. */
export const ACQUISITION_TX_IDS: readonly string[] = [
  TX.buyNegativeFiat,
  TX.buyClean,
  TX.stakingUnpriced,
];
