import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mocked } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { prepareIngestionRows, SOURCE_FORMAT_PROFILES } from '@kryptofolio/core-domain';
import type { TransactionMappedData } from '@kryptofolio/shared-types';
import { CsvIngestionUseCase, type SubmittedTransaction } from '../CsvIngestionUseCase.js';
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

/** The Kraken row's own digits, as the export writes them: one leg, no fee-currency column. */
const KRAKEN_SOL_WITHDRAWAL: TransactionMappedData = {
  date: '2025-11-10 15:48:07',
  tx_type: 'withdrawal',
  amount: '-0.0060000000',
  asset: 'SOL',
  fee_amount: '0.0050000000',
  metadata: { subclass: 'crypto' },
};

/** What the pipeline makes of a source row, under the profile of the source that wrote it. */
function prepared(
  data: TransactionMappedData,
  profileId: 'kraken-spot' | 'generic',
): Partial<TransactionMappedData> {
  const [row] = prepareIngestionRows(
    [{ id: '1', originalData: {}, errors: [], hasError: false as const, mappedData: data }],
    SOURCE_FORMAT_PROFILES[profileId], 'UTC',
  );
  return row.mappedData;
}

/**
 * Turns a source row into the ingestion payload: the account, a fiat magnitude where the row states
 * none, and nothing else. Classification and the identifier belong to the use case.
 */
function toIngestible(data: TransactionMappedData): SubmittedTransaction {
  return {
    ...data,
    account_id: VENUE,
    total_fiat: data.total_fiat ?? '1',
    price_fiat: data.price_fiat ?? '1',
  } as SubmittedTransaction;
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
    const result = await useCase.execute(
      [toIngestible(KRAKEN_SOL_WITHDRAWAL)],
      'spot',
      'kraken-spot', 'UTC',
    );

    expect(result.rejected).toEqual([]);
    const saved = await adapter.getSpotTransactions(VENUE);
    expect(saved).toHaveLength(1);
    expect(saved[0].tx_type).toBe('TRANSFER_OUT');
    expect(saved[0].fee_asset_id).toBe('SOL');
    expect(saved[0].fee_amount?.toString()).toBe('0.005');
  });

  /**
   * Asserted on the pipeline's output rather than deeper inside the ledger call, so the invariant holds
   * where the row is still a source row: otherwise only this one path covers it and every other
   * consumer inherits the gap.
   *
   * Which unit an omitted fee currency means is the profile's declaration. Under the source that
   * declares its fee is charged in the row's own asset the pair is complete; under a source that names
   * a fee-currency column and left it empty it stays unresolved, and is reported rather than guessed.
   */
  it('leaves the pipeline output already satisfying the ledger fee-pair invariant', () => {
    const underKraken = prepared(KRAKEN_SOL_WITHDRAWAL, 'kraken-spot');

    const hasAmount = underKraken.fee_amount !== undefined && underKraken.fee_amount !== null;
    const hasDenomination =
      underKraken.fee_currency !== undefined && underKraken.fee_currency !== null;
    expect(hasAmount).toBe(hasDenomination);
    expect(underKraken.fee_currency).toBe('SOL');
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
    const result = await useCase.execute(
      [
        toIngestible({
          date: '2025-02-03 06:41:00',
          tx_type: 'withdrawal',
          amount: '-99.3',
          asset: 'HBAR',
          fee_amount: '0.157429818',
          fee_currency: 'HBAR',
          metadata: { subclass: 'crypto' },
        }),
      ],
      'spot',
      'generic', 'UTC',
    );

    expect(result.rejected).toEqual([]);
    const saved = await adapter.getSpotTransactions(VENUE);
    expect(saved[0].fee_amount?.toString()).toBe('0.157429818');
    expect(saved[0].amount_out?.toString()).toBe('99.3');
  });
});
