/**
 * IAdvisorRunLogPort — Domain Port for persisting the AI advisor's audit trail.
 *
 * DOMAIN ISOLATION RULE: No external library imports allowed here.
 * `AskAdvisorUC` must never touch SQLite directly; a receipt is domain data, so persistence
 * goes through this second domain port rather than through `IAdvisorPort` itself. The write is an
 * upsert on `runId` (migration 009's primary key), so a normal completion and a cancellation's
 * `finally`-block write can never double-write the same run.
 */
import type { AdvisorRunReceipt, AdvisorRunReceiptDraft, AdvisorRunOutcome } from '../models/AdvisorRunReceipt.js';

export interface IAdvisorRunLogPort {
  appendRun(receipt: AdvisorRunReceipt | AdvisorRunReceiptDraft, outcome: AdvisorRunOutcome): Promise<void>;
}
