import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InitializeLedgerUseCase } from '../InitializeLedgerUseCase.js';
import type { ILedgerPort, LedgerInitializationSummary } from '../../../domain/ports/ILedgerPort.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';

/**
 * The ledger and the settings live in two different SQLite files, so a ledger migration cannot
 * mark its own output as stale — the flag it would have to write is in the other database. This
 * use case is the only place that bridges them.
 */

const RECALC_KEY = 'needs_recalculation';

class SettingsStub implements IUserSettingsPort {
  private readonly values = new Map<string, string>();
  public readonly writes: Array<{ key: string; value: string }> = [];

  async getSetting(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.values.set(key, value);
    this.writes.push({ key, value });
  }
}

const ledgerStub = (
  init: () => Promise<LedgerInitializationSummary>
): ILedgerPort => ({ initialize: init } as unknown as ILedgerPort);

describe('InitializeLedgerUseCase', () => {
  let settings: SettingsStub;

  beforeEach(() => {
    settings = new SettingsStub();
  });

  it('flags recalculation as pending when a migration was applied', async () => {
    const ledger = ledgerStub(async () => ({
      appliedMigrations: ['004_fifo_traceability.sql'],
    }));

    const result = await new InitializeLedgerUseCase(ledger, settings).execute();

    expect(await settings.getSetting(RECALC_KEY)).toBe('true');
    expect(result.derivedDataInvalidated).toBe(true);
    expect(result.appliedMigrations).toEqual(['004_fifo_traceability.sql']);
  });

  it('leaves the flag untouched when the schema was already up to date', async () => {
    // Setting it unconditionally would force a full rebuild on every single restart.
    const ledger = ledgerStub(async () => ({ appliedMigrations: [] }));
    await settings.setSetting(RECALC_KEY, 'false');
    settings.writes.length = 0;

    const result = await new InitializeLedgerUseCase(ledger, settings).execute();

    expect(await settings.getSetting(RECALC_KEY)).toBe('false');
    expect(settings.writes).toEqual([]);
    expect(result.derivedDataInvalidated).toBe(false);
  });

  it('does not clear a flag another component already set', async () => {
    const ledger = ledgerStub(async () => ({ appliedMigrations: [] }));
    await settings.setSetting(RECALC_KEY, 'true');

    await new InitializeLedgerUseCase(ledger, settings).execute();

    expect(await settings.getSetting(RECALC_KEY)).toBe('true');
  });

  it('flags recalculation and rethrows when a migration fails halfway', async () => {
    // A partially applied migration leaves the derived tables unreliable, so the flag has to
    // survive the failure or the next successful boot would trust stale rows.
    const boom = new Error('near "SELCT": syntax error');
    const ledger = ledgerStub(async () => {
      throw boom;
    });

    await expect(new InitializeLedgerUseCase(ledger, settings).execute()).rejects.toThrow(boom);
    expect(await settings.getSetting(RECALC_KEY)).toBe('true');
  });

  it('reports every applied migration, not just the last one', async () => {
    const ledger = ledgerStub(async () => ({
      appliedMigrations: ['003_currency_schema.sql', '004_fifo_traceability.sql'],
    }));

    const result = await new InitializeLedgerUseCase(ledger, settings).execute();

    expect(result.appliedMigrations).toHaveLength(2);
  });

  it('writes the flag to the settings port and never to the ledger', async () => {
    const initialize = vi.fn(async () => ({ appliedMigrations: ['004_fifo_traceability.sql'] }));
    const ledger = { initialize } as unknown as ILedgerPort;

    await new InitializeLedgerUseCase(ledger, settings).execute();

    expect(initialize).toHaveBeenCalledOnce();
    expect(settings.writes).toEqual([{ key: RECALC_KEY, value: 'true' }]);
  });
});
