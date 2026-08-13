import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mocked } from 'vitest';
import { CsvIngestionUseCase, type SubmittedTransaction } from '../CsvIngestionUseCase.js';
import type { ILedgerPort } from '../../../domain/ports/ILedgerPort.js';
import type { IPriceProviderPort } from '../../../domain/ports/IPriceProviderPort.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import type {
  FxBackfillRequest,
  IBackfillSchedulerPort,
} from '../../../domain/ports/IBackfillSchedulerPort.js';
import { toPreciseAmount } from '../../../domain/value-objects/PreciseAmount.js';
import { deriveSubAccountId } from '@kryptofolio/shared-types';

const NO_RECONCILIATION = { inserted: 0, updated: 0, retired: 0, reactivated: 0 };

function makeMockLedgerPort(): Mocked<ILedgerPort> {
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

function makeRows(timestamps: readonly string[]): SubmittedTransaction[] {
  return timestamps.map((timestamp) => ({
    account_id: '10000000-0000-0000-0000-000000000001',
    tx_type: 'buy',
    timestamp,
    asset_in: 'BTC',
    amount_in: '1',
    asset_out: 'USDT',
    amount_out: '20000',
    total_fiat: '20000',
    price_fiat: '20000',
    metadata: {},
  }));
}

describe('CsvIngestionUseCase schedules FX backfill', () => {
  let ledgerPort: Mocked<ILedgerPort>;
  let priceProvider: Mocked<IPriceProviderPort>;
  let userSettingsPort: Mocked<IUserSettingsPort>;
  let requests: FxBackfillRequest[];

  beforeEach(() => {
    ledgerPort = makeMockLedgerPort();
    priceProvider = {
      getHistoricalPrice: vi.fn().mockResolvedValue(toPreciseAmount('20000')),
    } as Mocked<IPriceProviderPort>;
    userSettingsPort = {
      getSetting: vi.fn().mockResolvedValue(null),
      setSetting: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<IUserSettingsPort>;
    requests = [];
  });

  function makeUseCase(scheduler: IBackfillSchedulerPort): CsvIngestionUseCase {
    return new CsvIngestionUseCase(ledgerPort, priceProvider, userSettingsPort, scheduler);
  }

  const recording: IBackfillSchedulerPort = {
    requestFxBackfill: (request) => {
      requests.push(request);
    },
  };

  it('requests exactly one backfill from the batch oldest date through today', async () => {
    const useCase = makeUseCase(recording);
    const today = new Date().toISOString().slice(0, 10);

    const result = await useCase.execute(
      makeRows(['2021-03-04T10:00:00Z', '2023-07-19T10:00:00Z', '2022-01-01T10:00:00Z']),
      'spot',
      'generic',
      'UTC',
    );

    expect(result.persisted).toBe(3);
    expect(requests).toEqual([{ from: '2021-03-04', to: today }]);
  });

  it('requests a backfill on every ingestion, so a later import reaching further back extends coverage', async () => {
    const useCase = makeUseCase(recording);

    await useCase.execute(makeRows(['2024-05-06T10:00:00Z']), 'spot', 'generic', 'UTC');
    await useCase.execute(makeRows(['2019-02-11T10:00:00Z']), 'spot', 'generic', 'UTC');

    expect(requests.map((r) => r.from)).toEqual(['2024-05-06', '2019-02-11']);
  });

  it('requests nothing when the batch persisted nothing', async () => {
    const useCase = makeUseCase(recording);

    const result = await useCase.execute([], 'spot', 'generic', 'UTC');

    expect(result.persisted).toBe(0);
    expect(requests).toEqual([]);
  });

  it('persists the ingested rows even when scheduling the backfill fails', async () => {
    const exploding: IBackfillSchedulerPort = {
      requestFxBackfill: () => {
        throw new Error('ECB history unreachable');
      },
    };

    const result = await makeUseCase(exploding).execute(
      makeRows(['2022-06-01T10:00:00Z']),
      'spot',
      'generic',
      'UTC',
    );

    expect(result.persisted).toBe(1);
    expect(ledgerPort.saveSpotTransaction).toHaveBeenCalledTimes(1);
  });
});
