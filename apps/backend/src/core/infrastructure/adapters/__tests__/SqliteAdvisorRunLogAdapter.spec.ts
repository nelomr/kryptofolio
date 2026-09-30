import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { applyMigrations } from '@kryptofolio/database';
import { ADVISOR_TOOL_NAMES } from '@kryptofolio/shared-types';
import { SqliteAdvisorRunLogAdapter } from '../SqliteAdvisorRunLogAdapter.js';
import type {
  AdvisorRunReceiptDraft,
  PreRunAdvisorRunReceipt,
  ProfiledAdvisorRunReceipt,
} from '../../../domain/models/AdvisorRunReceipt.js';

function buildReceipt(overrides: Partial<ProfiledAdvisorRunReceipt> = {}): ProfiledAdvisorRunReceipt {
  return {
    kind: 'profiled',
    runId: 'run-1',
    threadId: 'thread-1',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:05.000Z',
    providerId: 'anthropic',
    modelId: 'claude-x',
    toolsCalled: ['portfolio_summary', 'fiscal_integrity'],
    usage: { inputTokens: 120, outputTokens: 340 },
    executionProfile: 'metered',
    stepsUsed: 2,
    maxSteps: 5,
    ...overrides,
  };
}

interface RawRunRow {
  id: string;
  thread_id: string;
  started_at: string;
  finished_at: string | null;
  outcome: string;
  provider_id: string | null;
  model_id: string | null;
  tools_called: string;
  input_tokens: number | null;
  output_tokens: number | null;
  failure_code: string | null;
  execution_profile: string | null;
  steps_used: number | null;
  max_steps: number | null;
}

describe('SqliteAdvisorRunLogAdapter', () => {
  let db: DatabaseSync;
  let adapter: SqliteAdvisorRunLogAdapter;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    applyMigrations(db);
    adapter = new SqliteAdvisorRunLogAdapter(db);
  });

  afterEach(() => {
    db.close();
  });

  function readRow(id: string): RawRunRow | undefined {
    return db.prepare('SELECT * FROM ai_advisor_runs WHERE id = ?').get(id) as RawRunRow | undefined;
  }

  it('projects a completed receipt onto one row, including execution_profile/steps_used/max_steps', async () => {
    const receipt = buildReceipt();
    await adapter.appendRun(receipt, { kind: 'completed' });

    const row = readRow('run-1');
    expect(row).toBeDefined();
    expect(row?.thread_id).toBe('thread-1');
    expect(row?.started_at).toBe('2026-01-01T00:00:00.000Z');
    expect(row?.finished_at).toBe('2026-01-01T00:00:05.000Z');
    expect(row?.outcome).toBe('completed');
    expect(row?.provider_id).toBe('anthropic');
    expect(row?.model_id).toBe('claude-x');
    expect(row?.input_tokens).toBe(120);
    expect(row?.output_tokens).toBe(340);
    expect(row?.execution_profile).toBe('metered');
    expect(row?.steps_used).toBe(2);
    expect(row?.max_steps).toBe(5);
    expect(row?.failure_code).toBeNull();
  });

  it('persists a failed outcome with its failure code', async () => {
    const receipt = buildReceipt({ runId: 'run-failed', providerId: undefined, modelId: undefined });
    await adapter.appendRun(receipt, { kind: 'failed', code: 'ALL_PROVIDERS_FAILED' });

    const row = readRow('run-failed');
    expect(row?.outcome).toBe('failed');
    expect(row?.failure_code).toBe('ALL_PROVIDERS_FAILED');
    expect(row?.provider_id).toBeNull();
    expect(row?.model_id).toBeNull();
  });

  it('persists a pre-run failure with SQL NULL for execution_profile, steps_used and max_steps', async () => {
    const receipt: PreRunAdvisorRunReceipt = {
      kind: 'pre-run',
      runId: 'run-pre-run',
      threadId: 'thread-1',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:00.100Z',
      toolsCalled: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    await adapter.appendRun(receipt, { kind: 'failed', code: 'NO_MODEL_AVAILABLE' });

    const row = readRow('run-pre-run');
    expect(row?.outcome).toBe('failed');
    expect(row?.failure_code).toBe('NO_MODEL_AVAILABLE');
    expect(row?.execution_profile).toBeNull();
    expect(row?.steps_used).toBeNull();
    expect(row?.max_steps).toBeNull();
  });

  it('persists a refused outcome without inventing a text column for the reason', async () => {
    const receipt = buildReceipt({ runId: 'run-refused' });
    await adapter.appendRun(receipt, { kind: 'refused', reason: 'This request asks how to evade taxable gains.' });

    const row = readRow('run-refused');
    expect(row?.outcome).toBe('refused');
    const knownColumns = Object.keys(row as object);
    expect(knownColumns).not.toContain('refused_reason');
    expect(knownColumns).not.toContain('reason');
  });

  it('persists an aborted draft with a nullable execution_profile when the profile was never resolved', async () => {
    const draft: AdvisorRunReceiptDraft = {
      runId: 'run-aborted',
      threadId: 'thread-aborted',
      startedAt: '2026-01-01T00:00:00.000Z',
      toolsCalled: [],
    };
    await adapter.appendRun(draft, { kind: 'aborted' });

    const row = readRow('run-aborted');
    expect(row?.outcome).toBe('aborted');
    expect(row?.execution_profile).toBeNull();
    expect(row?.provider_id).toBeNull();
    expect(row?.steps_used).toBeNull();
    expect(row?.max_steps).toBeNull();
    expect(row?.tools_called).toBe('[]');
  });

  it('persists tools_called as a JSON array that round-trips through the shared tool-name enum', async () => {
    const receipt = buildReceipt({ runId: 'run-tools', toolsCalled: ['token_history', 'live_prices'] });
    await adapter.appendRun(receipt, { kind: 'completed' });

    const row = readRow('run-tools');
    const parsed: unknown = JSON.parse(row?.tools_called ?? '[]');
    expect(z.array(z.enum(ADVISOR_TOOL_NAMES)).parse(parsed)).toEqual(['token_history', 'live_prices']);
  });

  it('an unrecognized tool name stored in the column fails to parse through the shared enum', () => {
    db.prepare(
      `INSERT INTO ai_advisor_runs (id, thread_id, started_at, outcome, tools_called, execution_profile)
       VALUES ('run-corrupt', 'thread-1', '2026-01-01T00:00:00.000Z', 'completed', ?, 'metered')`,
    ).run(JSON.stringify(['portfolio_summary', 'not_a_real_tool']));

    const row = readRow('run-corrupt');
    const parsed: unknown = JSON.parse(row?.tools_called ?? '[]');
    expect(() => z.array(z.enum(ADVISOR_TOOL_NAMES)).parse(parsed)).toThrow();
  });

  it('writing the same runId twice leaves exactly one row (upsert)', async () => {
    await adapter.appendRun(buildReceipt({ runId: 'run-shared' }), { kind: 'completed' });
    await adapter.appendRun(buildReceipt({ runId: 'run-shared', stepsUsed: 4 }), { kind: 'completed' });

    const rows = db.prepare('SELECT * FROM ai_advisor_runs WHERE id = ?').all('run-shared');
    expect(rows).toHaveLength(1);
    const row = rows[0] as unknown as RawRunRow;
    expect(row.steps_used).toBe(4);
  });
});
