import type { DatabaseSync } from 'node:sqlite';
import type { IAdvisorRunLogPort } from '../../domain/ports/IAdvisorRunLogPort.js';
import type {
  AdvisorRunReceipt,
  AdvisorRunReceiptDraft,
  AdvisorRunOutcome,
} from '../../domain/models/AdvisorRunReceipt.js';

/**
 * SqliteAdvisorRunLogAdapter — Infrastructure adapter for the AI advisor's audit trail
 * (`ai_advisor_runs`, in the same ledger SQLite database `SQLiteLedgerAdapter` manages).
 *
 * Takes the raw ledger `DatabaseSync` handle directly, mirroring `SQLiteLedgerAdapter`'s own
 * pattern for this physical database, rather than the generic `IDatabasePort` used for the
 * separate vault database — `ai_advisor_runs` lives in the ledger file precisely so it survives
 * independently of the disposable Mastra conversation store.
 *
 * `outcome.refused.reason` is deliberately never written here. The row answers a provenance
 * question (which model, which tools, at what token/step cost, and whether the run finished,
 * failed, was refused, or was cancelled) — not a narrative one. `AdvisorEvent.refused` already
 * carries the reason to whichever consumer needs to display it in the moment; turning that text
 * into a permanent column would be the same kind of content leak the table's own column set is
 * built to make impossible rather than merely unlikely.
 */
interface ExecutionColumns {
  readonly executionProfile: string | null;
  readonly stepsUsed: number | null;
  readonly maxSteps: number | null;
}

/**
 * A pre-run receipt and a draft that never resolved a profile both store NULL: nothing was
 * resolved, so nothing is recorded.
 */
function executionColumns(receipt: AdvisorRunReceipt | AdvisorRunReceiptDraft): ExecutionColumns {
  if ('kind' in receipt && receipt.kind === 'pre-run') {
    return { executionProfile: null, stepsUsed: null, maxSteps: null };
  }
  return {
    executionProfile: receipt.executionProfile ?? null,
    stepsUsed: receipt.stepsUsed ?? null,
    maxSteps: receipt.maxSteps ?? null,
  };
}

export class SqliteAdvisorRunLogAdapter implements IAdvisorRunLogPort {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async appendRun(
    receipt: AdvisorRunReceipt | AdvisorRunReceiptDraft,
    outcome: AdvisorRunOutcome,
  ): Promise<void> {
    const failureCode = outcome.kind === 'failed' ? outcome.code : null;
    const execution = executionColumns(receipt);

    this.db
      .prepare(
        `
      INSERT INTO ai_advisor_runs
        (id, thread_id, started_at, finished_at, outcome, provider_id, model_id, tools_called,
         input_tokens, output_tokens, failure_code, execution_profile, steps_used, max_steps)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        thread_id = excluded.thread_id,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        outcome = excluded.outcome,
        provider_id = excluded.provider_id,
        model_id = excluded.model_id,
        tools_called = excluded.tools_called,
        input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens,
        failure_code = excluded.failure_code,
        execution_profile = excluded.execution_profile,
        steps_used = excluded.steps_used,
        max_steps = excluded.max_steps
    `,
      )
      .run(
        receipt.runId,
        receipt.threadId,
        receipt.startedAt,
        receipt.finishedAt ?? null,
        outcome.kind,
        receipt.providerId ?? null,
        receipt.modelId ?? null,
        JSON.stringify(receipt.toolsCalled),
        receipt.usage?.inputTokens ?? null,
        receipt.usage?.outputTokens ?? null,
        failureCode,
        execution.executionProfile,
        execution.stepsUsed,
        execution.maxSteps,
      );
  }
}
