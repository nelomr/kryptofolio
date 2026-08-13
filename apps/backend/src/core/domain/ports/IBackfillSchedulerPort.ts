/** A closed, inclusive span of ISO-8601 dates the FX ledger is asked to cover. */
export interface FxBackfillRequest {
  /** ISO-8601 `YYYY-MM-DD`, inclusive — typically a batch's oldest transaction date. */
  readonly from: string;
  /** ISO-8601 `YYYY-MM-DD`, inclusive. */
  readonly to: string;
}

/**
 * Deferral of work a use case must not perform itself.
 *
 * An import that waited on a network download would turn a failed request into a failed import, and
 * a use case reaching for a timer, a queue or a job runner is infrastructure leaking into the
 * application layer. So the request is stated here and the mechanism lives in an adapter.
 *
 * `void`, not `Promise<void>`: the caller cannot await what it must not block on, and the return
 * type is what makes that structural rather than a convention.
 */
export interface IBackfillSchedulerPort {
  requestFxBackfill(request: FxBackfillRequest): void;
}
