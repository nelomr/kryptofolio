/**
 * `v_effective_spot_transactions` (design.md D5, add-spot-transaction-edit-overrides group 6) —
 * the single view every FIFO/custody/data-quality consumer reads instead of `ledger.spot_transactions`
 * directly, so an edit-override is visible consistently everywhere.
 *
 * This file tests the view in isolation, independent of the 8 consumers it will later replace
 * (group 6.5+) — those re-pointing steps are separate, larger, and not yet done; see resume-apply.md.
 */
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { DuckDbAdapter } from '../../src/adapters/DuckDbAdapter.js';
import { applyMigrations } from '../helpers/migrations.js';

interface EffectiveRow {
  id: string;
  id_hash: string;
  account_id: string;
  tx_type: string;
  amount_in: string | null;
  amount_out: string | null;
  price_fiat: string;
  total_fiat: string | null;
  fiat_currency: string;
  fee_amount: string | null;
  fee_asset_id: string | null;
  timestamp: string;
  original_timestamp: string;
  transfer_group_id: string | null;
  status: string;
  has_override: boolean;
  override_fiat_currency: string | null;
  price_overridden: boolean;
  total_fiat_overridden: boolean;
}

describe('v_effective_spot_transactions', () => {
  let sqliteDbPath: string;
  let sqliteDb: DatabaseSync;
  let duckDbPath: string;
  let adapter: DuckDbAdapter;

  beforeEach(async () => {
    sqliteDbPath = path.join(
      os.tmpdir(),
      `test_effective_tx_${Date.now()}_${Math.random().toString(36).slice(2)}.db`,
    );
    sqliteDb = new DatabaseSync(sqliteDbPath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    applyMigrations(sqliteDb);

    sqliteDb.prepare("INSERT INTO assets (id, symbol) VALUES ('BTC', 'BTC')").run();
    sqliteDb.prepare("INSERT INTO assets (id, symbol) VALUES ('EUR', 'EUR')").run();
    sqliteDb.prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Kraken', 'exchange')").run();

    duckDbPath = path.join(
      os.tmpdir(),
      `test_effective_tx_analytical_${Date.now()}_${Math.random().toString(36).slice(2)}.duckdb`,
    );
    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = duckDbPath;

    adapter = new DuckDbAdapter();
  });

  afterEach(() => {
    sqliteDb.close();
    for (const p of [sqliteDbPath, duckDbPath, `${duckDbPath}.wal`]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    delete process.env.DUCKDB_PATH;
  });

  function seedTx(overrides: Partial<Record<string, unknown>> = {}): void {
    const row = {
      id: 'tx-1',
      id_hash: 'hash-1',
      account_id: 'acc-1',
      tx_type: 'BUY',
      asset_in_id: 'BTC',
      amount_in: '0.1',
      asset_out_id: 'EUR',
      amount_out: '4000',
      fee_asset_id: 'EUR',
      fee_amount: '1',
      total_fiat: '4000',
      price_fiat: '40000',
      fiat_currency: 'EUR',
      timestamp: '2026-01-01T10:00:00.000Z',
      status: 'COMPLETED',
      ...overrides,
    };
    sqliteDb
      .prepare(
        `INSERT INTO spot_transactions
           (id, id_hash, account_id, tx_type, asset_in_id, amount_in, asset_out_id, amount_out,
            fee_asset_id, fee_amount, total_fiat, price_fiat, fiat_currency, timestamp, status)
         VALUES (@id, @id_hash, @account_id, @tx_type, @asset_in_id, @amount_in, @asset_out_id, @amount_out,
                 @fee_asset_id, @fee_amount, @total_fiat, @price_fiat, @fiat_currency, @timestamp, @status)`,
      )
      .run(row);
  }

  async function effectiveRow(idHash = 'hash-1'): Promise<EffectiveRow> {
    const rows = (await adapter.queryMany(
      `SELECT * FROM v_effective_spot_transactions WHERE id_hash = '${idHash}'`,
    )) as EffectiveRow[];
    return rows[0];
  }

  it('projects the imported row unchanged when no override exists', async () => {
    seedTx();
    await adapter.initialize(sqliteDbPath);

    const row = await effectiveRow();
    expect(row.amount_in).toBe('0.1');
    expect(row.price_fiat).toBe('40000');
    expect(row.has_override).toBe(false);
    expect(row.price_overridden).toBe(false);
  });

  it('projects an edited field as CASE WHEN <flag> THEN <override> ELSE <imported>', async () => {
    seedTx();
    sqliteDb
      .prepare(
        `INSERT INTO spot_transaction_overrides (id_hash, price_edited, price_fiat, fiat_currency)
         VALUES ('hash-1', 1, '42000', 'EUR')`,
      )
      .run();
    await adapter.initialize(sqliteDbPath);

    const row = await effectiveRow();
    expect(row.price_fiat).toBe('42000');
    expect(row.amount_in).toBe('0.1'); // untouched field falls back to imported
    expect(row.has_override).toBe(true);
    expect(row.price_overridden).toBe(true);
  });

  it('always takes id, id_hash, account_id, transfer_group_id, status from the imported row', async () => {
    seedTx({ status: 'COMPLETED' });
    // The override table has no columns for these fields at all — this test documents that
    // invariant structurally, by asserting the view's values match the imported row exactly even
    // with an unrelated override present.
    sqliteDb
      .prepare(
        `INSERT INTO spot_transaction_overrides (id_hash, timestamp_edited, timestamp)
         VALUES ('hash-1', 1, '2026-02-01T00:00:00.000Z')`,
      )
      .run();
    await adapter.initialize(sqliteDbPath);

    const row = await effectiveRow();
    expect(row.id).toBe('tx-1');
    expect(row.id_hash).toBe('hash-1');
    expect(row.account_id).toBe('acc-1');
    expect(row.status).toBe('COMPLETED');
  });

  it('exposes original_timestamp for display, distinct from the effective (possibly edited) timestamp', async () => {
    seedTx({ timestamp: '2026-01-01T10:00:00.000Z' });
    sqliteDb
      .prepare(
        `INSERT INTO spot_transaction_overrides (id_hash, timestamp_edited, timestamp)
         VALUES ('hash-1', 1, '2026-03-01T00:00:00.000Z')`,
      )
      .run();
    await adapter.initialize(sqliteDbPath);

    const row = await effectiveRow();
    expect(row.timestamp).toBe('2026-03-01T00:00:00.000Z');
    expect(row.original_timestamp).toBe('2026-01-01T10:00:00.000Z');
  });

  describe('fee_kind resolution', () => {
    it('UNCHANGED: resolves to the imported fee', async () => {
      seedTx({ fee_amount: '1', fee_asset_id: 'EUR' });
      sqliteDb
        .prepare(
          `INSERT INTO spot_transaction_overrides (id_hash, price_edited, price_fiat, fiat_currency)
           VALUES ('hash-1', 1, '41000', 'EUR')`,
        )
        .run();
      await adapter.initialize(sqliteDbPath);

      const row = await effectiveRow();
      expect(row.fee_amount).toBe('1');
      expect(row.fee_asset_id).toBe('EUR');
    });

    it('NONE: resolves to no fee at all', async () => {
      seedTx({ fee_amount: '1', fee_asset_id: 'EUR' });
      sqliteDb
        .prepare(
          `INSERT INTO spot_transaction_overrides (id_hash, fee_kind, price_edited, price_fiat, fiat_currency)
           VALUES ('hash-1', 'NONE', 1, '41000', 'EUR')`,
        )
        .run();
      await adapter.initialize(sqliteDbPath);

      const row = await effectiveRow();
      expect(row.fee_amount).toBeNull();
      expect(row.fee_asset_id).toBeNull();
    });

    it('CHARGED: resolves to the override amount/asset, and a stated zero stays distinct from no fee', async () => {
      seedTx({ fee_amount: '1', fee_asset_id: 'EUR' });
      sqliteDb
        .prepare(
          `INSERT INTO spot_transaction_overrides (id_hash, fee_kind, fee_amount, fee_asset_id)
           VALUES ('hash-1', 'CHARGED', '0', 'BTC')`,
        )
        .run();
      await adapter.initialize(sqliteDbPath);

      const row = await effectiveRow();
      expect(row.fee_amount).toBe('0');
      expect(row.fee_asset_id).toBe('BTC');
    });
  });

  describe('total_fiat_overridden', () => {
    it('is false when total_fiat was not independently edited', async () => {
      seedTx();
      sqliteDb
        .prepare(
          `INSERT INTO spot_transaction_overrides (id_hash, price_edited, price_fiat, fiat_currency)
           VALUES ('hash-1', 1, '42000', 'EUR')`,
        )
        .run();
      await adapter.initialize(sqliteDbPath);

      const row = await effectiveRow();
      expect(row.total_fiat_overridden).toBe(false);
    });

    it('is true when total_fiat was independently edited (even to NULL)', async () => {
      seedTx();
      sqliteDb
        .prepare(
          `INSERT INTO spot_transaction_overrides (id_hash, total_fiat_edited, total_fiat)
           VALUES ('hash-1', 1, NULL)`,
        )
        .run();
      await adapter.initialize(sqliteDbPath);

      const row = await effectiveRow();
      expect(row.total_fiat_overridden).toBe(true);
      expect(row.total_fiat).toBeNull();
    });
  });

  it('excludes a soft-deleted override (deleted_at IS NOT NULL)', async () => {
    seedTx();
    sqliteDb
      .prepare(
        `INSERT INTO spot_transaction_overrides (id_hash, price_edited, price_fiat, fiat_currency, deleted_at)
         VALUES ('hash-1', 1, '99999', 'EUR', '2026-01-05T00:00:00.000Z')`,
      )
      .run();
    await adapter.initialize(sqliteDbPath);

    const row = await effectiveRow();
    expect(row.price_fiat).toBe('40000');
    expect(row.has_override).toBe(false);
  });

  it('excludes a soft-deleted imported transaction, matching every other consumer of spot_transactions', async () => {
    seedTx();
    sqliteDb.prepare("UPDATE spot_transactions SET deleted_at = '2026-01-05T00:00:00.000Z' WHERE id_hash = 'hash-1'").run();
    await adapter.initialize(sqliteDbPath);

    const rows = (await adapter.queryMany(
      `SELECT * FROM v_effective_spot_transactions WHERE id_hash = 'hash-1'`,
    )) as EffectiveRow[];
    expect(rows).toHaveLength(0);
  });
});
