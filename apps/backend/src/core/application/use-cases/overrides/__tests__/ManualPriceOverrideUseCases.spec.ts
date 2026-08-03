/**
 * Manual price overrides at the use-case level: what is written, in which order, and how many
 * rebuilds it costs.
 *
 * The effect of an override on a derived figure belongs to the engine and is asserted against the
 * real DuckDB chain in `OverrideMaterialization.spec.ts`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTransactionIdHash } from '@kryptofolio/shared-types';
import { SetManualPriceOverrideUseCase } from '../SetManualPriceOverrideUseCase.js';
import { RemoveManualPriceOverrideUseCase } from '../RemoveManualPriceOverrideUseCase.js';
import { OverrideValidationError } from '../OverrideMutation.js';
import type {
  ILedgerPort,
  LedgerManualPriceOverride,
} from '../../../../domain/ports/ILedgerPort.js';
import type {
  FifoMaterializerService,
  MaterializationSummary,
} from '../../../services/FifoMaterializerService.js';
import type { IUserSettingsPort } from '../../../../domain/ports/IUserSettingsPort.js';
import { toPreciseAmount } from '../../../../domain/value-objects/PreciseAmount.js';

const EMPTY_RECONCILIATION = { inserted: 0, updated: 0, retired: 0, reactivated: 0 } as const;

const SUMMARY: MaterializationSummary = {
  taxLots: { ...EMPTY_RECONCILIATION, updated: 1 },
  lotHistoryEvents: { ...EMPTY_RECONCILIATION },
  custodyEntries: { ...EMPTY_RECONCILIATION },
  flagged: 0,
  pendingReview: 0,
};

class SettingsStub implements IUserSettingsPort {
  private readonly values = new Map<string, string>();
  async getSetting(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async setSetting(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

interface Harness {
  ledger: ILedgerPort;
  materializer: FifoMaterializerService;
  settings: SettingsStub;
  calls: string[];
  written: LedgerManualPriceOverride[];
  removed: string[];
  recalculate: ReturnType<typeof vi.fn>;
}

function harness(recalculateOutcome: MaterializationSummary | Error = SUMMARY): Harness {
  const calls: string[] = [];
  const written: LedgerManualPriceOverride[] = [];
  const removed: string[] = [];

  const recalculate = vi.fn(async () => {
    calls.push('recalculate');
    if (recalculateOutcome instanceof Error) throw recalculateOutcome;
    return recalculateOutcome;
  });

  // A partial double: the port has 20 methods and this use case reaches four of them. Naming the
  // whole surface would hide which four.
  const ledger = {
    runInTransaction: async <T>(work: () => Promise<T>): Promise<T> => {
      calls.push('begin');
      const result = await work();
      calls.push('commit');
      return result;
    },
    setManualPriceOverride: async (override: LedgerManualPriceOverride) => {
      calls.push('set');
      written.push(override);
    },
    removeManualPriceOverride: async (idHash: string) => {
      calls.push('remove');
      removed.push(idHash);
    },
  } as unknown as ILedgerPort;

  return {
    ledger,
    materializer: { recalculate } as unknown as FifoMaterializerService,
    settings: new SettingsStub(),
    calls,
    written,
    removed,
    recalculate,
  };
}

const price = (idHash: string, value: string, currency = 'EUR') => ({
  idHash: createTransactionIdHash(idHash),
  priceFiat: toPreciseAmount(value),
  fiatCurrency: currency,
});

describe('SetManualPriceOverrideUseCase', () => {
  let h: Harness;

  beforeEach(() => {
    h = harness();
  });

  const useCase = (given: Harness = h) =>
    new SetManualPriceOverrideUseCase(given.ledger, given.materializer, given.settings);

  it('writes the declared value with its currency and rebuilds once', async () => {
    const result = await useCase().execute([price('hash-staking', '0.42')]);

    expect(h.written).toEqual([
      { id_hash: 'hash-staking', price_fiat: '0.42', fiat_currency: 'EUR', note: undefined },
    ]);
    expect(h.recalculate).toHaveBeenCalledOnce();
    expect(result.applied).toBe(1);
    expect(result.materialization).toEqual(SUMMARY);
  });

  it('rebuilds once for a batch of several overrides', async () => {
    await useCase().execute([
      price('hash-a', '0.42'),
      price('hash-b', '1.15'),
      price('hash-c', '9.99'),
    ]);

    expect(h.written).toHaveLength(3);
    expect(h.recalculate).toHaveBeenCalledOnce();
  });

  it('commits the override before the rebuild reads it', async () => {
    // The rebuild opens its own transaction; nesting one inside the other would either deadlock the
    // writer or let the rebuild read a value that a later rollback removes.
    await useCase().execute([price('hash-a', '0.42')]);

    expect(h.calls).toEqual(['begin', 'set', 'commit', 'recalculate']);
  });

  it('runs the rebuild forced, so a cleared pending marker cannot skip it', async () => {
    await h.settings.setSetting('needs_recalculation', 'false');

    await useCase().execute([price('hash-a', '0.42')]);

    expect(h.recalculate).toHaveBeenCalledWith(true);
  });

  it('leaves recalculation pending when the rebuild fails, and keeps the override', async () => {
    const failing = harness(new Error('Catalog Error: v_calculated_tax_lots'));

    await expect(useCase(failing).execute([price('hash-a', '0.42')])).rejects.toThrow(
      /v_calculated_tax_lots/,
    );

    expect(failing.written).toHaveLength(1);
    expect(await failing.settings.getSetting('needs_recalculation')).toBe('true');
  });

  it('rejects a declared value with no currency, writing nothing', async () => {
    await expect(
      useCase().execute([
        { idHash: createTransactionIdHash('hash-a'), priceFiat: toPreciseAmount('0.42'), fiatCurrency: '' },
      ]),
    ).rejects.toThrow(OverrideValidationError);

    expect(h.written).toEqual([]);
    expect(h.recalculate).not.toHaveBeenCalled();
  });

  it('rejects the whole batch when one entry is invalid', async () => {
    await expect(
      useCase().execute([
        price('hash-a', '0.42'),
        { idHash: createTransactionIdHash('hash-b'), priceFiat: toPreciseAmount('1'), fiatCurrency: '' },
      ]),
    ).rejects.toThrow(OverrideValidationError);

    expect(h.written).toEqual([]);
  });

  it('does not rebuild for an empty batch', async () => {
    const result = await useCase().execute([]);

    expect(h.recalculate).not.toHaveBeenCalled();
    expect(result.applied).toBe(0);
    expect(result.materialization).toBeNull();
  });

  it('carries the declared value digit for digit, never through a float', async () => {
    await useCase().execute([price('hash-a', '0.123456789012345678')]);

    expect(h.written[0].price_fiat).toBe('0.123456789012345678');
  });

  it('records the note alongside the value', async () => {
    await useCase().execute([{ ...price('hash-a', '0.42'), note: 'AEAT closing price' }]);

    expect(h.written[0].note).toBe('AEAT closing price');
  });
});

describe('RemoveManualPriceOverrideUseCase', () => {
  let h: Harness;

  beforeEach(() => {
    h = harness();
  });

  const useCase = (given: Harness = h) =>
    new RemoveManualPriceOverrideUseCase(given.ledger, given.materializer, given.settings);

  it('removes the override and rebuilds so the derived value reverts', async () => {
    const result = await useCase().execute([createTransactionIdHash('hash-staking')]);

    expect(h.removed).toEqual(['hash-staking']);
    expect(h.recalculate).toHaveBeenCalledOnce();
    expect(result.applied).toBe(1);
  });

  it('removes a batch with a single rebuild, committing before it', async () => {
    await useCase().execute([
      createTransactionIdHash('hash-a'),
      createTransactionIdHash('hash-b'),
    ]);

    expect(h.calls).toEqual(['begin', 'remove', 'remove', 'commit', 'recalculate']);
  });

  it('does not rebuild when asked to remove nothing', async () => {
    await useCase().execute([]);

    expect(h.recalculate).not.toHaveBeenCalled();
  });
});
