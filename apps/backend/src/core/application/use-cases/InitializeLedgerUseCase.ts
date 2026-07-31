import type { ILedgerPort } from '../../domain/ports/ILedgerPort.js';
import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort.js';

const NEEDS_RECALCULATION = 'needs_recalculation';

export interface LedgerStartupSummary {
  readonly appliedMigrations: readonly string[];
  /** True when the derived tables can no longer be trusted and a rebuild is owed. */
  readonly derivedDataInvalidated: boolean;
}

/**
 * Brings the ledger schema up to date and records whether that invalidated the derived tables.
 *
 * The two facts live in different databases — the schema in the ledger, the pending-work flag in
 * the settings store — so no single adapter can observe one and act on the other. Composing the
 * two ports here is what keeps the flag reachable by the code that reads it.
 */
export class InitializeLedgerUseCase {
  private readonly ledgerPort: ILedgerPort;
  private readonly userSettingsPort: IUserSettingsPort;

  constructor(ledgerPort: ILedgerPort, userSettingsPort: IUserSettingsPort) {
    this.ledgerPort = ledgerPort;
    this.userSettingsPort = userSettingsPort;
  }

  async execute(): Promise<LedgerStartupSummary> {
    let appliedMigrations: readonly string[];

    try {
      ({ appliedMigrations } = await this.ledgerPort.initialize());
    } catch (error) {
      // A migration that failed partway leaves the schema in an unknown state, so the derived
      // tables are suspect whether or not the retry succeeds.
      await this.userSettingsPort.setSetting(NEEDS_RECALCULATION, 'true');
      throw error;
    }

    const derivedDataInvalidated = appliedMigrations.length > 0;

    if (derivedDataInvalidated) {
      await this.userSettingsPort.setSetting(NEEDS_RECALCULATION, 'true');
    }

    return { appliedMigrations, derivedDataInvalidated };
  }
}
