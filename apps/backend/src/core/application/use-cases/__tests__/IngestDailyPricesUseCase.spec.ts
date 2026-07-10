import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mocked } from 'vitest';
import {
  IngestDailyPricesUseCase,
  computeIngestionJobs,
  addDays,
  todayUTC,
  type IngestionJob,
} from '../IngestDailyPricesUseCase.js';
import type { ILedgerPort } from '../../../domain/ports/ILedgerPort.js';
import type { IPriceIngestionPort } from '../../../domain/ports/IPriceIngestionPort.js';
import type { IHistoricalMarketDataPort } from '../../../domain/ports/IHistoricalMarketDataPort.js';

// ---------------------------------------------------------------------------
// Pure helpers — no mocks needed
// ---------------------------------------------------------------------------

describe('addDays()', () => {
  it('adds days within the same month', () => {
    expect(addDays('2024-01-10', 5)).toBe('2024-01-15');
  });

  it('[Strict TDD] handles cross-month boundary (Jan 31 + 1 = Feb 1)', () => {
    expect(addDays('2024-01-31', 1)).toBe('2024-02-01');
  });

  it('[Strict TDD] handles cross-year boundary (Dec 31 + 1 = Jan 1)', () => {
    expect(addDays('2023-12-31', 1)).toBe('2024-01-01');
  });

  it('handles leap day (Feb 28 + 1 = Feb 29 in leap year)', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });
});

describe('todayUTC()', () => {
  it('[Strict TDD] returns a valid ISO-8601 date string (YYYY-MM-DD)', () => {
    const result = todayUTC();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a date that is today or earlier (not in the future)', () => {
    const result = todayUTC();
    const now = new Date().toISOString().slice(0, 10);
    expect(result <= now).toBe(true);
  });
});

describe('computeIngestionJobs()', () => {
  const today = '2024-06-15';

  it('[Strict TDD] returns empty array when no assets are tracked', () => {
    const jobs = computeIngestionJobs([], new Map(), today);
    expect(jobs).toEqual([]);
  });

  it('[Strict TDD] returns empty array when all assets are up-to-date', () => {
    const assets = [{ assetId: 'uuid-btc', symbol: 'BTC' }];
    const lastDates = new Map<string, string | null>([['BTC', today]]);
    const jobs = computeIngestionJobs(assets, lastDates, today);
    expect(jobs).toEqual([]);
  });

  it('[Strict TDD] uses "2020-01-01" as fromDate when lastDate is null (first run)', () => {
    const assets = [{ assetId: 'uuid-btc', symbol: 'BTC' }];
    const lastDates = new Map<string, string | null>([['BTC', null]]);
    const jobs = computeIngestionJobs(assets, lastDates, today);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject<IngestionJob>({
      assetId: 'uuid-btc',
      symbol: 'BTC',
      fromDate: '2020-01-01',
      toDate: today,
    });
  });

  it('[Strict TDD] computes correct fromDate = lastDate + 1 day', () => {
    const assets = [{ assetId: 'uuid-eth', symbol: 'ETH' }];
    const lastDates = new Map<string, string | null>([['ETH', '2024-06-10']]);
    const jobs = computeIngestionJobs(assets, lastDates, today);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.fromDate).toBe('2024-06-11');
    expect(jobs[0]?.toDate).toBe(today);
  });

  it('handles multiple assets with mixed states', () => {
    const assets = [
      { assetId: 'uuid-btc', symbol: 'BTC' },
      { assetId: 'uuid-eth', symbol: 'ETH' },
      { assetId: 'uuid-sol', symbol: 'SOL' },
    ];
    const lastDates = new Map<string, string | null>([
      ['BTC', today], // up-to-date → skip
      ['ETH', '2024-05-01'], // stale → include
      ['SOL', null], // never ingested → include with default start
    ]);
    const jobs = computeIngestionJobs(assets, lastDates, today);
    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.symbol).sort()).toEqual(['ETH', 'SOL']);
  });
});

// ---------------------------------------------------------------------------
// IngestDailyPricesUseCase.execute() — integration test with mocks
// ---------------------------------------------------------------------------

function makeMockLedger(): Mocked<ILedgerPort> {
  return {
    initialize: vi.fn(),
    getSpotTransactions: vi.fn(),
    saveSpotTransaction: vi.fn(),
    getFuturesTransactions: vi.fn(),
    saveFuturesTransaction: vi.fn(),
    getTaxLots: vi.fn(),
    createTaxLot: vi.fn(),
    upsertTaxLots: vi.fn(),
    getLotHistoryEvents: vi.fn(),
    saveLotHistoryEvent: vi.fn(),
    upsertLotHistoryEvents: vi.fn(),
    getAccounts: vi.fn(),
    ensureAssetExists: vi.fn(),
    ensureAccountExists: vi.fn(),
    getTrackedAssets: vi.fn(),
  } as Mocked<ILedgerPort>;
}

function makeMockPriceIngestion(): Mocked<IPriceIngestionPort> {
  return {
    getLastIngestedDate: vi.fn(),
    writePricesToParquet: vi.fn(),
  } as Mocked<IPriceIngestionPort>;
}

function makeMockHistoricalData(): Mocked<IHistoricalMarketDataPort> {
  return {
    getHistoricalOHLCV: vi.fn(),
  } as Mocked<IHistoricalMarketDataPort>;
}

describe('[Strict TDD] IngestDailyPricesUseCase.execute()', () => {
  let ledger: Mocked<ILedgerPort>;
  let priceIngestion: Mocked<IPriceIngestionPort>;
  let historicalData: Mocked<IHistoricalMarketDataPort>;
  let useCase: IngestDailyPricesUseCase;

  beforeEach(() => {
    ledger = makeMockLedger();
    priceIngestion = makeMockPriceIngestion();
    historicalData = makeMockHistoricalData();
    useCase = new IngestDailyPricesUseCase(ledger, priceIngestion, historicalData);
  });

  it('returns empty results when no assets are tracked', async () => {
    ledger.getTrackedAssets.mockResolvedValue([]);
    const results = await useCase.execute();
    expect(results).toEqual([]);
    expect(priceIngestion.getLastIngestedDate).not.toHaveBeenCalled();
    expect(historicalData.getHistoricalOHLCV).not.toHaveBeenCalled();
  });

  it('[Strict TDD] full Functional Sandwich: tracked assets → dates → fetch → write', async () => {
    const today = todayUTC();
    ledger.getTrackedAssets.mockResolvedValue([{ assetId: 'uuid-btc', symbol: 'BTC' }]);
    priceIngestion.getLastIngestedDate.mockResolvedValue(null); // never ingested

    const mockRecord = {
      date: '2024-01-01',
      assetId: '',
      symbol: 'BTC',
      open: 42000,
      high: 43000,
      low: 41000,
      close: 42500,
      volume: 1000,
      currency: 'USD',
    };
    historicalData.getHistoricalOHLCV.mockResolvedValue([mockRecord]);
    priceIngestion.writePricesToParquet.mockResolvedValue(undefined);

    const results = await useCase.execute();

    // Step 1: getTrackedAssets was called
    expect(ledger.getTrackedAssets).toHaveBeenCalledOnce();

    // Step 2: getLastIngestedDate was called per asset
    expect(priceIngestion.getLastIngestedDate).toHaveBeenCalledWith('BTC');

    // Step 3 + 4: getHistoricalOHLCV was called with correct fromDate
    expect(historicalData.getHistoricalOHLCV).toHaveBeenCalledWith('BTC', '2020-01-01');

    // Step 5: writePricesToParquet was called with hydrated records (assetId injected)
    expect(priceIngestion.writePricesToParquet).toHaveBeenCalledWith([
      { ...mockRecord, assetId: 'uuid-btc' },
    ]);

    // Result shape
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ asset: 'BTC', datesFetched: 1, errors: [] });
  });

  it('[Strict TDD] skips an asset if already up-to-date', async () => {
    const today = todayUTC();
    ledger.getTrackedAssets.mockResolvedValue([{ assetId: 'uuid-btc', symbol: 'BTC' }]);
    priceIngestion.getLastIngestedDate.mockResolvedValue(today); // already current

    const results = await useCase.execute();

    expect(historicalData.getHistoricalOHLCV).not.toHaveBeenCalled();
    expect(priceIngestion.writePricesToParquet).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  it('[Strict TDD] records errors for failed assets without stopping other assets', async () => {
    ledger.getTrackedAssets.mockResolvedValue([
      { assetId: 'uuid-btc', symbol: 'BTC' },
      { assetId: 'uuid-eth', symbol: 'ETH' },
    ]);
    priceIngestion.getLastIngestedDate.mockResolvedValue(null);
    historicalData.getHistoricalOHLCV
      .mockRejectedValueOnce(new Error('API error for BTC'))
      .mockResolvedValueOnce([]);

    const results = await useCase.execute();

    expect(results).toHaveLength(2);
    const btcResult = results.find((r) => r.asset === 'BTC');
    const ethResult = results.find((r) => r.asset === 'ETH');
    expect(btcResult?.errors).toHaveLength(1);
    expect(btcResult?.errors[0]).toContain('API error for BTC');
    expect(ethResult?.errors).toHaveLength(0);
  });
});
