/**
 * Transfer-destination overrides at the use-case level.
 *
 * The two rejections are the point of this file: a counterparty the ledger does not know, and a
 * counterparty that is the movement's own account. Both would otherwise reach SQLite as a foreign
 * key failure or a trigger abort — correct outcomes, but with no room for a message the user can act
 * on, and only after the batch had already begun writing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createAccountId, createTransactionIdHash } from '@kryptofolio/shared-types';
import { SetTransferDestinationUseCase } from '../SetTransferDestinationUseCase.js';
import { RemoveTransferDestinationUseCase } from '../RemoveTransferDestinationUseCase.js';
import { OverrideValidationError } from '../OverrideMutation.js';
import type {
  ILedgerPort,
  LedgerSpotTransaction,
  LedgerTransferDestinationOverride,
} from '../../../../domain/ports/ILedgerPort.js';
import type {
  FifoMaterializerService,
  MaterializationSummary,
} from '../../../services/FifoMaterializerService.js';
import type { IUserSettingsPort } from '../../../../domain/ports/IUserSettingsPort.js';
import { toPreciseAmount } from '../../../../domain/value-objects/PreciseAmount.js';

const EMPTY_RECONCILIATION = { inserted: 0, updated: 0, retired: 0, reactivated: 0 } as const;

const SUMMARY: MaterializationSummary = {
  taxLots: { ...EMPTY_RECONCILIATION },
  lotHistoryEvents: { ...EMPTY_RECONCILIATION },
  custodyEntries: { ...EMPTY_RECONCILIATION, updated: 2 },
  flagged: 0,
  pendingReview: 0,
};

const KRAKEN = 'acc-kraken';
const LEDGER_WALLET = 'acc-ledger';
const WITHDRAWAL_HASH = 'hash-withdrawal';

class SettingsStub implements IUserSettingsPort {
  private readonly values = new Map<string, string>();
  async getSetting(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async setSetting(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

function spotTransaction(idHash: string, accountId: string): LedgerSpotTransaction {
  return {
    id: `id-${idHash}`,
    id_hash: idHash,
    account_id: accountId,
    tx_type: 'WITHDRAWAL',
    asset_out_id: 'XRP',
    amount_out: toPreciseAmount('179.11'),
    total_fiat: toPreciseAmount('0'),
    price_fiat: toPreciseAmount('0'),
    fiat_currency: 'EUR',
    timestamp: '2026-01-04T10:00:00.000Z',
    status: 'COMPLETED',
  };
}

interface Harness {
  ledger: ILedgerPort;
  materializer: FifoMaterializerService;
  settings: SettingsStub;
  calls: string[];
  written: LedgerTransferDestinationOverride[];
  removed: string[];
  recalculate: ReturnType<typeof vi.fn>;
}

function harness(): Harness {
  const calls: string[] = [];
  const written: LedgerTransferDestinationOverride[] = [];
  const removed: string[] = [];

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
    getAccounts: async () => {
      calls.push('getAccounts');
      return [
        { id: KRAKEN, name: 'Kraken', type: 'exchange', isSynthetic: false },
        { id: LEDGER_WALLET, name: 'Ledger', type: 'wallet', isSynthetic: false },
      ];
    },
    getSpotTransactions: async () => {
      calls.push('getSpotTransactions');
      return [spotTransaction(WITHDRAWAL_HASH, KRAKEN)];
    },
    setTransferDestinationOverride: async (override: LedgerTransferDestinationOverride) => {
      calls.push('set');
      written.push(override);
    },
    removeTransferDestinationOverride: async (idHash: string) => {
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

describe('SetTransferDestinationUseCase', () => {
  let h: Harness;

  beforeEach(() => {
    h = harness();
  });

  const useCase = () => new SetTransferDestinationUseCase(h.ledger, h.materializer, h.settings);

  const destination = (idHash: string, accountId: string) => ({
    idHash: createTransactionIdHash(idHash),
    counterpartyAccountId: createAccountId(accountId),
  });

  it('records the declared counterparty and rebuilds once', async () => {
    const result = await useCase().execute([destination(WITHDRAWAL_HASH, LEDGER_WALLET)]);

    expect(h.written).toEqual([
      { id_hash: WITHDRAWAL_HASH, counterparty_account_id: LEDGER_WALLET, note: undefined },
    ]);
    expect(h.recalculate).toHaveBeenCalledOnce();
    expect(result.applied).toBe(1);
  });

  it('commits before the rebuild', async () => {
    await useCase().execute([destination(WITHDRAWAL_HASH, LEDGER_WALLET)]);

    expect(h.calls.slice(-3)).toEqual(['set', 'commit', 'recalculate']);
  });

  it('rejects a counterparty the ledger does not know, before writing anything', async () => {
    await expect(
      useCase().execute([destination(WITHDRAWAL_HASH, 'acc-nonexistent')]),
    ).rejects.toThrow(OverrideValidationError);

    expect(h.written).toEqual([]);
    expect(h.recalculate).not.toHaveBeenCalled();
  });

  it('names the unknown account in the error', async () => {
    await expect(
      useCase().execute([destination(WITHDRAWAL_HASH, 'acc-nonexistent')]),
    ).rejects.toThrow(/acc-nonexistent/);
  });

  it("rejects a counterparty equal to the movement's own account", async () => {
    await expect(useCase().execute([destination(WITHDRAWAL_HASH, KRAKEN)])).rejects.toThrow(
      OverrideValidationError,
    );

    expect(h.written).toEqual([]);
  });

  it('rejects the whole batch when one entry is invalid', async () => {
    await expect(
      useCase().execute([
        destination(WITHDRAWAL_HASH, LEDGER_WALLET),
        destination(WITHDRAWAL_HASH, KRAKEN),
      ]),
    ).rejects.toThrow(OverrideValidationError);

    expect(h.written).toEqual([]);
  });

  it('rebuilds once for a valid batch', async () => {
    await useCase().execute([
      destination(WITHDRAWAL_HASH, LEDGER_WALLET),
      { ...destination(WITHDRAWAL_HASH, LEDGER_WALLET), note: 'cold storage' },
    ]);

    expect(h.written).toHaveLength(2);
    expect(h.recalculate).toHaveBeenCalledOnce();
  });

  it('does not rebuild for an empty batch', async () => {
    await useCase().execute([]);

    expect(h.recalculate).not.toHaveBeenCalled();
  });
});

describe('RemoveTransferDestinationUseCase', () => {
  let h: Harness;

  beforeEach(() => {
    h = harness();
  });

  it('removes the override and rebuilds so the synthetic counterparty returns', async () => {
    const result = await new RemoveTransferDestinationUseCase(
      h.ledger,
      h.materializer,
      h.settings,
    ).execute([createTransactionIdHash(WITHDRAWAL_HASH)]);

    expect(h.removed).toEqual([WITHDRAWAL_HASH]);
    expect(h.calls).toEqual(['begin', 'remove', 'commit', 'recalculate']);
    expect(result.applied).toBe(1);
  });

  it('does not rebuild when asked to remove nothing', async () => {
    await new RemoveTransferDestinationUseCase(h.ledger, h.materializer, h.settings).execute([]);

    expect(h.recalculate).not.toHaveBeenCalled();
  });
});
