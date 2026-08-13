import type {
  FxBackfillRequest,
  IBackfillSchedulerPort,
} from '../../domain/ports/IBackfillSchedulerPort.js';
import type { BackfillExchangeRateGapsResult } from '../../application/use-cases/BackfillExchangeRateGapsUC.js';
import { bffLogger } from '../../utils/logger.js';

/** The two collaborators this adapter drives, narrowed to what it calls. */
interface BackfillRunner {
  execute(request: FxBackfillRequest): Promise<BackfillExchangeRateGapsResult>;
}

interface Rematerializer {
  recalculate(force?: boolean): Promise<unknown>;
}

/**
 * Runs a requested backfill off the caller's critical path, then rebuilds the FIFO projection when
 * — and only when — rates actually landed.
 *
 * A rebuild is the expensive half of this, and a run that inserted nothing changes nothing the
 * projection reads. Rebuilding regardless would make every import pay for a no-op.
 *
 * Requests are chained rather than run concurrently: two overlapping backfills would each compute
 * their gap set against the ledger as it was before the other wrote, and the second would refetch
 * what the first had just filled.
 */
export class DeferredBackfillSchedulerAdapter implements IBackfillSchedulerPort {
  private readonly runner: BackfillRunner;
  private readonly rematerializer: Rematerializer;
  private queue: Promise<void> = Promise.resolve();

  constructor(runner: BackfillRunner, rematerializer: Rematerializer) {
    this.runner = runner;
    this.rematerializer = rematerializer;
  }

  requestFxBackfill(request: FxBackfillRequest): void {
    this.queue = this.queue.then(() => this.run(request));
  }

  /** Resolves once every request made so far has finished, however it finished. */
  settled(): Promise<void> {
    return this.queue;
  }

  private async run(request: FxBackfillRequest): Promise<void> {
    try {
      const result = await this.runner.execute(request);

      if (result.unfilledDates.length > 0) {
        bffLogger.warn(
          { unfilled: result.unfilledDates.length, from: request.from, to: request.to },
          'FX backfill left dates uncovered; affected figures stay unconvertible',
        );
      }

      if (result.rowsWritten === 0) return;

      await this.rematerializer.recalculate(true);
    } catch (err) {
      bffLogger.error({ err, request }, 'FX backfill failed; ingested rows are unaffected');
    }
  }
}
