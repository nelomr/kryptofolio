/**
 * Overrides driven through the real engine: SQLite ledger, DuckDB projection, real materialiser.
 *
 * Stubs cannot show any of this. Whether a declared value reaches a lot's cost basis, whether the
 * flag it was declared against disappears, and whether the declaration itself survives a rebuild that
 * deletes and rewrites every derived row are all properties of the two databases together.
 */
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DuckDbAdapter } from '@kryptofolio/database';
import { createAccountId, createTransactionIdHash } from '@kryptofolio/shared-types';
import { SQLiteLedgerAdapter } from '../../../../infrastructure/adapters/SQLiteLedgerAdapter.js';
import { DuckDbTaxCalculatorAdapter } from '../../../../infrastructure/adapters/DuckDbTaxCalculatorAdapter.js';
import { FifoMaterializerService } from '../../../services/FifoMaterializerService.js';
import { SetManualPriceOverrideUseCase } from '../SetManualPriceOverrideUseCase.js';
import { RemoveManualPriceOverrideUseCase } from '../RemoveManualPriceOverrideUseCase.js';
import { SetTransferDestinationUseCase } from '../SetTransferDestinationUseCase.js';
import { OverrideValidationError } from '../OverrideMutation.js';
import { toPreciseAmount } from '../../../../domain/value-objects/PreciseAmount.js';
import type { IUserSettingsPort } from '../../../../domain/ports/IUserSettingsPort.js';

const KRAKEN = 'acc-kraken';
const LEDGER_WALLET = 'acc-ledger';

/**
 * A staking receipt no market series can price.
 *
 * The asset is deliberately unknown to the bundled price parquet: an asset with real history (XRP,
 * quoted in USD) is not unpriced at all — it resolves and picks up CURRENCY_MISMATCH against an EUR
 * ledger, which is a different defect than the one under test.
 */
const STAKING_HASH = 'hash-staking-unpriced';
const WITHDRAWAL_HASH = 'hash-withdrawal-unknown-dest';

function seed(db: DatabaseSync): void {
  const asset = db.prepare('INSERT INTO assets (id, symbol, is_fiat) VALUES (?, ?, ?)');
  asset.run('TSTCOIN', 'TSTCOIN', 0);
  asset.run('EUR', 'EUR', 1);

  const account = db.prepare('INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)');
  account.run(KRAKEN, 'Kraken', 'exchange');
  account.run(LEDGER_WALLET, 'Ledger', 'wallet');

  const insert = db.prepare(
    `INSERT INTO spot_transactions (
       id, id_hash, account_id, tx_type,
       asset_in_id, amount_in, asset_out_id, amount_out,
       total_fiat, price_fiat, fiat_currency, timestamp, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', ?, 'COMPLETED')`,
  );

  insert.run(
    'tx-staking',
    STAKING_HASH,
    KRAKEN,
    'STAKING',
    'TSTCOIN',
    '10',
    null,
    null,
    '0',
    '0',
    '2026-01-02T10:00:00.000Z',
  );

  insert.run(
    'tx-withdrawal',
    WITHDRAWAL_HASH,
    KRAKEN,
    'WITHDRAWAL',
    null,
    null,
    'TSTCOIN',
    '4',
    '0',
    '0',
    '2026-02-02T10:00:00.000Z',
  );
}

describe('manual overrides against the real FIFO engine', () => {
  let sqliteDb: DatabaseSync;
  let sqlitePath: string;
  let ledger: SQLiteLedgerAdapter;
  let duckDb: DuckDbAdapter;
  let materializer: FifoMaterializerService;
  let settings: IUserSettingsPort;

  const stakingLot = () =>
    sqliteDb
      .prepare(
        `SELECT unit_cost_fiat, total_cost_fiat, quality_flag, value_provenance
           FROM tax_lots WHERE spot_transaction_id = 'tx-staking' AND deleted_at IS NULL`,
      )
      .get() as
      | {
          unit_cost_fiat: string;
          total_cost_fiat: string;
          quality_flag: string | null;
          value_provenance: string;
        }
      | undefined;

  const overrideRows = () =>
    sqliteDb
      .prepare('SELECT * FROM manual_price_overrides ORDER BY id_hash')
      .all() as Record<string, unknown>[];

  beforeEach(async () => {
    sqlitePath = path.join(
      os.tmpdir(),
      `override_${Date.now()}_${Math.random().toString(36).slice(2)}.db`,
    );
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');

    ledger = new SQLiteLedgerAdapter(sqliteDb);
    await ledger.initialize();
    seed(sqliteDb);

    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);

    let needsRecalculation = 'true';
    settings = {
      getSetting: async (key: string) =>
        key === 'needs_recalculation' ? needsRecalculation : null,
      setSetting: async (key: string, value: string) => {
        if (key === 'needs_recalculation') needsRecalculation = value;
      },
    };

    materializer = new FifoMaterializerService(
      ledger,
      new DuckDbTaxCalculatorAdapter(duckDb),
      settings,
    );
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  it('flags the unpriced receipt before any value is declared', async () => {
    // Without this the next test could pass against a lot that was never flagged.
    await materializer.recalculate(true);

    expect(stakingLot()?.quality_flag).toBe('MISSING_PRICE');
    expect(stakingLot()?.unit_cost_fiat).toBe('0');
  });

  it('takes the declared price into the cost basis and clears the flag', async () => {
    const before = await materializer.recalculate(true);

    const result = await new SetManualPriceOverrideUseCase(ledger, materializer, settings).execute([
      {
        idHash: createTransactionIdHash(STAKING_HASH),
        priceFiat: toPreciseAmount('0.42'),
        fiatCurrency: 'EUR',
        note: 'closing price from the exchange statement',
      },
    ]);

    const lot = stakingLot();
    expect(Number(lot?.unit_cost_fiat)).toBeCloseTo(0.42, 10);
    expect(Number(lot?.total_cost_fiat)).toBeCloseTo(4.2, 10);
    expect(lot?.quality_flag).toBeNull();
    expect(lot?.value_provenance).toBe('MANUAL');
    // One defect fewer, not none: the withdrawal to an undeclared destination still leaves a custody
    // residual, which is a separate declaration the user has not made.
    expect(result.materialization?.pendingReview).toBe(before.pendingReview - 1);
  });

  it('reverts to the flag when the declaration is removed', async () => {
    const set = new SetManualPriceOverrideUseCase(ledger, materializer, settings);
    await set.execute([
      {
        idHash: createTransactionIdHash(STAKING_HASH),
        priceFiat: toPreciseAmount('0.42'),
        fiatCurrency: 'EUR',
      },
    ]);
    expect(stakingLot()?.quality_flag).toBeNull();

    await new RemoveManualPriceOverrideUseCase(ledger, materializer, settings).execute([
      createTransactionIdHash(STAKING_HASH),
    ]);

    const lot = stakingLot();
    expect(lot?.quality_flag).toBe('MISSING_PRICE');
    expect(lot?.unit_cost_fiat).toBe('0');
    expect(lot?.value_provenance).toBe('MARKET');
  });

  it('leaves the override table untouched across a rebuild', async () => {
    await new SetManualPriceOverrideUseCase(ledger, materializer, settings).execute([
      {
        idHash: createTransactionIdHash(STAKING_HASH),
        priceFiat: toPreciseAmount('0.42'),
        fiatCurrency: 'EUR',
      },
    ]);
    const before = overrideRows();

    await materializer.recalculate(true);

    expect(overrideRows()).toEqual(before);
    expect(before).toHaveLength(1);
  });

  it('keeps applying after the same source row is written again', async () => {
    // Re-ingestion replaces the transaction row but not its identity, which is what the override
    // keys on. A surrogate-id key would have been orphaned here.
    await new SetManualPriceOverrideUseCase(ledger, materializer, settings).execute([
      {
        idHash: createTransactionIdHash(STAKING_HASH),
        priceFiat: toPreciseAmount('0.42'),
        fiatCurrency: 'EUR',
      },
    ]);

    await ledger.saveSpotTransaction({
      id: 'tx-staking-reingested',
      id_hash: STAKING_HASH,
      account_id: KRAKEN,
      tx_type: 'STAKING',
      asset_in_id: 'TSTCOIN',
      amount_in: toPreciseAmount('10'),
      total_fiat: toPreciseAmount('0'),
      price_fiat: toPreciseAmount('0'),
      fiat_currency: 'EUR',
      timestamp: '2026-01-02T10:00:00.000Z',
      status: 'COMPLETED',
    });

    await materializer.recalculate(true);

    expect(overrideRows()).toHaveLength(1);
    const lot = sqliteDb
      .prepare(
        `SELECT unit_cost_fiat, quality_flag FROM tax_lots
          WHERE asset_id = 'TSTCOIN' AND deleted_at IS NULL AND acquisition_timestamp LIKE '2026-01-02%'`,
      )
      .get() as { unit_cost_fiat: string; quality_flag: string | null };
    expect(Number(lot.unit_cost_fiat)).toBeCloseTo(0.42, 10);
    expect(lot.quality_flag).toBeNull();
  });

  it('moves the custody credit onto the declared destination account', async () => {
    await materializer.recalculate(true);

    const syntheticBefore = sqliteDb
      .prepare(
        `SELECT SUM(CAST(qty_delta AS REAL)) AS total FROM lot_custody_entries
          WHERE account_id LIKE 'ownwallet-%' AND deleted_at IS NULL`,
      )
      .get() as { total: number | null };
    expect(syntheticBefore.total).toBeGreaterThan(0);

    await new SetTransferDestinationUseCase(ledger, materializer, settings).execute([
      {
        idHash: createTransactionIdHash(WITHDRAWAL_HASH),
        counterpartyAccountId: createAccountId(LEDGER_WALLET),
      },
    ]);

    const credited = sqliteDb
      .prepare(
        `SELECT SUM(CAST(qty_delta AS REAL)) AS total FROM lot_custody_entries
          WHERE account_id = ? AND deleted_at IS NULL`,
      )
      .get(LEDGER_WALLET) as { total: number | null };
    const syntheticAfter = sqliteDb
      .prepare(
        `SELECT SUM(CAST(qty_delta AS REAL)) AS total FROM lot_custody_entries
          WHERE account_id LIKE 'ownwallet-%' AND deleted_at IS NULL`,
      )
      .get() as { total: number | null };

    expect(credited.total).toBeCloseTo(4, 10);
    expect(syntheticAfter.total ?? 0).toBeCloseTo(0, 10);
  });

  it('refuses a destination the ledger has never heard of, leaving the table empty', async () => {
    await expect(
      new SetTransferDestinationUseCase(ledger, materializer, settings).execute([
        {
          idHash: createTransactionIdHash(WITHDRAWAL_HASH),
          counterpartyAccountId: createAccountId('acc-does-not-exist'),
        },
      ]),
    ).rejects.toThrow(OverrideValidationError);

    const rows = sqliteDb
      .prepare('SELECT COUNT(*) AS count FROM transfer_destination_overrides')
      .get() as { count: number };
    expect(rows.count).toBe(0);
  });
});
