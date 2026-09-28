/**
 * `SetSpotTransactionOverrideUseCase`/`RemoveSpotTransactionOverrideUseCase` at the use-case level
 * (design.md D8, D4, D6). Doubled ports — the real-engine equivalents belong to
 * `OverrideMaterialization.spec.ts` (restored once this class exists) and group 12's D3 regression
 * pin.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTransactionIdHash } from '@kryptofolio/shared-types';
import {
  SetSpotTransactionOverrideUseCase,
  type SpotTransactionOverrideEditInput,
} from '../SetSpotTransactionOverrideUseCase.js';
import { RemoveSpotTransactionOverrideUseCase } from '../RemoveSpotTransactionOverrideUseCase.js';
import { OverrideValidationError, OverrideNotFoundError } from '../OverrideMutation.js';
import type {
  ILedgerPort,
  LedgerSpotTransaction,
  LedgerSpotTransactionOverride,
} from '../../../../domain/ports/ILedgerPort.js';
import type { ITaxCalculatorPort, FifoDataQualityRow } from '../../../../domain/ports/ITaxCalculatorPort.js';
import type { MaterializationSummary } from '../../../services/FifoMaterializerService.js';
import type { IUserSettingsPort } from '../../../../domain/ports/IUserSettingsPort.js';
import type { FifoChainFreshnessService } from '../../../services/FifoChainFreshnessService.js';
import type { FifoBuildId } from '../../../../domain/models/FifoChainState.js';
import { toPreciseAmount } from '../../../../domain/value-objects/PreciseAmount.js';

const EMPTY_RECONCILIATION = { inserted: 0, updated: 0, retired: 0, reactivated: 0 } as const;

const SUMMARY: MaterializationSummary = {
  taxLots: { ...EMPTY_RECONCILIATION, updated: 1 },
  lotHistoryEvents: { ...EMPTY_RECONCILIATION },
  custodyEntries: { ...EMPTY_RECONCILIATION },
  flagged: 0,
  pendingReview: 0,
};

const KRAKEN = 'acc-kraken';
const BUY_HASH = 'hash-buy';
const TRANSFER_HASH = 'hash-transfer-out';

class SettingsStub implements IUserSettingsPort {
  private readonly values = new Map<string, string>();
  async getSetting(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async setSetting(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

function buyTransaction(): LedgerSpotTransaction {
  return {
    id: 'id-buy',
    id_hash: BUY_HASH,
    account_id: KRAKEN,
    tx_type: 'BUY',
    asset_in_id: 'BTC',
    amount_in: toPreciseAmount('0.1'),
    asset_out_id: 'EUR',
    amount_out: toPreciseAmount('4000'),
    fee_asset_id: 'EUR',
    fee_amount: toPreciseAmount('1'),
    total_fiat: toPreciseAmount('4000'),
    price_fiat: toPreciseAmount('40000'),
    fiat_currency: 'EUR',
    timestamp: '2026-01-04T10:00:00.000Z',
    status: 'COMPLETED',
  };
}

function transferOutTransaction(): LedgerSpotTransaction {
  return {
    id: 'id-transfer',
    id_hash: TRANSFER_HASH,
    account_id: KRAKEN,
    tx_type: 'TRANSFER_OUT',
    asset_out_id: 'BTC',
    amount_out: toPreciseAmount('0.05'),
    total_fiat: toPreciseAmount('0'),
    price_fiat: toPreciseAmount('0'),
    fiat_currency: 'EUR',
    transfer_group_id: 'tg-1',
    timestamp: '2026-01-05T10:00:00.000Z',
    status: 'COMPLETED',
  };
}

function unchangedInput(idHash: string): SpotTransactionOverrideEditInput {
  return {
    idHash: createTransactionIdHash(idHash),
    amountIn: { kind: 'UNCHANGED' },
    amountOut: { kind: 'UNCHANGED' },
    priceFiat: { kind: 'UNCHANGED' },
    totalFiat: { kind: 'UNCHANGED' },
    fee: { kind: 'UNCHANGED' },
    timestamp: { kind: 'UNCHANGED' },
    txType: { kind: 'UNCHANGED' },
  };
}

interface Harness {
  ledger: ILedgerPort;
  taxCalculator: ITaxCalculatorPort;
  freshnessService: FifoChainFreshnessService;
  settings: SettingsStub;
  calls: string[];
  written: LedgerSpotTransactionOverride[];
  removed: string[];
  recalculate: ReturnType<typeof vi.fn>;
  dataQualityRows: FifoDataQualityRow[];
}

function harness(
  transactions: LedgerSpotTransaction[],
  existingOverrides: Readonly<Record<string, LedgerSpotTransactionOverride>> = {},
): Harness {
  const calls: string[] = [];
  const written: LedgerSpotTransactionOverride[] = [];
  const removed: string[] = [];
  let dataQualityRows: FifoDataQualityRow[] = [];

  const recalculate = vi.fn(async () => {
    calls.push('recalculate');
    return SUMMARY;
  });

  const ledger = {
    runInTransaction: async <T>(work: () => Promise<T>): Promise<T> => {
      calls.push('begin');
      const result = await work();
      calls.push('commit');
      return result;
    },
    getSpotTransactions: async () => {
      calls.push('getSpotTransactions');
      return transactions;
    },
    getSpotTransactionOverride: async (idHash: string) => {
      calls.push('getSpotTransactionOverride');
      return existingOverrides[idHash];
    },
    setSpotTransactionOverride: async (override: LedgerSpotTransactionOverride) => {
      calls.push('set');
      written.push(override);
    },
    removeSpotTransactionOverride: async (idHash: string) => {
      calls.push('remove');
      removed.push(idHash);
      return { count: idHash in existingOverrides ? 1 : 0 };
    },
  } as unknown as ILedgerPort;

  const taxCalculator = {
    getDataQuality: async () => {
      calls.push('getDataQuality');
      return dataQualityRows;
    },
  } as unknown as ITaxCalculatorPort;

  const freshnessService = {
    refresh: async () => {
      const materialization = await recalculate();
      return {
        chain: {
          kind: 'fresh' as const,
          buildId: 'test-build' as FifoBuildId,
          builtAt: new Date().toISOString(),
        },
        materialization,
      };
    },
  } as unknown as FifoChainFreshnessService;

  return {
    ledger,
    taxCalculator,
    freshnessService,
    settings: new SettingsStub(),
    calls,
    written,
    removed,
    recalculate,
    get dataQualityRows() {
      return dataQualityRows;
    },
    set dataQualityRows(rows: FifoDataQualityRow[]) {
      dataQualityRows = rows;
    },
  };
}

describe('SetSpotTransactionOverrideUseCase', () => {
  let h: Harness;

  beforeEach(() => {
    h = harness([buyTransaction(), transferOutTransaction()]);
  });

  const useCase = () =>
    new SetSpotTransactionOverrideUseCase(h.ledger, h.settings, h.freshnessService, h.taxCalculator);

  it('rejects an edit that fails canRetype, without writing anything', async () => {
    const input: SpotTransactionOverrideEditInput = {
      ...unchangedInput(TRANSFER_HASH),
      txType: { kind: 'SET', value: 'SELL' },
    };

    await expect(useCase().execute(input)).rejects.toThrow(OverrideValidationError);
    expect(h.written).toEqual([]);
    expect(h.recalculate).not.toHaveBeenCalled();
  });

  it('rejects an all-UNCHANGED payload, pointing at Restore, before any rebuild', async () => {
    await expect(useCase().execute(unchangedInput(BUY_HASH))).rejects.toThrow(OverrideValidationError);
    await expect(useCase().execute(unchangedInput(BUY_HASH))).rejects.toThrow(/restore/i);
    expect(h.written).toEqual([]);
    expect(h.recalculate).not.toHaveBeenCalled();
  });

  it('rejects an id_hash with no matching spot transaction (404-mapped)', async () => {
    const input: SpotTransactionOverrideEditInput = {
      ...unchangedInput('hash-does-not-exist'),
      priceFiat: { kind: 'SET', value: toPreciseAmount('1'), fiatCurrency: 'EUR' },
    };

    await expect(useCase().execute(input)).rejects.toThrow(OverrideNotFoundError);
    expect(h.written).toEqual([]);
  });

  it('applies a valid edit: writes inside runInTransaction, then refreshes outside it', async () => {
    const input: SpotTransactionOverrideEditInput = {
      ...unchangedInput(BUY_HASH),
      priceFiat: { kind: 'SET', value: toPreciseAmount('42000'), fiatCurrency: 'EUR' },
    };

    const result = await useCase().execute(input);

    expect(h.calls).toEqual([
      'getSpotTransactions',
      'getDataQuality',
      'getSpotTransactionOverride',
      'begin',
      'set',
      'commit',
      'recalculate',
      'getDataQuality',
    ]);
    expect(result.applied).toBe(1);
    expect(h.written[0]?.price_edited).toBe(true);
    expect(h.written[0]?.price_fiat).toBe('42000');
  });

  it('real defect found by the user: editing total_fiat alone must not silently wipe a price override set in an earlier save', async () => {
    // `setSpotTransactionOverride` does a full-replacement PUT (design.md D2/9.3's own comment),
    // not a per-field merge — so building the new row purely from THIS payload, with no awareness
    // of the row that already exists for this id_hash, means every "UNCHANGED" field silently
    // resets to "no override" instead of "leave whatever is already there alone".
    h = harness([buyTransaction()], {
      [BUY_HASH]: {
        id_hash: BUY_HASH,
        amount_in_edited: false,
        amount_in: null,
        amount_out_edited: false,
        amount_out: null,
        price_edited: true,
        price_fiat: toPreciseAmount('42000'),
        fiat_currency: 'EUR',
        total_fiat_edited: false,
        total_fiat: null,
        fee_kind: 'UNCHANGED',
        fee_amount: null,
        fee_asset_id: null,
        timestamp_edited: false,
        timestamp: null,
        tx_type_edited: false,
        tx_type: null,
      },
    });

    const input: SpotTransactionOverrideEditInput = {
      ...unchangedInput(BUY_HASH),
      totalFiat: { kind: 'SET', value: toPreciseAmount('4200') },
    };

    await useCase().execute(input);

    expect(h.calls).toContain('getSpotTransactionOverride');
    expect(h.written[0]?.total_fiat_edited).toBe(true);
    expect(h.written[0]?.total_fiat).toBe('4200');
    // The bug: without merging, this would come back false/null even though the price override
    // was never touched by this save.
    expect(h.written[0]?.price_edited).toBe(true);
    expect(h.written[0]?.price_fiat).toBe('42000');
    expect(h.written[0]?.fiat_currency).toBe('EUR');
  });

  it('the same merge applies symmetrically: editing price alone must not wipe a total override set earlier', async () => {
    h = harness([buyTransaction()], {
      [BUY_HASH]: {
        id_hash: BUY_HASH,
        amount_in_edited: false,
        amount_in: null,
        amount_out_edited: false,
        amount_out: null,
        price_edited: false,
        price_fiat: null,
        fiat_currency: null,
        total_fiat_edited: true,
        total_fiat: toPreciseAmount('4200'),
        fee_kind: 'UNCHANGED',
        fee_amount: null,
        fee_asset_id: null,
        timestamp_edited: false,
        timestamp: null,
        tx_type_edited: false,
        tx_type: null,
      },
    });

    const input: SpotTransactionOverrideEditInput = {
      ...unchangedInput(BUY_HASH),
      priceFiat: { kind: 'SET', value: toPreciseAmount('42000'), fiatCurrency: 'EUR' },
    };

    await useCase().execute(input);

    expect(h.written[0]?.price_edited).toBe(true);
    expect(h.written[0]?.price_fiat).toBe('42000');
    expect(h.written[0]?.total_fiat_edited).toBe(true);
    expect(h.written[0]?.total_fiat).toBe('4200');
  });

  it('with no pre-existing override, an untouched field still defaults to no-override (not a false merge target)', async () => {
    const input: SpotTransactionOverrideEditInput = {
      ...unchangedInput(BUY_HASH),
      priceFiat: { kind: 'SET', value: toPreciseAmount('42000'), fiatCurrency: 'EUR' },
    };

    await useCase().execute(input);

    expect(h.written[0]?.total_fiat_edited).toBe(false);
    expect(h.written[0]?.total_fiat).toBe(null);
  });

  it('D6: reports NEGATIVE_BALANCE only for pairs newly flagged after the edit', async () => {
    // Before: BTC/acc-kraken is clean. After the (simulated) edit, DuckDB would report it flagged —
    // this harness fakes that by returning the flagged row only after the first getDataQuality call.
    let call = 0;
    h.taxCalculator = {
      getDataQuality: async () => {
        h.calls.push('getDataQuality');
        call += 1;
        if (call === 1) return [];
        return [
          {
            quality_flag: 'UNTRACKED_INFLOW',
            severity: 'high',
            asset_id: 'BTC',
            account_id: KRAKEN,
            tx_id: null,
            occurred_at: null,
            detail_key: 'fifo_quality.untracked_inflow',
            pending_review: true,
          },
        ];
      },
    } as unknown as ITaxCalculatorPort;

    const input: SpotTransactionOverrideEditInput = {
      ...unchangedInput(BUY_HASH),
      amountIn: { kind: 'SET', value: toPreciseAmount('0.001') },
    };

    const result = await useCase().execute(input);

    expect(result.balanceCheck).toEqual({
      kind: 'NEGATIVE_BALANCE',
      entries: [{ assetId: 'BTC', accountId: KRAKEN, balance: expect.any(String), tolerance: expect.any(String) }],
    });
  });

  it('D6: a pre-existing UNTRACKED_INFLOW flag unaffected by the edit is excluded from the warning', async () => {
    // BTC IS one of this edit's affected assets (asset_in_id on the BUY row), and stays flagged
    // both before and after — this is what actually exercises the before/after diff, unlike an
    // asset outside the edit's affected set, which the asset-scoping filter alone would exclude.
    const preExisting: FifoDataQualityRow = {
      quality_flag: 'UNTRACKED_INFLOW',
      severity: 'high',
      asset_id: 'BTC',
      account_id: KRAKEN,
      tx_id: null,
      occurred_at: null,
      detail_key: 'fifo_quality.untracked_inflow',
      pending_review: true,
    };
    h.taxCalculator = {
      getDataQuality: async () => {
        h.calls.push('getDataQuality');
        return [preExisting];
      },
    } as unknown as ITaxCalculatorPort;

    const input: SpotTransactionOverrideEditInput = {
      ...unchangedInput(BUY_HASH),
      priceFiat: { kind: 'SET', value: toPreciseAmount('41000'), fiatCurrency: 'EUR' },
    };

    const result = await new SetSpotTransactionOverrideUseCase(
      h.ledger,
      h.settings,
      h.freshnessService,
      h.taxCalculator,
    ).execute(input);

    expect(result.balanceCheck).toEqual({ kind: 'CLEAN' });
  });
});

describe('RemoveSpotTransactionOverrideUseCase', () => {
  let h: Harness;

  beforeEach(() => {
    h = harness([buyTransaction()], { [BUY_HASH]: { id_hash: BUY_HASH } as LedgerSpotTransactionOverride });
  });

  const useCase = () =>
    new RemoveSpotTransactionOverrideUseCase(h.ledger, h.settings, h.freshnessService);

  it('removes the override and rebuilds', async () => {
    const result = await useCase().execute(createTransactionIdHash(BUY_HASH));

    expect(h.removed).toEqual([BUY_HASH]);
    expect(result.applied).toBe(1);
    expect(h.recalculate).toHaveBeenCalledOnce();
  });

  it('on a hash with no active override, returns applied: 0 and does not rebuild', async () => {
    const result = await useCase().execute(createTransactionIdHash('hash-not-active'));

    expect(result.applied).toBe(0);
    expect(h.recalculate).not.toHaveBeenCalled();
  });
});
