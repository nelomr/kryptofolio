/**
 * AdvisorRunReceipt — Domain models for the AI advisor's per-run audit trail.
 *
 * DOMAIN ISOLATION RULE: No external library imports allowed here.
 */
import type {
  AiProviderId,
  AdvisorToolName,
  RunExecutionProfile,
  AdvisorFailureCode,
} from '@kryptofolio/shared-types';

/** Token counts for one run, as reported by the provider on `finish`. */
export interface AdvisorRunUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

interface AdvisorRunReceiptBase {
  readonly runId: string;
  readonly threadId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly providerId?: AiProviderId;
  readonly modelId?: string;
  readonly toolsCalled: readonly AdvisorToolName[];
  readonly usage: AdvisorRunUsage;
}

/**
 * A run that resolved an execution profile before it started streaming: the profile and both step
 * counts are known facts, so all three are required. Only this variant can back a `completed` event.
 */
export interface ProfiledAdvisorRunReceipt extends AdvisorRunReceiptBase {
  readonly kind: 'profiled';
  readonly executionProfile: RunExecutionProfile;
  readonly stepsUsed: number;
  readonly maxSteps: number;
}

/**
 * A run that failed before any execution profile existed (`NO_MODEL_AVAILABLE`, `VAULT_LOCKED`).
 * It has no profile and took no steps; carrying a default would put a value in the audit trail that
 * nothing ever resolved. `ai_advisor_runs` stores these three columns as NULL for such a run.
 */
export interface PreRunAdvisorRunReceipt extends AdvisorRunReceiptBase {
  readonly kind: 'pre-run';
}

/**
 * The frozen receipt a terminal `AdvisorEvent` carries and `IAdvisorRunLogPort.appendRun` persists —
 * everything `ai_advisor_runs` needs, and nothing conversation content ever touches.
 *
 * `providerId`/`modelId` are optional for the same reason the pre-run variant exists: the SQL
 * columns are nullable because a run that fails before any chain entry is attempted genuinely
 * never chooses a provider or model, and inventing one would misstate the audit trail.
 */
export type AdvisorRunReceipt = ProfiledAdvisorRunReceipt | PreRunAdvisorRunReceipt;

/**
 * The mutable accumulator the adapter fills as facts become known during a run — `runId` and
 * `startedAt` from the start, everything else once resolved. Persisted as-is with `outcome: 'aborted'`
 * when the consumer stops iterating before a terminal event exists, which is the one outcome a frozen
 * `AdvisorRunReceipt` could never express.
 */
export interface AdvisorRunReceiptDraft {
  readonly runId: string;
  readonly threadId: string;
  readonly startedAt: string;
  finishedAt?: string;
  providerId?: AiProviderId;
  modelId?: string;
  readonly toolsCalled: AdvisorToolName[];
  usage?: AdvisorRunUsage;
  executionProfile?: RunExecutionProfile;
  stepsUsed?: number;
  maxSteps?: number;
  /**
   * Sticky presentation signal: a tool result of this run reported a partial total. It is not part
   * of the audit row — `freezeReceipt` and the run log ignore it — and travels to the client on
   * the `completed` event instead.
   */
  figuresIncomplete?: boolean;
}

/**
 * The audit row's terminal state (`ai_advisor_runs.outcome`, migration 009). Not carried on
 * `AdvisorEvent` itself — the event's own `kind` already distinguishes `completed`/`refused`/`failed`,
 * and `aborted` exists only here because cancellation produces no terminal event at all.
 */
export type AdvisorRunOutcome =
  | { readonly kind: 'completed' }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'failed'; readonly code: AdvisorFailureCode }
  | { readonly kind: 'aborted' };
