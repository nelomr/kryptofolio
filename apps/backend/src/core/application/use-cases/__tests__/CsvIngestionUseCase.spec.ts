import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Decimal from 'decimal.js';
import type { Mocked } from 'vitest';
import { CsvIngestionUseCase, type IngestibleTransaction } from '../CsvIngestionUseCase.js';
import type { IPriceProviderPort } from '../../../domain/ports/IPriceProviderPort.js';
import type { ILedgerPort } from '../../../domain/ports/ILedgerPort';
import { DatabaseSync } from 'node:sqlite';
import { SQLiteLedgerAdapter } from '../../../infrastructure/adapters/SQLiteLedgerAdapter';

import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
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
    // Mirrors the adapter's contract: the returned id may be a child derived from the wallet.
    ensureAccountExists: vi.fn(async (input: { accountId: string; wallet?: string | null }) =>
      deriveSubAccountId(input.accountId, input.wallet),
    ),
    getTrackedAssets: vi.fn().mockResolvedValue([]),
  } as Mocked<ILedgerPort>;
}

import { toPreciseAmount } from '../../../domain/value-objects/PreciseAmount.js';

function makeMockPriceProvider(price = '1000'): Mocked<IPriceProviderPort> {
  return {
    getHistoricalPrice: vi.fn().mockResolvedValue(toPreciseAmount(price)),
  } as Mocked<IPriceProviderPort>;
}

function makeMockUserSettingsPort(): Mocked<IUserSettingsPort> {
  return {
    getSetting: vi.fn().mockResolvedValue(null),
    setSetting: vi.fn().mockResolvedValue(undefined),
  } as unknown as Mocked<IUserSettingsPort>;
}

// ---------------------------------------------------------------------------
// Unit Tests — Mocked Port
// ---------------------------------------------------------------------------

describe('CsvIngestionUseCase — Unit Tests', () => {
  let useCase: CsvIngestionUseCase;
  let ledgerPort: Mocked<ILedgerPort>;
  let priceProvider: Mocked<IPriceProviderPort>;
  let userSettingsPort: Mocked<IUserSettingsPort>;

  beforeEach(() => {
    ledgerPort = makeMockLedgerPort();
    priceProvider = makeMockPriceProvider();
    userSettingsPort = makeMockUserSettingsPort();
    useCase = new CsvIngestionUseCase(ledgerPort, priceProvider, userSettingsPort);
  });

  it('flags needs_recalculation as true after successful ingestion', async () => {
    const rows: IngestibleTransaction[] = [{
      account_id: '10000000-0000-0000-0000-000000000001',
      id_hash: 'hash-1',
      tx_type: 'buy',
      timestamp: '2023-01-01T00:00:00Z',
      asset_in: 'BTC',
      amount_in: '1.5',
      asset_out: 'USDT',
      amount_out: '30000',
      total_fiat: '30000',
      price_fiat: '20000',
      metadata: {},
    }];

    await useCase.execute(rows, 'spot', 'generic');
    expect(userSettingsPort.setSetting).toHaveBeenCalledWith('needs_recalculation', 'true');
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

    await useCase.execute(rows, 'spot', 'generic');

    expect(ledgerPort.ensureAssetExists).toHaveBeenCalledWith({ assetId: 'BTC', symbol: 'BTC', isFiat: false });
    expect(ledgerPort.ensureAssetExists).toHaveBeenCalledWith({ assetId: 'USDT', symbol: 'USDT', isFiat: false });
    expect(ledgerPort.ensureAssetExists).toHaveBeenCalledWith({ assetId: 'BNB', symbol: 'BNB', isFiat: false });
    expect(ledgerPort.ensureAccountExists).toHaveBeenCalledWith({
      accountId: '10000000-0000-0000-0000-000000000001',
      wallet: undefined,
    });
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

    await useCase.execute(rows, 'spot', 'generic');

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

    await expect(useCase.execute(rows, 'spot', 'generic')).rejects.toThrow(/id_hash is required/);
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

    await expect(useCase.execute(rows, 'spot', 'generic')).rejects.toThrow(/Account ID is required/);
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

    await useCase.execute(rows, 'spot', 'generic');

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

    await useCase.execute(rows, 'futures', 'generic');

    expect(ledgerPort.saveFuturesTransaction).toHaveBeenCalledWith(expect.objectContaining({
      tx_type: 'SETTLEMENT',
      symbol: 'BTCUSDT',
    }));
  });
});

// ---------------------------------------------------------------------------
// Ingestion integrity
// ---------------------------------------------------------------------------

describe('CsvIngestionUseCase — ingestion integrity', () => {
  let ledgerPort: Mocked<ILedgerPort>;
  let userSettingsPort: Mocked<IUserSettingsPort>;

  function makeUseCase(price = '1000'): CsvIngestionUseCase {
    return new CsvIngestionUseCase(ledgerPort, makeMockPriceProvider(price), userSettingsPort);
  }

  function row(overrides: Partial<IngestibleTransaction> = {}): IngestibleTransaction {
    return {
      id_hash: 'hash-1',
      account_id: '10000000-0000-0000-0000-000000000002',
      tx_type: 'buy',
      timestamp: '2024-03-01T10:00:00Z',
      asset_in: 'XRP',
      amount_in: '247.10551',
      metadata: {},
      ...overrides,
    };
  }

  function savedSpot(index = 0): { total_fiat: string; price_fiat: string; tx_type: string; fee_asset_id?: string } {
    const call = ledgerPort.saveSpotTransaction.mock.calls[index];
    const tx = call[0];
    return {
      total_fiat: tx.total_fiat.toString(),
      price_fiat: tx.price_fiat.toString(),
      tx_type: tx.tx_type,
      fee_asset_id: tx.fee_asset_id,
    };
  }

  beforeEach(() => {
    ledgerPort = makeMockLedgerPort();
    userSettingsPort = makeMockUserSettingsPort();
  });

  describe('fiat magnitudes are sign-normalised', () => {
    it('persists a negative total_fiat as its magnitude', async () => {
      await makeUseCase().execute(
        [row({ total_fiat: '-299.70', price_fiat: '1.2128', fiat_currency: 'EUR' })],
        'spot',
        'generic',
      );

      expect(savedSpot().total_fiat).toBe('299.7');
      // A positive magnitude over a positive quantity is what makes unit_cost_fiat positive.
      expect(Number(savedSpot().total_fiat) / 247.10551).toBeGreaterThan(0);
    });

    it('persists a negative price_fiat as its magnitude', async () => {
      await makeUseCase().execute(
        [row({ total_fiat: '299.70', price_fiat: '-1.2128', fiat_currency: 'EUR' })],
        'spot',
        'generic',
      );

      expect(savedSpot().price_fiat).toBe('1.2128');
    });

    it('normalises the sign with decimal arithmetic rather than native numbers', async () => {
      // 28 significant digits: IEEE-754 rounds this, Decimal does not.
      await makeUseCase().execute(
        [row({ total_fiat: '-1234567890123456789.123456789', price_fiat: '0.5', fiat_currency: 'EUR' })],
        'spot',
        'generic',
      );

      expect(savedSpot().total_fiat).toBe('1234567890123456789.123456789');
    });

    it('derives the fiat total from an absolute quantity', async () => {
      await makeUseCase('1').execute(
        [row({ tx_type: 'withdrawal', asset_in: undefined, amount_in: undefined, asset_out: 'XRP', amount_out: '-439.55' })],
        'spot',
        'generic',
      );

      expect(savedSpot().total_fiat).toBe('439.55');
    });
  });

  describe('unknown transaction types fail loudly', () => {
    it('rejects an unmapped type, naming the value and the row timestamp', async () => {
      const result = await makeUseCase().execute(
        [row({ tx_type: 'LIQUIDATION_TRANSFER', total_fiat: '100', price_fiat: '1' })],
        'spot',
        'generic',
      );

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toContain('LIQUIDATION_TRANSFER');
      expect(result.rejected[0].reason).toContain('2024-03-01T10:00:00Z');
      expect(result.rejected[0].idHash).toBe('hash-1');
    });

    it('writes no transaction for an unmapped type and does not convert it to a BUY', async () => {
      await makeUseCase().execute(
        [row({ tx_type: 'LIQUIDATION_TRANSFER', total_fiat: '100', price_fiat: '1' })],
        'spot',
        'generic',
      );

      expect(ledgerPort.saveSpotTransaction).not.toHaveBeenCalled();
    });

    it('persists the valid rows of a batch that also contains an unmappable one', async () => {
      const result = await makeUseCase().execute(
        [
          row({ id_hash: 'hash-bad', tx_type: 'LIQUIDATION_TRANSFER', total_fiat: '100', price_fiat: '1' }),
          row({ id_hash: 'hash-good', tx_type: 'sell', total_fiat: '100', price_fiat: '1' }),
        ],
        'spot',
        'generic',
      );

      expect(result.persisted).toBe(1);
      expect(result.rejected.map((r) => r.idHash)).toEqual(['hash-bad']);
      expect(ledgerPort.saveSpotTransaction).toHaveBeenCalledTimes(1);
      expect(savedSpot().tx_type).toBe('SELL');
    });
  });

  describe('the mapper never supplies a direction the domain declined to determine', () => {
    /**
     * The normalizer keeps a movement's raw lowercase label when `classifyCustodyMovement` cannot
     * resolve its direction. A label arriving here therefore carries a refusal, and mapping it to
     * one direction anyway overrules the only layer entitled to decide.
     */
    it('rejects a bare `transfer` instead of assuming it is inbound', async () => {
      const result = await makeUseCase().execute(
        [row({ tx_type: 'transfer', total_fiat: '100', price_fiat: '1' })],
        'spot',
        'generic',
      );

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toContain('transfer');
      expect(ledgerPort.saveSpotTransaction).not.toHaveBeenCalled();
    });

    it('rejects a bare `trade` instead of assuming it is a purchase', async () => {
      const result = await makeUseCase().execute(
        [row({ tx_type: 'trade', total_fiat: '100', price_fiat: '1' })],
        'spot',
        'generic',
      );

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toContain('trade');
      expect(ledgerPort.saveSpotTransaction).not.toHaveBeenCalled();
    });

    it('still accepts the directional forms the domain does resolve', async () => {
      const result = await makeUseCase().execute(
        [
          row({ id_hash: 'h-in', tx_type: 'transfer_in', total_fiat: '100', price_fiat: '1' }),
          row({ id_hash: 'h-out', tx_type: 'transfer_out', total_fiat: '100', price_fiat: '1' }),
        ],
        'spot',
        'generic',
      );

      expect(result.persisted).toBe(2);
      expect(result.rejected).toHaveLength(0);
    });

    it('maps the labels real futures exports carry, not idealised ones', async () => {
      // Kraken writes `futures trade` and `funding rate change`; the normalizer uppercases them.
      const result = await makeUseCase().execute(
        [
          row({ id_hash: 'k1', tx_type: 'FUTURES TRADE', total_fiat: '1', price_fiat: '1' }),
          row({ id_hash: 'k2', tx_type: 'FUTURES LIQUIDATION', total_fiat: '1', price_fiat: '1' }),
          row({ id_hash: 'k3', tx_type: 'FUNDING RATE CHANGE', total_fiat: '1', price_fiat: '1' }),
        ],
        'futures',
        'generic',
      );

      expect(result.rejected).toHaveLength(0);
      expect(result.persisted).toBe(3);
    });

    it('rejects a collateral conversion rather than recording it as a position trade', async () => {
      // `FuturesTxType` has no member meaning "collateral converted"; guessing one invents a trade.
      const result = await makeUseCase().execute(
        [row({ tx_type: 'CONVERSION', total_fiat: '1', price_fiat: '1' })],
        'futures',
        'generic',
      );

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toContain('CONVERSION');
    });

    it('rejects an unmapped futures type instead of defaulting it to a TRADE', async () => {
      const result = await makeUseCase().execute(
        [row({ tx_type: 'ADL_ASSIGNMENT', total_fiat: '100', price_fiat: '1' })],
        'futures',
        'generic',
      );

      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].reason).toContain('ADL_ASSIGNMENT');
      expect(ledgerPort.saveFuturesTransaction).not.toHaveBeenCalled();
    });

    it('rejects a futures `transfer` rather than recording a position trade', async () => {
      // A margin movement is custody, not a trade. Recording it as one invents a position.
      const result = await makeUseCase().execute(
        [row({ tx_type: 'transfer', total_fiat: '100', price_fiat: '1' })],
        'futures',
        'generic',
      );

      expect(result.rejected).toHaveLength(1);
      expect(ledgerPort.saveFuturesTransaction).not.toHaveBeenCalled();
    });

    it('still accepts every canonical futures type', async () => {
      const result = await makeUseCase().execute(
        [
          row({ id_hash: 'f1', tx_type: 'trade', total_fiat: '1', price_fiat: '1' }),
          row({ id_hash: 'f2', tx_type: 'funding_fee', total_fiat: '1', price_fiat: '1' }),
          row({ id_hash: 'f3', tx_type: 'realized_pnl', total_fiat: '1', price_fiat: '1' }),
          row({ id_hash: 'f4', tx_type: 'liquidation', total_fiat: '1', price_fiat: '1' }),
        ],
        'futures',
        'generic',
      );

      expect(result.rejected).toHaveLength(0);
      expect(result.persisted).toBe(4);
    });
  });

  describe('unresolved fiat magnitudes are explicit about failure', () => {
    it('reports an unpriceable acquisition as pending rather than as a genuine zero cost', async () => {
      const result = await makeUseCase('0').execute(
        [row({ tx_type: 'staking', total_fiat: '', price_fiat: '' })],
        'spot',
        'generic',
      );

      expect(result.persisted).toBe(1);
      expect(result.unresolvedFiat).toBe(1);
      expect(result.rejected).toHaveLength(0);
      // `0` is what the column can hold; the count above is what says it is unknown.
      expect(savedSpot().total_fiat).toBe('0');
    });

    it('does not count a resolvable row as pending', async () => {
      const result = await makeUseCase('2').execute(
        [row({ tx_type: 'staking', total_fiat: '', price_fiat: '' })],
        'spot',
        'generic',
      );

      expect(result.unresolvedFiat).toBe(0);
      expect(savedSpot().price_fiat).toBe('2');
      expect(savedSpot().total_fiat).toBe('494.21102');
    });

    it('completes the batch and reports every unresolvable row in it', async () => {
      const result = await makeUseCase('0').execute(
        [
          row({ id_hash: 'h1', tx_type: 'staking', total_fiat: '', price_fiat: '' }),
          row({ id_hash: 'h2', tx_type: 'airdrop', total_fiat: '', price_fiat: '' }),
          row({ id_hash: 'h3', tx_type: 'buy', total_fiat: '100', price_fiat: '1' }),
        ],
        'spot',
        'generic',
      );

      expect(result.persisted).toBe(3);
      expect(result.unresolvedFiat).toBe(2);
    });

    it('keeps a recorded total when only the unit price is missing', async () => {
      await makeUseCase('999').execute(
        [row({ total_fiat: '-299.70', price_fiat: '', fiat_currency: 'EUR' })],
        'spot',
        'generic',
      );

      expect(savedSpot().total_fiat).toBe('299.7');
      expect(savedSpot().price_fiat).not.toBe('999');
      expect(Number(savedSpot().price_fiat)).toBeCloseTo(1.2128, 4);
    });

    it('keeps a fee denominated in another currency out of the fiat total', async () => {
      await makeUseCase('1').execute(
        [row({
          total_fiat: '299.70',
          price_fiat: '1.2128',
          fiat_currency: 'EUR',
          fee_currency: 'USDT',
          fee_amount: '5',
        })],
        'spot',
        'generic',
      );

      expect(savedSpot().fee_asset_id).toBe('USDT');
      expect(savedSpot().total_fiat).toBe('299.7');
    });
  });
});

// ---------------------------------------------------------------------------
// The fee model — denomination, convention, and the zero/absent distinction
// ---------------------------------------------------------------------------

describe('CsvIngestionUseCase — the fee model', () => {
  let ledgerPort: Mocked<ILedgerPort>;
  let userSettingsPort: Mocked<IUserSettingsPort>;

  function makeUseCase(price = '1000'): CsvIngestionUseCase {
    return new CsvIngestionUseCase(ledgerPort, makeMockPriceProvider(price), userSettingsPort);
  }

  function row(overrides: Partial<IngestibleTransaction> = {}): IngestibleTransaction {
    return {
      id_hash: 'hash-fee',
      account_id: '10000000-0000-0000-0000-000000000002',
      tx_type: 'withdrawal',
      timestamp: '2025-09-16T13:07:47Z',
      asset: 'HBAR',
      amount: '-24',
      asset_out: 'HBAR',
      amount_out: '24',
      total_fiat: '5',
      price_fiat: '0.2',
      fiat_currency: 'EUR',
      metadata: {},
      ...overrides,
    };
  }

  function saved(index = 0) {
    const tx = ledgerPort.saveSpotTransaction.mock.calls[index][0];
    return {
      feeAmount: tx.fee_amount?.toString(),
      feeAssetId: tx.fee_asset_id,
      totalFiat: tx.total_fiat.toString(),
      amountOut: tx.amount_out?.toString(),
    };
  }

  beforeEach(() => {
    ledgerPort = makeMockLedgerPort();
    userSettingsPort = makeMockUserSettingsPort();
  });

  describe('a stated zero and an empty cell reach the ledger as different states', () => {
    it('persists an explicit zero as a zero, denominated by the profile', async () => {
      // 22 Kraken rows and 18 Bitvavo rows write `0`. `gross = net + 0`, so there is nothing unknown
      // about them, and storing NULL would make them indistinguishable from the 12 empty cells.
      await makeUseCase().execute([row({ fee_amount: '0' })], 'spot', 'kraken-spot');

      expect(saved().feeAmount).toBe('0');
      expect(saved().feeAssetId).toBe('HBAR');
    });

    it('persists an absent fee as absent', async () => {
      await makeUseCase().execute([row({ fee_amount: undefined })], 'spot', 'kraken-spot');

      expect(saved().feeAmount).toBeUndefined();
      expect(saved().feeAssetId).toBeUndefined();
    });

    it('does not report a stated zero as pending, because it needs no convention', async () => {
      const result = await makeUseCase().execute(
        [row({ fee_amount: '0', fee_currency: 'HBAR' })],
        'spot',
        'generic',
      );

      expect(result.pendingFeeReview).toEqual([]);
    });
  });

  describe('the denomination comes from the profile and from nowhere else', () => {
    it('gives a Kraken fee the row\'s own asset, which that profile is the only one to declare', async () => {
      await makeUseCase().execute([row({ fee_amount: '0.005' })], 'spot', 'kraken-spot');

      expect(saved().feeAssetId).toBe('HBAR');
    });

    it('does not fall back to the row\'s asset for a source that names a fee column', async () => {
      // Bitunix declares a fee-currency column. A row that leaves it empty has an unresolved
      // denomination, and quantity-versus-basis turns on it, so it is reported rather than guessed.
      const result = await makeUseCase().execute(
        [row({ fee_amount: '0.005', fee_currency: undefined })],
        'spot',
        'bitunix-spot',
      );

      expect(saved().feeAssetId).toBeUndefined();
      expect(saved().feeAmount).toBeUndefined();
      expect(result.pendingFeeReview).toHaveLength(1);
      expect(result.pendingFeeReview[0].idHash).toBe('hash-fee');
    });
  });

  describe('a fee the source already applied is not applied again', () => {
    it('records the Bitvavo basis the buyer paid, and not that basis plus the fee', async () => {
      // 0.30338 ETH × 1645 = 499.0601, plus a 0.7499 fee, is the 499.81 the row reports as paid.
      // Storing the reported total *and* the fee makes the engine's basis 500.5599.
      await makeUseCase().execute(
        [
          row({
            tx_type: 'buy',
            asset: 'ETH',
            amount: '0.30338',
            asset_out: undefined,
            amount_out: undefined,
            asset_in: 'ETH',
            amount_in: '0.30338',
            price_fiat: '1645',
            total_fiat: '499.81',
            fee_amount: '0.7499',
            fee_currency: 'EUR',
          }),
        ],
        'spot',
        'bitvavo-spot',
      );

      expect(saved().totalFiat).toBe('499.0601');
      expect(saved().feeAmount).toBe('0.7499');
      expect(Number(saved().totalFiat) + Number(saved().feeAmount)).toBe(499.81);
    });

    it('leaves the reported total alone where the fee was charged on top of it', async () => {
      await makeUseCase().execute(
        [
          row({
            tx_type: 'buy',
            asset: 'ADA',
            asset_in: 'ADA',
            amount_in: '546.844684',
            asset_out: undefined,
            amount_out: undefined,
            total_fiat: '300',
            price_fiat: '0.5486',
            fee_amount: '1',
            fee_currency: 'ADA',
          }),
        ],
        'spot',
        'bitunix-spot',
      );

      expect(saved().totalFiat).toBe('300');
      expect(saved().feeAmount).toBe('1');
      expect(saved().feeAssetId).toBe('ADA');
    });

    it('reports a non-zero fee under an unmeasured convention instead of applying one', async () => {
      const result = await makeUseCase().execute(
        [row({ fee_amount: '0.005', fee_currency: 'HBAR' })],
        'spot',
        'generic',
      );

      expect(result.pendingFeeReview).toHaveLength(1);
      expect(result.pendingFeeReview[0].reason).toContain('convention');
      // The movement itself is not lost, and the fee is kept as the source stated it.
      expect(result.persisted).toBe(1);
      expect(saved().feeAmount).toBe('0.005');
    });
  });

  /**
   * The running balance is what established Kraken's convention in the first place, and it is what
   * would catch the exchange changing it. The wizard checks it over the preview; a batch reaching the
   * backend by any other route was checked by nothing.
   */
  describe('a source shipping a running balance is reconciled against it', () => {
    function krakenRow(over: Partial<IngestibleTransaction>): IngestibleTransaction {
      return row({
        tx_type: 'deposit',
        asset: 'HBAR',
        asset_out: undefined,
        amount_out: undefined,
        asset_in: 'HBAR',
        ...over,
      });
    }

    it('verifies every row of a batch whose balances reconcile', async () => {
      const result = await makeUseCase().execute(
        [
          krakenRow({ id_hash: 'k1', amount: '24', amount_in: '24', fee_amount: '0', balance: '24' }),
          krakenRow({
            id_hash: 'k2',
            tx_type: 'withdrawal',
            amount: '-0.006',
            amount_in: undefined,
            asset_in: undefined,
            asset_out: 'HBAR',
            amount_out: '0.006',
            fee_amount: '0.005',
            balance: '23.989',
          }),
        ],
        'spot',
        'kraken-spot',
      );

      expect(result.invariant).toEqual({ kind: 'VERIFIED', rowsChecked: 2 });
    });

    it('reports the offending row when a balance does not reconcile', async () => {
      const result = await makeUseCase().execute(
        [
          krakenRow({ id_hash: 'k1', amount: '24', amount_in: '24', fee_amount: '0', balance: '24' }),
          krakenRow({ id_hash: 'k2', amount: '1', amount_in: '1', fee_amount: '0', balance: '999' }),
        ],
        'spot',
        'kraken-spot',
      );

      expect(result.invariant.kind).toBe('FAILED');
      if (result.invariant.kind !== 'FAILED') return;
      expect(result.invariant.expected).toBe('25');
      expect(result.invariant.actual).toBe('999');
    });

    it('says a source ships no independent redundancy rather than reporting it verified', async () => {
      const result = await makeUseCase().execute(
        [row({ fee_amount: '0.7', fee_currency: 'HBAR' })],
        'spot',
        'bitunix-spot',
      );

      expect(result.invariant).toEqual({ kind: 'NOT_DECLARED' });
    });
  });

  describe('a fee hidden in the gross/net difference is recovered as a quantity', () => {
    it('records the quantity that left the wallet and the fee it paid, not the euro valuation', async () => {
      // Bit2Me writes 2.236429 out and 1.536429 in for one HBAR withdrawal, and prices the fee in
      // euros. The 0.7 HBAR difference is a disposal that nothing recorded before.
      await makeUseCase().execute(
        [
          row({
            tx_type: 'withdrawal',
            asset: undefined,
            amount: undefined,
            asset_out: 'HBAR',
            amount_out: '2.236429',
            asset_in: 'HBAR',
            amount_in: '1.536429',
            fee_amount: '0.210620368',
            fee_currency: 'EUR',
            total_fiat: '0.46',
            price_fiat: '0.3',
          }),
        ],
        'spot',
        'bit2me-spot',
      );

      expect(saved().feeAmount).toBe('0.7');
      expect(saved().feeAssetId).toBe('HBAR');
      // Custody attributes the net to the destination; the gross would overstate the holding there.
      expect(saved().amountOut).toBe('1.536429');
    });
  });

  describe('a futures fee is read under the same model as a spot fee', () => {
    function futuresRow(overrides: Partial<IngestibleTransaction> = {}): IngestibleTransaction {
      return {
        id_hash: 'hash-futures-fee',
        account_id: '10000000-0000-0000-0000-000000000003',
        tx_type: 'futures trade',
        timestamp: '2026-02-08T16:42:52Z',
        symbol: 'usd',
        amount_out: '1.4548',
        realized_pnl: '-1.3922',
        fiat_currency: 'USD',
        metadata: {},
        ...overrides,
      };
    }

    function savedFutures(index = 0) {
      const tx = ledgerPort.saveFuturesTransaction.mock.calls[index][0];
      return { feeAmount: tx.fee_amount?.toString(), feeAssetId: tx.fee_asset_id };
    }

    it('routes a stated futures fee to the collateral currency the profile declares', async () => {
      await makeUseCase().execute(
        [futuresRow({ fee_amount: '0.06260000000' })],
        'futures',
        'kraken-futures',
      );

      expect(savedFutures().feeAmount).toBe('0.0626');
      // Fiat collateral, so this is a cost and not a disposal — a crypto-margined account differs.
      expect(savedFutures().feeAssetId).toBe('usd');
    });

    it('persists an explicit zero futures fee as a zero, denominated by the profile', async () => {
      // 111 real futures rows write `0.00000000000`. Storing NULL would make them indistinguishable
      // from the 680 rows whose fee cell is empty.
      await makeUseCase().execute(
        [
          futuresRow({
            tx_type: 'funding rate change',
            amount_out: undefined,
            amount_in: '0.0073',
            fee_amount: '0.00000000000',
          }),
        ],
        'futures',
        'kraken-futures',
      );

      expect(savedFutures().feeAmount).toBe('0');
      expect(savedFutures().feeAssetId).toBe('usd');
    });

    it('does not fall back to the row\'s own asset when no collateral currency is named', async () => {
      const result = await makeUseCase().execute(
        [
          futuresRow({
            symbol: undefined,
            asset_out: 'XRP',
            fee_amount: '0.06260000000',
          }),
        ],
        'futures',
        'kraken-futures',
      );

      expect(savedFutures().feeAmount).toBeUndefined();
      expect(savedFutures().feeAssetId).toBeUndefined();
      expect(result.pendingFeeReview).toHaveLength(1);
      expect(result.persisted).toBe(1);
    });

    it('does not read the contract symbol for a profile that names a fee-currency column', async () => {
      // The symbol is the collateral currency only where a profile says so. Reading it regardless is
      // the global default one file disproves by mixing denominations inside itself.
      const result = await makeUseCase().execute(
        [futuresRow({ fee_amount: '0.06260000000' })],
        'futures',
        'generic',
      );

      expect(savedFutures().feeAmount).toBeUndefined();
      expect(savedFutures().feeAssetId).toBeUndefined();
      expect(result.pendingFeeReview).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// E2E Tests — Real SQLite with real migration schema (W-3 fix)
// ---------------------------------------------------------------------------

describe('CsvIngestionUseCase — E2E with Real Migration Schema', () => {
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

    await useCase.execute(rows, 'spot', 'generic');

    const saved = await adapter.getSpotTransactions('10000000-0000-0000-0000-000000000002');
    expect(saved).toHaveLength(1);
    expect(saved[0].id_hash).toBe('real-hash-e2e');
    expect(saved[0].asset_in_id).toBe('ETH');
    expect(saved[0].amount_in?.toString()).toBe('10');
    expect(saved[0].tx_type).toBe('BUY');
  });

  it('resolves the wallet designation to a child account under the venue', async () => {
    const venue = '10000000-0000-0000-0000-000000000002';
    const rows: IngestibleTransaction[] = [{
      id_hash: 'hash-earn',
      account_id: venue,
      tx_type: 'staking',
      timestamp: '2023-05-01T10:00:00Z',
      asset_in: 'XRP',
      amount_in: '12',
      total_fiat: '6',
      price_fiat: '0.5',
      metadata: { wallet: 'earn' },
    }];

    await useCase.execute(rows, 'spot', 'generic');

    const child = deriveSubAccountId(venue, 'earn');
    const saved = await adapter.getSpotTransactions(child);
    expect(saved).toHaveLength(1);
    expect(saved[0].account_id).toBe(child);
    expect(await adapter.getSpotTransactions(venue)).toHaveLength(0);

    const accounts = await adapter.getAccounts();
    expect(accounts.find((a) => a.id === child)).toMatchObject({
      parentAccountId: venue,
      isSynthetic: false,
    });
  });

  it('attributes a row with no wallet designation to the venue itself', async () => {
    const venue = '10000000-0000-0000-0000-000000000002';
    const rows: IngestibleTransaction[] = [{
      id_hash: 'hash-no-wallet',
      account_id: venue,
      tx_type: 'buy',
      timestamp: '2023-05-01T10:00:00Z',
      asset_in: 'XRP',
      amount_in: '12',
      total_fiat: '6',
      price_fiat: '0.5',
      metadata: {},
    }];

    await useCase.execute(rows, 'spot', 'generic');

    expect(await adapter.getSpotTransactions(venue)).toHaveLength(1);
    const accounts = await adapter.getAccounts();
    expect(accounts.filter((a) => a.parentAccountId)).toHaveLength(0);
  });

  it('resolves the identical child account when the same file is ingested twice', async () => {
    const venue = '10000000-0000-0000-0000-000000000002';
    const row: IngestibleTransaction = {
      id_hash: 'hash-earn-idem',
      account_id: venue,
      tx_type: 'staking',
      timestamp: '2023-05-01T10:00:00Z',
      asset_in: 'XRP',
      amount_in: '12',
      total_fiat: '6',
      price_fiat: '0.5',
      metadata: { wallet: 'spot / main' },
    };

    await useCase.execute([row], 'spot', 'generic');
    await useCase.execute([row], 'spot', 'generic');

    const accounts = await adapter.getAccounts();
    const children = accounts.filter((a) => a.parentAccountId === venue);
    expect(children).toHaveLength(1);
    expect(children[0].id).toBe(deriveSubAccountId(venue, 'spot'));
    expect(await adapter.getSpotTransactions(children[0].id)).toHaveLength(1);
  });

  it('persists the fiat classification of every asset it resolves', async () => {
    const rows: IngestibleTransaction[] = [{
      id_hash: 'hash-is-fiat',
      account_id: '10000000-0000-0000-0000-000000000002',
      tx_type: 'buy',
      timestamp: '2023-05-01T10:00:00Z',
      asset_in: 'BTC',
      amount_in: '0.1',
      asset_out: 'EUR',
      amount_out: '3000',
      fee_currency: 'USDT',
      fee_amount: '1',
      total_fiat: '3000',
      price_fiat: '30000',
      metadata: {},
    }];

    await useCase.execute(rows, 'spot', 'generic');

    const rowsOut = db
      .prepare("SELECT id, is_fiat FROM assets WHERE id IN ('BTC', 'EUR', 'USDT') ORDER BY id")
      .all() as { id: string; is_fiat: number }[];

    // USDT is a stablecoin, not a unit of account: it is a tracked holding with a cost basis.
    expect(rowsOut).toEqual([
      { id: 'BTC', is_fiat: 0 },
      { id: 'EUR', is_fiat: 1 },
      { id: 'USDT', is_fiat: 0 },
    ]);
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

    await useCase.execute([row], 'spot', 'generic');
    await useCase.execute([row], 'spot', 'generic'); // duplicate

    const saved = await adapter.getSpotTransactions('10000000-0000-0000-0000-000000000002');
    expect(saved).toHaveLength(1);
  });
});
