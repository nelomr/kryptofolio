/**
 * A report has to say what currency it is in, on screen and in the file the user keeps.
 *
 * The exposure this closes is narrow and specific: a report rendered in USD is not declarable to
 * AEAT, and a euro figure and a dollar figure are indistinguishable as numbers. Decision 2 makes a
 * EUR report from USD records the correct AEAT figure regardless of the source currency, so the
 * remedy is not to block the choice but to make the report state it — in the header the user reads
 * and in the export they file, because the export outlives the screen.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDbAdapter, getLedgerDb, closeLedgerDb, applyMigrations } from '@kryptofolio/database';
import { DIContainer } from '../../di/container.js';
import { createTaxApi } from '../tax.js';

const YEAR = 2024;
const DISPOSED_ON = `${YEAR}-03-14`;
/** Records in dollars, so a euro report is a converted one and has something to declare. */
const GAIN_USD = '200';
const USD_EUR = '0.5';

describe('the tax report states its currency', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let duckDb: DuckDbAdapter;
  let app: Hono;

  beforeEach(async () => {
    sqlitePath = path.join(os.tmpdir(), `test_taxstmt_${process.pid}_${Date.now()}.db`);
    closeLedgerDb();
    sqliteDb = getLedgerDb(sqlitePath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    // The full set: `fx_rate` and the nullable fiat magnitudes arrive in 005 and 006, and the FIFO
    // views bind against the current schema.
    applyMigrations(sqliteDb);

    sqliteDb
      .prepare("INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Kraken', 'exchange')")
      .run();
    sqliteDb.prepare("INSERT INTO assets (id, symbol) VALUES ('BTC', 'BTC')").run();
    sqliteDb
      .prepare(
        `INSERT INTO exchange_rates (date, pair, rate, source)
         VALUES ('${DISPOSED_ON}', 'USD/EUR', '${USD_EUR}', 'ECB')`,
      )
      .run();
    sqliteDb
      .prepare(
        `INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_in_id, amount_in,
           total_fiat, price_fiat, fiat_currency, timestamp, status)
         VALUES ('tx-buy', 'h-buy', 'acc-1', 'BUY', 'BTC', '1', '1000', '1000', 'USD',
                 '${DISPOSED_ON}T09:00:00Z', 'COMPLETED')`,
      )
      .run();
    sqliteDb
      .prepare(
        `INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_out_id, amount_out,
           total_fiat, price_fiat, fiat_currency, timestamp, status)
         VALUES ('tx-sell', 'h-sell', 'acc-1', 'SELL', 'BTC', '1', '1200', '1200', 'USD',
                 '${DISPOSED_ON}T10:00:00Z', 'COMPLETED')`,
      )
      .run();
    sqliteDb
      .prepare(
        `INSERT INTO tax_lots (id, spot_transaction_id, asset_id, account_id, original_qty,
           remaining_qty, unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp,
           exchange_location, status)
         VALUES ('lot-1', 'tx-buy', 'BTC', 'acc-1', '1', '0', '1000', '1000', 'USD',
                 '${DISPOSED_ON}T09:00:00Z', 'Kraken', 'CLOSED')`,
      )
      .run();
    sqliteDb
      .prepare(
        `INSERT INTO lot_history_events (id, tax_lot_id, spot_transaction_id, account_id,
           amount_from_lot, sale_price_fiat, gain_loss_fiat, fiat_currency, is_taxable,
           disposal_type, disposal_date)
         VALUES ('evt-1', 'lot-1', 'tx-sell', 'acc-1', '1', '1200', '${GAIN_USD}', 'USD', 1,
                 'SELL', '${DISPOSED_ON}T10:00:00Z')`,
      )
      .run();

    process.env.MOCK_MODE = 'false';
    process.env.VAULT_DB_PATH = sqlitePath;
    process.env.LEDGER_DB_PATH = sqlitePath;
    process.env.DUCKDB_PATH = ':memory:';
    duckDb = new DuckDbAdapter();
    await duckDb.initialize(sqlitePath);

    const container = new DIContainer();
    container.setDuckDbAdapter(duckDb);
    app = new Hono().route('/tax', createTaxApi(container));
  });

  afterEach(() => {
    closeLedgerDb();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  it('names the currency and the conversion basis in the report the header reads', async () => {
    const res = await app.request(`/tax/report/${YEAR}?currency=EUR`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      currency: string;
      conversion: { kind: string };
      unconvertibleEvents: readonly unknown[];
    };

    expect(body.currency).toBe('EUR');
    // A discriminated statement rather than a boolean: the header has to say *how* the figures got
    // to euros, and "converted at each event's own date" is the sentence a filer needs.
    expect(body.conversion.kind).toBe('CONVERTED');
    expect(body.unconvertibleEvents).toEqual([]);
  });

  it('reports a native period as native, not as a conversion at rate one', async () => {
    const res = await app.request(`/tax/report/${YEAR}?currency=USD`);
    const body = (await res.json()) as { currency: string; conversion: { kind: string } };

    expect(body.currency).toBe('USD');
    // The records are already dollars, so nothing was converted. Saying "converted" here would put
    // a conversion notice on a native record, which is the mirror of the defect being fixed.
    expect(body.conversion.kind).toBe('NATIVE');
  });

  it('reports rows that add up to the base it declares', async () => {
    const res = await app.request(`/tax/report/${YEAR}?currency=EUR`);
    const body = (await res.json()) as {
      spotCapitalGains: string;
      currency: string;
      audit_trail: ReadonlyArray<{
        gain_loss: { kind: string; amount?: string } | null;
      }>;
    };

    // The incoherence this task exists to remove: a header reading EUR, a total of 100, and rows
    // adding up to 200 because the detail table was never converted. A filer reconciling the two
    // finds a discrepancy with no explanation available anywhere in the UI.
    const rowTotal = body.audit_trail.reduce((sum, row) => {
      if (row.gain_loss === null || row.gain_loss.amount === undefined) return sum;
      return sum + Number(row.gain_loss.amount);
    }, 0);

    expect(body.currency).toBe('EUR');
    expect(rowTotal, `rows summed to ${rowTotal}, base is ${body.spotCapitalGains}`).toBeCloseTo(
      Number(body.spotCapitalGains),
      10,
    );

    // And the rows must actually be converted, not merely consistent with an unconverted base.
    expect(body.audit_trail.every((row) => row.gain_loss?.kind === 'CONVERTED')).toBe(true);
  });

  it('carries the currency and the conversion statement inside the export itself', async () => {
    const res = await app.request(`/tax/report/download?year=${YEAR}&currency=EUR&format=csv`);
    expect(res.status).toBe(200);
    const body = await res.text();

    // In the bytes of the file, not only in the on-screen view: the export is what gets filed,
    // mailed to an accountant and read a year later, by which time the screen is gone.
    //
    // Asserted as tokens because that is what the export emits: the backend states no user-facing
    // copy, and a file that outlives the session must not freeze one language's phrasing into it.
    expect(body).toContain('currency,EUR');
    expect(body).toContain('conversion,CONVERTED');
    expect(body).toContain('conversion_basis,EACH_EVENT_OWN_DATE');

    // And the figure it carries is the converted one, so statement and content agree.
    expect(body).toContain('100');
  });

  it('says in the export which events it could not convert', async () => {
    // An event whose date no stored rate reaches. The export must not simply be short by one row.
    sqliteDb
      .prepare(
        `INSERT INTO spot_transactions (id, id_hash, account_id, tx_type, asset_out_id, amount_out,
           total_fiat, price_fiat, fiat_currency, timestamp, status)
         VALUES ('tx-sell-old', 'h-sell-old', 'acc-1', 'SELL', 'BTC', '1', '90', '90', 'USD',
                 '${YEAR}-01-02T10:00:00Z', 'COMPLETED')`,
      )
      .run();
    sqliteDb
      .prepare(
        `INSERT INTO lot_history_events (id, tax_lot_id, spot_transaction_id, account_id,
           amount_from_lot, sale_price_fiat, gain_loss_fiat, fiat_currency, is_taxable,
           disposal_type, disposal_date)
         VALUES ('evt-old', 'lot-1', 'tx-sell-old', 'acc-1', '1', '90', '90', 'USD', 1,
                 'SELL', '${YEAR}-01-02T10:00:00Z')`,
      )
      .run();

    const res = await app.request(`/tax/report/download?year=${YEAR}&currency=EUR&format=csv`);
    const body = await res.text();

    expect(body).toContain('completeness,INCOMPLETE');
    // Named in the file, with the figure it was worth: an export short by one row is a wrong return
    // that looks like a right one.
    expect(body).toContain('unconvertible_event,evt-old');
    expect(body).toContain('90');
  });
});
