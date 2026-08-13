import type { IBackfillSchedulerPort } from '../../../../domain/ports/IBackfillSchedulerPort.js';

/**
 * For suites whose subject is ingestion itself.
 *
 * The scheduler is a constructor requirement rather than an optional collaborator so that no call
 * site can silently lose FX coverage; a suite that is not asserting coverage still has to say which
 * scheduler it means, and this is that statement made once.
 */
export const NO_BACKFILL_SCHEDULER: IBackfillSchedulerPort = {
  requestFxBackfill: () => {},
};
