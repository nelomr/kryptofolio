import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mocked } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { deriveSubAccountId } from '@kryptofolio/shared-types';

import { SQLiteLedgerAdapter } from '../../../infrastructure/adapters/SQLiteLedgerAdapter';

import { CsvIngestionUseCase, type SubmittedTransaction } from '../CsvIngestionUseCase.js';
import type { ILedgerPort, LedgerSpotTransaction } from '../../../domain/ports/ILedgerPort';
import type { IPriceProviderPort } from '../../../domain/ports/IPriceProviderPort.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import { toPreciseAmount } from '../../../domain/value-objects/PreciseAmount.js';

const NO_RECONCILIATION = { inserted: 0, updated: 0, retired: 0, reactivated: 0 };
const ACCOUNT = '10000000-0000-0000-0000-000000000001';
/** The venue the real migration seeds, so a foreign key to it resolves. */
const VENUE = '10000000-0000-0000-0000-000000000002';

function makeLedgerPort(): Mocked<ILedgerPort> {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    getSpotTransactions: vi.fn().mockResolvedValue([]),
    saveSpotTransaction: vi.fn().mockResolvedValue(undefined),
    getFuturesTransactions: vi.fn().mockResolvedValue([]),
    saveFuturesTransaction: vi.fn().mockResolvedValue(undefined),
    getTaxLots: vi.fn().mockResolvedValue([]),
    getAccounts: vi.fn().mockResolvedValue([]),
    createTaxLot: vi.fn().mockResolvedValue(undefined),
    getLotHistoryEvents: vi.fn().mockResolvedValue([]),
    saveLotHistoryEvent: vi.fn().mockResolvedValue(undefined),
    runInTransaction: vi.fn(async (work: () => Promise<unknown>) => work()),
    reconcileTaxLots: vi.fn().mockResolvedValue(NO_RECONCILIATION),
    reconcileLotHistoryEvents: vi.fn().mockResolvedValue(NO_RECONCILIATION),
    reconcileCustodyEntries: vi.fn().mockResolvedValue(NO_RECONCILIATION),
    getCustodyEntries: vi.fn().mockResolvedValue([]),
    getManualPriceOverrides: vi.fn().mockResolvedValue([]),
    setManualPriceOverride: vi.fn().mockResolvedValue(undefined),
    removeManualPriceOverride: vi.fn().mockResolvedValue(undefined),
    getTransferDestinationOverrides: vi.fn().mockResolvedValue([]),
    setTransferDestinationOverride: vi.fn().mockResolvedValue(undefined),
    removeTransferDestinationOverride: vi.fn().mockResolvedValue(undefined),
    ensureAssetExists: vi.fn().mockResolvedValue(undefined),
    ensureAccountExists: vi.fn(async (input: { accountId: string; wallet?: string | null }) =>
      deriveSubAccountId(input.accountId, input.wallet),
    ),
    getTrackedAssets: vi.fn().mockResolvedValue([]),
  } as Mocked<ILedgerPort>;
}

function makeUseCase(ledgerPort: Mocked<ILedgerPort>): CsvIngestionUseCase {
  const priceProvider = {
    getHistoricalPrice: vi.fn().mockResolvedValue(toPreciseAmount('1000')),
  } as Mocked<IPriceProviderPort>;
  const userSettings = {
    getSetting: vi.fn().mockResolvedValue('EUR'),
    setSetting: vi.fn().mockResolvedValue(undefined),
  } as unknown as Mocked<IUserSettingsPort>;
  return new CsvIngestionUseCase(ledgerPort, priceProvider, userSettings);
}

function persisted(ledgerPort: Mocked<ILedgerPort>): LedgerSpotTransaction[] {
  return ledgerPort.saveSpotTransaction.mock.calls.map(([tx]) => tx);
}

/** A Kraken export row as the source wrote it: one leg, its own signed amount, a shared `refid`. */
function krakenLeg(over: Partial<SubmittedTransaction>): SubmittedTransaction {
  return {
    account_id: ACCOUNT,
    timestamp: '2025-09-19T01:38:34Z',
    metadata: { subclass: 'crypto' },
    ...over,
  } as SubmittedTransaction;
}

/**
 * Aggregation used to run in a frontend composable, which is why the backend never saw two legs of
 * anything: it received one already-merged record, computed by whichever client version submitted it,
 * over an identifier the client had already hashed.
 */
describe('the ingestion boundary receives rows as the source wrote them', () => {
  let ledgerPort: Mocked<ILedgerPort>;
  let useCase: CsvIngestionUseCase;

  beforeEach(() => {
    ledgerPort = makeLedgerPort();
    useCase = makeUseCase(ledgerPort);
  });

  it('reunites the two legs of a trade into one transaction, server-side', async () => {
    const result = await useCase.execute(
      [
        krakenLeg({ tx_id: 'TXA', tx_type: 'trade', group_id: 'TTE7DJ', amount: '-50.0000', asset: 'EUR' }),
        krakenLeg({ tx_id: 'TXB', tx_type: 'trade', group_id: 'TTE7DJ', amount: '7704.160', asset: 'PUMP', fee_amount: '17.720' }),
      ],
      'spot',
      'kraken-spot',
    );

    expect(result.persisted).toBe(1);
    const [tx] = persisted(ledgerPort);
    expect(tx.asset_out_id).toBe('EUR');
    expect(tx.amount_out).toBe('50');
    expect(tx.asset_in_id).toBe('PUMP');
    // `7704.160` and `17.720` in the file: the aggregator keeps both verbatim and the ledger mapping
    // normalises the scale of every quantity it writes, through `Decimal`.
    expect(tx.amount_in).toBe('7704.16');
    expect(tx.fee_amount).toBe('17.72');
    expect(tx.fee_asset_id).toBe('PUMP');
  });

  it('derives the identifier itself, so the same batch twice resolves to the same rows', async () => {
    const batch = (): SubmittedTransaction[] => [
      krakenLeg({ tx_type: 'deposit', amount: '179.11', asset: 'XRP' }),
    ];

    await useCase.execute(batch(), 'spot', 'kraken-spot');
    const first = persisted(ledgerPort)[0].id_hash;

    ledgerPort.saveSpotTransaction.mockClear();
    await useCase.execute(batch(), 'spot', 'kraken-spot');
    const second = persisted(ledgerPort)[0].id_hash;

    expect(first).toHaveLength(64);
    expect(second).toBe(first);
  });

  it('gives two rows differing in a mapped field two different identifiers', async () => {
    await useCase.execute(
      [
        krakenLeg({ tx_type: 'deposit', amount: '179.11', asset: 'XRP' }),
        krakenLeg({ tx_type: 'deposit', amount: '179.12', asset: 'XRP' }),
      ],
      'spot',
      'kraken-spot',
    );

    const hashes = persisted(ledgerPort).map((tx) => tx.id_hash);
    expect(new Set(hashes).size).toBe(2);
  });

  it('rejects a group whose legs carry fees in two units instead of persisting one of them', async () => {
    const result = await useCase.execute(
      [
        krakenLeg({ tx_type: 'trade', group_id: 'REF-FEE', amount: '-50', asset: 'EUR', fee_amount: '0.05' }),
        krakenLeg({ tx_type: 'trade', group_id: 'REF-FEE', amount: '7704.16', asset: 'PUMP', fee_amount: '17.720' }),
      ],
      'spot',
      'kraken-spot',
    );

    expect(result.persisted).toBe(0);
    expect(ledgerPort.saveSpotTransaction).not.toHaveBeenCalled();
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toContain('fee_denomination_conflict');
  });

  /**
   * The ledger's `(amount_out IS NULL) = (asset_out_id IS NULL)` CHECK admits no half of a pair, and
   * moving a fiat side onto the fiat magnitudes is the one step that removes one. Folding the asset
   * while keeping the amount was survivable only while it ran in the client, where nothing enforced
   * that CHECK; behind the boundary it is a failed insert.
   */
  it('never leaves an amount without its asset when it folds a fiat side into the total', async () => {
    await useCase.execute(
      [
        krakenLeg({
          tx_type: 'buy',
          asset_in: 'BTC',
          amount_in: '0.5',
          asset_out: 'EUR',
          amount_out: '15000',
        }),
      ],
      'spot',
      'kraken-spot',
    );

    const [tx] = persisted(ledgerPort);
    expect((tx.amount_out === undefined) === (tx.asset_out_id === undefined)).toBe(true);
    expect((tx.amount_in === undefined) === (tx.asset_in_id === undefined)).toBe(true);
    // What was paid becomes the fiat total, and the outbound side goes with it.
    expect(tx.total_fiat).toBe('15000');
    expect(tx.fiat_currency).toBe('EUR');
    expect(tx.amount_out).toBeUndefined();
    expect(tx.asset_out_id).toBeUndefined();
  });

  it('classifies a movement the source labelled only `transfer`, from its own signed amount', async () => {
    const result = await useCase.execute(
      [krakenLeg({ tx_type: 'transfer', amount: '-179.11', asset: 'XRP', group_id: null })],
      'spot',
      'kraken-spot',
    );

    expect(result.rejected).toHaveLength(0);
    expect(persisted(ledgerPort)[0].tx_type).toBe('TRANSFER_OUT');
  });
});

/**
 * The regression this phase exists to prevent: one physical movement of one asset, written by the
 * source as two rows sharing a reference, must reach the ledger as two rows.
 *
 * Merged, it becomes a single transaction that both spends and receives XRP — which
 * `classifyCustodyMovement` cannot resolve, the custody engine has no pair to link, and the FIFO
 * engine reads as a disposal of a lot that never left the user's hands.
 */
describe('a two-row same-asset Kraken group survives to the ledger as two legs', () => {
  it('persists an outbound and an inbound leg, neither of them a self-swap', async () => {
    const ledgerPort = makeLedgerPort();
    const useCase = makeUseCase(ledgerPort);

    const result = await useCase.execute(
      [
        krakenLeg({
          tx_id: 'LSPOT',
          tx_type: 'transfer',
          group_id: 'TSPOTEARN-1',
          amount: '-1405.18513',
          asset: 'HBAR',
          metadata: { subclass: 'crypto', wallet: 'spot / main' },
        }),
        krakenLeg({
          tx_id: 'LEARN',
          tx_type: 'transfer',
          group_id: 'TSPOTEARN-1',
          amount: '1405.18513',
          asset: 'HBAR',
          metadata: { subclass: 'crypto', wallet: 'earn / bonded' },
        }),
      ],
      'spot',
      'kraken-spot',
    );

    expect(result.persisted).toBe(2);
    expect(result.rejected).toHaveLength(0);

    const rows = persisted(ledgerPort);
    expect(rows.map((tx) => tx.tx_type).sort()).toEqual(['TRANSFER_IN', 'TRANSFER_OUT']);

    const out = rows.find((tx) => tx.tx_type === 'TRANSFER_OUT');
    const into = rows.find((tx) => tx.tx_type === 'TRANSFER_IN');
    expect(out?.amount_out).toBe('1405.18513');
    expect(out?.asset_out_id).toBe('HBAR');
    expect(out?.asset_in_id).toBeUndefined();
    expect(into?.amount_in).toBe('1405.18513');
    expect(into?.asset_in_id).toBe('HBAR');
    expect(into?.asset_out_id).toBeUndefined();

    // Each leg belongs to the sub-wallet its own row named, which is what a custody split needs.
    expect(new Set(rows.map((tx) => tx.account_id)).size).toBe(2);
  });

  /**
   * The same group against the real schema, so the CHECK constraints and the identity of the rows are
   * the storage layer's own verdict rather than a mock's. A merged self-swap would have to write one
   * row holding XRP on both sides; two legs must be two rows with distinct identifiers.
   */
  it('writes two rows to a real ledger, each holding the asset on one side only', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    const adapter = new SQLiteLedgerAdapter(db);
    await adapter.initialize();
    const useCase = new CsvIngestionUseCase(
      adapter,
      { getHistoricalPrice: vi.fn().mockResolvedValue(toPreciseAmount('1000')) } as Mocked<IPriceProviderPort>,
      {
        getSetting: vi.fn().mockResolvedValue('EUR'),
        setSetting: vi.fn().mockResolvedValue(undefined),
      } as unknown as Mocked<IUserSettingsPort>,
    );

    try {
      const result = await useCase.execute(
        [
          krakenLeg({
            account_id: VENUE,
            tx_id: 'LSPOT',
            tx_type: 'transfer',
            group_id: 'TSPOTEARN-1',
            amount: '-1405.18513',
            asset: 'HBAR',
            metadata: { subclass: 'crypto', wallet: 'spot / main' },
          }),
          krakenLeg({
            account_id: VENUE,
            tx_id: 'LEARN',
            tx_type: 'transfer',
            group_id: 'TSPOTEARN-1',
            amount: '1405.18513',
            asset: 'HBAR',
            metadata: { subclass: 'crypto', wallet: 'earn / bonded' },
          }),
        ],
        'spot',
        'kraken-spot',
      );

      expect(result.rejected).toEqual([]);
      expect(result.persisted).toBe(2);

      const saved = [
        ...(await adapter.getSpotTransactions(deriveSubAccountId(VENUE, 'spot / main'))),
        ...(await adapter.getSpotTransactions(deriveSubAccountId(VENUE, 'earn / bonded'))),
      ];
      expect(saved).toHaveLength(2);
      expect(new Set(saved.map((tx) => tx.id_hash)).size).toBe(2);
      for (const tx of saved) {
        const bothSides = tx.asset_in_id !== undefined && tx.asset_out_id !== undefined;
        expect(bothSides).toBe(false);
      }
      expect(saved.map((tx) => tx.tx_type).sort()).toEqual(['TRANSFER_IN', 'TRANSFER_OUT']);
    } finally {
      db.close();
    }
  });
});
