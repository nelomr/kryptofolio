import type { ILedgerPort } from '../../../domain/ports/ILedgerPort.js';
import type {
  FifoMaterializerService,
  MaterializationSummary,
} from '../../services/FifoMaterializerService.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';

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
  protected readonly materializer: FifoMaterializerService;
  protected readonly userSettingsPort: IUserSettingsPort;

  constructor(
    ledgerPort: ILedgerPort,
    materializer: FifoMaterializerService,
    userSettingsPort: IUserSettingsPort,
  ) {
    this.ledgerPort = ledgerPort;
    this.materializer = materializer;
    this.userSettingsPort = userSettingsPort;
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

    // Forced: the user is waiting to see the effect of a value they just declared, so whether a
    // rebuild is owed was decided by the act of declaring it.
    const materialization = await this.materializer.recalculate(true);

    return { applied: count, materialization };
  }
}
