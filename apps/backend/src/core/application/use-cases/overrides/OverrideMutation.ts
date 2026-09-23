import type { ILedgerPort } from '../../../domain/ports/ILedgerPort.js';
import type { MaterializationSummary } from '../../services/FifoMaterializerService.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import type { FifoChainFreshnessService } from '../../services/FifoChainFreshnessService.js';

/**
 * A rejected override, raised before any write.
 *
 * The database would reject these too — a foreign key on the counterparty, a trigger on the
 * self-reference — but only mid-batch and with a message about a constraint rather than about the
 * declaration the user made.
 */
export class OverrideValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OverrideValidationError';
  }
}

export interface OverrideMutationResult {
  /** Overrides written or removed. */
  applied: number;
  /** `null` when the request carried nothing, so no rebuild was owed. */
  materialization: MaterializationSummary | null;
}

/**
 * Shared shape of the four override mutations: validate the whole request, write it as one
 * transaction, then rebuild exactly once.
 *
 * The rebuild is deliberately *outside* the write transaction. It opens its own, and nesting the two
 * would either block the writer or expose the rebuild to a value that a later rollback removes.
 */
export abstract class OverrideMutationUseCase {
  protected readonly ledgerPort: ILedgerPort;
  protected readonly userSettingsPort: IUserSettingsPort;
  private readonly freshnessService: FifoChainFreshnessService;

  constructor(
    ledgerPort: ILedgerPort,
    userSettingsPort: IUserSettingsPort,
    freshnessService: FifoChainFreshnessService,
  ) {
    this.ledgerPort = ledgerPort;
    this.userSettingsPort = userSettingsPort;
    this.freshnessService = freshnessService;
  }

  protected async applyThenRebuild(
    count: number,
    write: () => Promise<void>,
  ): Promise<OverrideMutationResult> {
    if (count === 0) {
      return { applied: 0, materialization: null };
    }

    await this.ledgerPort.runInTransaction(write);

    // Marked before the rebuild rather than after: a rebuild that dies partway has to leave the
    // marker standing, and the marker lives in a different database than the rows, so it cannot ride
    // the rollback.
    await this.userSettingsPort.setSetting('needs_recalculation', 'true');

    // `refresh()` always runs the full pipeline and never joins one that started before this
    // override was written: the user is waiting to see the effect of the value they just declared.
    const { materialization } = await this.freshnessService.refresh();

    return { applied: count, materialization };
  }
}
