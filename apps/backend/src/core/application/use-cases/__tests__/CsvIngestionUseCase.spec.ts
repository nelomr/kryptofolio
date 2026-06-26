import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Decimal from 'decimal.js';
import type { Mocked } from 'vitest';
import { CsvIngestionUseCase, type IngestibleTransaction } from '../CsvIngestionUseCase.js';
import type { IPriceProviderPort } from '../../../domain/ports/IPriceProviderPort.js';
import type { ILedgerPort } from '../../../domain/ports/ILedgerPort';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SQLiteLedgerAdapter } from '../../../infrastructure/adapters/SQLiteLedgerAdapter';

const MIGRATION_SQL = readFileSync(
  resolve(__dirname, '../../../../../../../packages/database/migrations/sqlite/002_ledger_schema.sql'),
  'utf-8'
);

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
    ensureAssetExists: vi.fn().mockResolvedValue(undefined),
    ensureAccountExists: vi.fn().mockResolvedValue(undefined),
  } as Mocked<ILedgerPort>;
}

function makeMockPriceProvider(price = '1000'): Mocked<IPriceProviderPort> {
  return {
    getHistoricalPrice: vi.fn().mockResolvedValue(new Decimal(price)),
  } as Mocked<IPriceProviderPort>;
}

// ---------------------------------------------------------------------------
// Unit Tests — Mocked Port
// ---------------------------------------------------------------------------

describe('CsvIngestionUseCase — Unit Tests', () => {
  let useCase: CsvIngestionUseCase;
  let ledgerPort: Mocked<ILedgerPort>;
  let priceProvider: Mocked<IPriceProviderPort>;

  beforeEach(() => {
    ledgerPort = makeMockLedgerPort();
    priceProvider = makeMockPriceProvider();
    useCase = new CsvIngestionUseCase(ledgerPort, priceProvider);
  });

  it('resolves FK dependencies before inserting (ensureAssetExists per asset)', async () => {
    const rows: IngestibleTransaction[] = [{
      account_id: '10000000-0000-0000-0000-000000000001',
      id_hash: 'hash-1',
      tx_type: 'buy',
      timestamp: '2023-01-01T00:00:00Z',
      asset_in: 'BTC',
      amount_in: '1',
      asset_out: 'USDT',
      amount_out: '20000',
      fee_currency: 'BNB',
      fee_amount: '0.1',
      balance: '',
      metadata: {},
    }];

    await useCase.execute(rows, 'spot');

    expect(ledgerPort.ensureAssetExists).toHaveBeenCalledWith('BTC');
    expect(ledgerPort.ensureAssetExists).toHaveBeenCalledWith('USDT');
    expect(ledgerPort.ensureAssetExists).toHaveBeenCalledWith('BNB');
    expect(ledgerPort.ensureAccountExists).toHaveBeenCalledWith('10000000-0000-0000-0000-000000000001');
    expect(ledgerPort.saveSpotTransaction).toHaveBeenCalled();
  });

  it('normalizes lowercase tx_type to canonical uppercase value', async () => {
    const rows: IngestibleTransaction[] = [{
      id_hash: 'custom-hash',
      account_id: '10000000-0000-0000-0000-000000000001',
      tx_type: 'buy', // lowercase input from CSV
      timestamp: '2023-01-01T00:00:00Z',
      asset_in: 'BTC',
      amount_in: '1.5',
      balance: '',
      metadata: {},
    }];

    await useCase.execute(rows, 'spot');

    expect(ledgerPort.saveSpotTransaction).toHaveBeenCalledWith(expect.objectContaining({
      id_hash: 'custom-hash',
      account_id: '10000000-0000-0000-0000-000000000001',
      tx_type: 'BUY', // must be uppercase canonical value
    }));
  });

  it('throws if id_hash is missing (C-7: no random fallback)', async () => {
    const rows = [{
      account_id: '10000000-0000-0000-0000-000000000001',
      id_hash: '', // deliberately empty
      tx_type: 'BUY',
      timestamp: '2023-01-01T00:00:00Z',
      balance: '',
      metadata: {},
    }] as IngestibleTransaction[];

    await expect(useCase.execute(rows, 'spot')).rejects.toThrow(/id_hash is required/);
  });

  it('throws if account_id is missing', async () => {
    const rows = [{
      account_id: '', // deliberately empty
      id_hash: 'hash-valid',
      tx_type: 'BUY',
      timestamp: '2023-01-01T00:00:00Z',
      balance: '',
      metadata: {},
    }] as IngestibleTransaction[];

    await expect(useCase.execute(rows, 'spot')).rejects.toThrow(/Account ID is required/);
  });

  it('maps STAKING tx_type correctly (was missing from old Zod schema)', async () => {
    const rows: IngestibleTransaction[] = [{
      id_hash: 'hash-staking',
      account_id: '10000000-0000-0000-0000-000000000002',
      tx_type: 'staking',
      timestamp: '2023-01-01T00:00:00Z',
      asset_in: 'ETH',
      amount_in: '0.5',
      balance: '',
      metadata: {},
    }];

    await useCase.execute(rows, 'spot');

    expect(ledgerPort.saveSpotTransaction).toHaveBeenCalledWith(expect.objectContaining({
      tx_type: 'STAKING',
    }));
  });

  it('maps futures tx_types: realized_pnl → SETTLEMENT', async () => {
    const rows: IngestibleTransaction[] = [{
      id_hash: 'hash-futures',
      account_id: '10000000-0000-0000-0000-000000000001',
      tx_type: 'realized_pnl',
      timestamp: '2023-01-01T00:00:00Z',
      symbol: 'BTCUSDT',
      realized_pnl: '250',
      balance: '',
      metadata: {},
    }];

    await useCase.execute(rows, 'futures');

    expect(ledgerPort.saveFuturesTransaction).toHaveBeenCalledWith(expect.objectContaining({
      tx_type: 'SETTLEMENT',
      symbol: 'BTCUSDT',
    }));
  });
});

// ---------------------------------------------------------------------------
// E2E Tests — Real SQLite with real migration schema (W-3 fix)
// ---------------------------------------------------------------------------

describe('CsvIngestionUseCase — E2E with Real Migration Schema', () => {
  let db: DatabaseSync;
  let adapter: SQLiteLedgerAdapter;
  let useCase: CsvIngestionUseCase;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(MIGRATION_SQL); // Use REAL schema, not simplified inline schema

    adapter = new SQLiteLedgerAdapter(db);
    useCase = new CsvIngestionUseCase(adapter, makeMockPriceProvider());
  });

  afterEach(() => {
    db.close();
  });

  it('ingests a spot transaction with full FK resolution and persists correctly', async () => {
    const rows: IngestibleTransaction[] = [{
      id_hash: 'real-hash-e2e',
      account_id: '10000000-0000-0000-0000-000000000002',
      tx_type: 'buy',
      timestamp: '2023-01-01T10:00:00Z',
      asset_in: 'ETH',
      amount_in: '10',
      asset_out: 'EUR',
      amount_out: '15000',
      fee_currency: 'EUR',
      fee_amount: '15',
      total_fiat: '15000',
      price_fiat: '1500',
      balance: '',
      metadata: {},
    }];

    await useCase.execute(rows, 'spot');

    const saved = await adapter.getSpotTransactions('10000000-0000-0000-0000-000000000002');
    expect(saved).toHaveLength(1);
    expect(saved[0].id_hash).toBe('real-hash-e2e');
    expect(saved[0].asset_in_id).toBe('ETH');
    expect(saved[0].amount_in?.toString()).toBe('10');
    expect(saved[0].tx_type).toBe('BUY');
  });

  it('ingesting same id_hash twice does not create duplicates', async () => {
    const row: IngestibleTransaction = {
      id_hash: 'hash-idem',
      account_id: '10000000-0000-0000-0000-000000000002',
      tx_type: 'buy',
      timestamp: '2023-01-01T10:00:00Z',
      asset_in: 'BTC',
      amount_in: '1',
      balance: '',
      metadata: {},
    };

    await useCase.execute([row], 'spot');
    await useCase.execute([row], 'spot'); // duplicate

    const saved = await adapter.getSpotTransactions('10000000-0000-0000-0000-000000000002');
    expect(saved).toHaveLength(1);
  });
});
