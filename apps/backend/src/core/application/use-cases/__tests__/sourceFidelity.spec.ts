import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mocked } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { normalizeTransactionDirection } from '@kryptofolio/core-domain';
import type { TransactionMappedData } from '@kryptofolio/shared-types';
import { CsvIngestionUseCase, type IngestibleTransaction } from '../CsvIngestionUseCase.js';
import { SQLiteLedgerAdapter } from '../../../infrastructure/adapters/SQLiteLedgerAdapter';
import type { IPriceProviderPort } from '../../../domain/ports/IPriceProviderPort.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import { toPreciseAmount } from '../../../domain/value-objects/PreciseAmount.js';

const VENUE = '10000000-0000-0000-0000-000000000002';

function makeMockPriceProvider(): Mocked<IPriceProviderPort> {
  return {
    getHistoricalPrice: vi.fn().mockResolvedValue(toPreciseAmount('1000')),
  } as Mocked<IPriceProviderPort>;
}

function makeMockUserSettingsPort(): Mocked<IUserSettingsPort> {
  return {
    getSetting: vi.fn().mockResolvedValue(null),
    setSetting: vi.fn().mockResolvedValue(undefined),
  } as unknown as Mocked<IUserSettingsPort>;
}

/**
 * Turns a normalised row into the ingestion payload, so the test drives the same two stages a real
 * import does rather than hand-writing the shape the use case wants.
 */
function toIngestible(normalized: TransactionMappedData, idHash: string): IngestibleTransaction {
  return {
    id_hash: idHash,
    account_id: VENUE,
    tx_type: normalized.tx_type ?? '',
    timestamp: normalized.timestamp ?? '',
    asset_in: normalized.asset_in ?? undefined,
    amount_in: normalized.amount_in ?? undefined,
    asset_out: normalized.asset_out ?? undefined,
    amount_out: normalized.amount_out ?? undefined,
    fee_currency: normalized.fee_currency ?? undefined,
    fee_amount: normalized.fee_amount ?? undefined,
    total_fiat: normalized.total_fiat ?? '1',
    price_fiat: normalized.price_fiat ?? '1',
    metadata: normalized.metadata ?? {},
  } as IngestibleTransaction;
}

describe('source fidelity from the normalizer to the ledger', () => {
  let db: DatabaseSync;
  let adapter: SQLiteLedgerAdapter;
  let useCase: CsvIngestionUseCase;

  beforeEach(async () => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    adapter = new SQLiteLedgerAdapter(db);
    await adapter.initialize();
    useCase = new CsvIngestionUseCase(adapter, makeMockPriceProvider(), makeMockUserSettingsPort());
  });

  afterEach(() => {
    db.close();
  });

  /** The row is `kraken_spot.csv`'s SOL withdrawal, whose export carries no fee-currency column. */
  it('persists a Kraken fee whose denomination the source left implicit', async () => {
    const normalized = normalizeTransactionDirection({
      date: '2025-11-10 15:48:07',
      tx_type: 'withdrawal',
      amount: '-0.0060000000',
      asset: 'SOL',
      fee_amount: '0.0050000000',
      metadata: { subclass: 'crypto' },
    });

    const result = await useCase.execute([toIngestible(normalized, 'kraken-sol-withdrawal')], 'spot');

    expect(result.rejected).toEqual([]);
    const saved = await adapter.getSpotTransactions(VENUE);
    expect(saved).toHaveLength(1);
    expect(saved[0].tx_type).toBe('TRANSFER_OUT');
    expect(saved[0].fee_asset_id).toBe('SOL');
    expect(saved[0].fee_amount?.toString()).toBe('0.005');
  });

  /**
   * `CsvIngestionUseCase` also falls back to the row's asset, so the previous test would pass with an
   * undenominated fee too. This asserts the invariant holds where the row is still a source row —
   * otherwise every future consumer of the normalizer inherits the gap and only this one path covers it.
   */
  it('leaves the normalizer output already satisfying the ledger fee-pair invariant', () => {
    const normalized = normalizeTransactionDirection({
      date: '2025-11-10 15:48:07',
      tx_type: 'withdrawal',
      amount: '-0.0060000000',
      asset: 'SOL',
      fee_amount: '0.0050000000',
      metadata: { subclass: 'crypto' },
    });

    const hasAmount = normalized.fee_amount !== undefined && normalized.fee_amount !== null;
    const hasDenomination = normalized.fee_currency !== undefined && normalized.fee_currency !== null;
    expect(hasAmount).toBe(hasDenomination);
    expect(normalized.fee_currency).toBe('SOL');
  });

  it('rejects an undenominated fee at the storage layer, which is what makes the pair an invariant', () => {
    db.exec(`INSERT OR IGNORE INTO assets (id, symbol) VALUES ('SOL', 'SOL');`);

    // The same statement with the denomination present must succeed, or the rejection below would
    // prove only that the fixture is malformed.
    db.exec(`
      INSERT INTO spot_transactions
        (id, id_hash, account_id, timestamp, tx_type, amount_out, asset_out_id, fee_amount,
         fee_asset_id, total_fiat, price_fiat, fiat_currency, status)
      VALUES
        ('22222222-2222-2222-2222-222222222222', 'paired', '${VENUE}', '2025-11-10T15:48:07Z',
         'TRANSFER_OUT', '0.006', 'SOL', '0.005', 'SOL', '1', '1', 'EUR', 'COMPLETED');
    `);

    expect(() =>
      db.exec(`
        INSERT INTO spot_transactions
          (id, id_hash, account_id, timestamp, tx_type, amount_out, asset_out_id, fee_amount,
           total_fiat, price_fiat, fiat_currency, status)
        VALUES
          ('11111111-1111-1111-1111-111111111111', 'unpaired', '${VENUE}', '2025-11-10T15:48:07Z',
           'TRANSFER_OUT', '0.006', 'SOL', '0.005', '1', '1', 'EUR', 'COMPLETED');
      `),
    ).toThrow();
  });

  /**
   * The string is what `parseExcel` now yields for `bit2me_spot_2025.xlsx`'s HBAR withdrawal fee, whose
   * cell stores `0.15742981799999997` behind a displayed `0.157429818`. Its own half of the chain is
   * pinned in the frontend's `parseExcel.precision.spec.ts`; this asserts the digits survive storage.
   */
  it('stores a spreadsheet amount with the digits the source displays', async () => {
    const normalized = normalizeTransactionDirection({
      date: '2025-02-03 06:41:00',
      tx_type: 'withdrawal',
      amount: '-99.3',
      asset: 'HBAR',
      fee_amount: '0.157429818',
      fee_currency: 'HBAR',
      metadata: { subclass: 'crypto' },
    });

    const result = await useCase.execute([toIngestible(normalized, 'bit2me-hbar-withdrawal')], 'spot');

    expect(result.rejected).toEqual([]);
    const saved = await adapter.getSpotTransactions(VENUE);
    expect(saved[0].fee_amount?.toString()).toBe('0.157429818');
    expect(saved[0].amount_out?.toString()).toBe('99.3');
  });
});
