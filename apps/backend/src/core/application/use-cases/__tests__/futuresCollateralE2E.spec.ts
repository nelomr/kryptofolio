/**
 * futuresCollateralE2E — drives the whole real `kraken_futures.csv` (1100 data rows) through the
 * real parser, normalizer, `CsvIngestionUseCase` and `SQLiteLedgerAdapter`, and asserts the counts
 * and spread values against the source file itself, digit for digit — per CLAUDE.md rule 5, a
 * fixture is a convenience, not ground truth; several confident claims in this project's history
 * turned out false against real exports.
 *
 * The file lives at the repo root under `listadoTransacciones/`, which is gitignored (it is the
 * user's own financial export, not fixture data this repo can commit). The suite must stay green in
 * CI, where the file is absent, so every test here is guarded and skips rather than fails when the
 * file cannot be found — it still runs, and still proves the claim, in any environment that has it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import Papa from 'papaparse';
import {
  detectSourceProfile,
  guessColumnMapping,
  mapToEntity,
  normalizeTransactionDirection,
} from '@kryptofolio/core-domain';
import { SQLiteLedgerAdapter } from '../../../infrastructure/adapters/SQLiteLedgerAdapter';
import { CsvIngestionUseCase } from '../CsvIngestionUseCase.js';
import type { IPriceProviderPort } from '../../../domain/ports/IPriceProviderPort';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort';
import { toPreciseAmount } from '../../../domain/value-objects/PreciseAmount';
import { NO_BACKFILL_SCHEDULER } from './support/noBackfillScheduler.js';

const ACCOUNT_ID = '10000000-0000-0000-0000-000000000001';
const FIXTURE_PATH = path.resolve(__dirname, '../../../../../../../listadoTransacciones/kraken_futures.csv');
const FIXTURE_AVAILABLE = fs.existsSync(FIXTURE_PATH);

describe.skipIf(!FIXTURE_AVAILABLE)('End-to-End: the real kraken_futures.csv, in full', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let sqliteAdapter: SQLiteLedgerAdapter;
  let useCase: CsvIngestionUseCase;

  beforeEach(async () => {
    sqlitePath = path.join(os.tmpdir(), `test_futures_collateral_e2e_${Date.now()}.db`);
    sqliteDb = new DatabaseSync(sqlitePath);
    sqliteAdapter = new SQLiteLedgerAdapter(sqliteDb);
    await sqliteAdapter.initialize();

    const priceProvider = {
      getHistoricalPrice: () => Promise.resolve(toPreciseAmount('1')),
    } as unknown as IPriceProviderPort;
    const userSettings = {
      getSetting: () => Promise.resolve('USD'),
      setSetting: () => Promise.resolve(undefined),
    } as unknown as IUserSettingsPort;

    useCase = new CsvIngestionUseCase(sqliteAdapter, priceProvider, userSettings, NO_BACKFILL_SCHEDULER);
  });

  afterEach(() => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  });

  function loadRealFile() {
    const csvContent = fs.readFileSync(FIXTURE_PATH, 'utf-8');
    const parsed = Papa.parse(csvContent, { header: false, skipEmptyLines: 'greedy' });
    const rawRows = parsed.data as string[][];
    const headers = rawRows[0];
    const dataRows = rawRows.slice(1);

    const detection = detectSourceProfile([...headers]);
    if (detection.kind !== 'RESOLVED') throw new Error(`kraken_futures.csv resolved to ${detection.kind}, not one profile`);
    const profileId = detection.profileId;
    const mapping = guessColumnMapping([...headers]);

    const submittedRows = dataRows.map((rowArray) => {
      const rowDict: Record<string, unknown> = {};
      headers.forEach((h, i) => { rowDict[h] = rowArray[i]; });
      const mapped = mapToEntity({ ...rowDict }, mapping, 0, 'FUTURES').mappedData;
      const directed = normalizeTransactionDirection(
        { ...mapped, tx_type: mapped.tx_type ?? null, metadata: mapped.metadata ?? {} },
        'UTC',
      );
      return { ...directed, account_id: ACCOUNT_ID };
    });

    return { submittedRows, profileId, dataRows, headers };
  }

  it('has exactly 1100 data rows, measured directly, before any assertion trusts a remembered count', () => {
    const { dataRows } = loadRealFile();
    expect(dataRows.length).toBe(1100);
  });

  it('ingests all 1100 rows with none rejected: 785 position rows, 315 collateral movements', async () => {
    const { submittedRows, profileId } = loadRealFile();

    const result = await useCase.execute(submittedRows, 'futures', profileId, 'UTC');

    expect(result.rejected).toEqual([]);
    expect(result.persisted).toBe(1100);

    const futuresRows = sqliteDb.prepare('SELECT COUNT(*) AS c FROM futures_transactions').get() as { c: number };
    const collateralRows = sqliteDb.prepare('SELECT COUNT(*) AS c FROM collateral_movements').get() as { c: number };
    expect(futuresRows.c).toBe(785);
    expect(collateralRows.c).toBe(315);
  });

  it('pairs all 157 EUR/USD conversion legs, and leaves the single cross-exchange transfer unpaired', async () => {
    const { submittedRows, profileId } = loadRealFile();
    await useCase.execute(submittedRows, 'futures', profileId, 'UTC');

    const paired = sqliteDb
      .prepare("SELECT COUNT(*) AS c FROM collateral_movements WHERE movement_type = 'CONVERSION' AND pair_id IS NOT NULL")
      .get() as { c: number };
    const distinctPairs = sqliteDb
      .prepare("SELECT COUNT(DISTINCT pair_id) AS c FROM collateral_movements WHERE movement_type = 'CONVERSION'")
      .get() as { c: number };
    const unpaired = sqliteDb
      .prepare("SELECT COUNT(*) AS c FROM collateral_movements WHERE movement_type = 'CROSS_EXCHANGE_TRANSFER' AND pair_id IS NULL")
      .get() as { c: number };

    expect(paired.c).toBe(314);
    expect(distinctPairs.c).toBe(157);
    expect(unpaired.c).toBe(1);
  });

  it('stores the conversion spread digit for digit against the source column, for all 157 pairs', async () => {
    const { submittedRows, profileId, dataRows, headers } = loadRealFile();
    await useCase.execute(submittedRows, 'futures', profileId, 'UTC');

    const spreadColumnIndex = headers.indexOf('conversion spread percentage');
    const symbolColumnIndex = headers.indexOf('symbol');
    const typeColumnIndex = headers.indexOf('type');

    // The source's own EUR-leg spread values, exactly as written — the ground truth this test
    // checks the ledger against, not a value re-derived from the ledger itself.
    const sourceEurSpreads = dataRows
      .filter((r) => r[typeColumnIndex] === 'conversion' && r[symbolColumnIndex] === 'eur')
      .map((r) => r[spreadColumnIndex])
      .sort();

    const storedEurSpreads = (
      sqliteDb
        .prepare("SELECT spread_pct FROM collateral_movements WHERE currency = 'EUR' AND movement_type = 'CONVERSION' ORDER BY spread_pct")
        .all() as { spread_pct: string }[]
    ).map((r) => r.spread_pct).sort();

    expect(sourceEurSpreads).toHaveLength(157);
    expect(storedEurSpreads).toHaveLength(157);
    expect(storedEurSpreads).toEqual(sourceEurSpreads);

    // The USD leg states no spread at all in the source file — its absence must survive as NULL,
    // not as a fabricated '0'.
    const usdSpreadless = sqliteDb
      .prepare("SELECT COUNT(*) AS c FROM collateral_movements WHERE currency = 'USD' AND movement_type = 'CONVERSION' AND spread_pct IS NULL")
      .get() as { c: number };
    expect(usdSpreadless.c).toBe(157);
  });
});
