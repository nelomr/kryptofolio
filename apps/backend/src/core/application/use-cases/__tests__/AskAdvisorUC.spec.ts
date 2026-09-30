import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { applyMigrations } from '@kryptofolio/database';
import { SqliteAdvisorRunLogAdapter } from '../../../infrastructure/adapters/SqliteAdvisorRunLogAdapter.js';
import { AskAdvisorUC } from '../AskAdvisorUC.js';
import type { IAdvisorPort } from '../../../domain/ports/IAdvisorPort.js';
import type { IAdvisorRunLogPort } from '../../../domain/ports/IAdvisorRunLogPort.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import type { AdvisorEvent } from '../../../domain/models/AdvisorEvent.js';
import type { AdvisorRequest } from '../../../domain/models/AdvisorRequest.js';
import type { AdvisorRunOutcome, AdvisorRunReceipt, AdvisorRunReceiptDraft, ProfiledAdvisorRunReceipt } from '../../../domain/models/AdvisorRunReceipt.js';

class SettingsStub implements IUserSettingsPort {
  private readonly values = new Map<string, string>();

  async getSetting(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

class RunLogSpy implements IAdvisorRunLogPort {
  readonly calls: Array<{ receipt: AdvisorRunReceipt | AdvisorRunReceiptDraft; outcome: AdvisorRunOutcome }> = [];

  async appendRun(receipt: AdvisorRunReceipt | AdvisorRunReceiptDraft, outcome: AdvisorRunOutcome): Promise<void> {
    this.calls.push({ receipt, outcome });
  }
}

function buildReceipt(overrides: Partial<ProfiledAdvisorRunReceipt> = {}): ProfiledAdvisorRunReceipt {
  return {
    kind: 'profiled',
    runId: 'run-1',
    threadId: 'thread-1',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:01.000Z',
    providerId: 'anthropic',
    modelId: 'claude-x',
    toolsCalled: [],
    usage: { inputTokens: 1, outputTokens: 1 },
    executionProfile: 'metered',
    stepsUsed: 1,
    maxSteps: 5,
    ...overrides,
  };
}

/** A scripted `IAdvisorPort` whose `ask` captures the request it received and yields a fixed
 * sequence of events, one at a time, only as the consumer asks for the next one. */
class ScriptedAdvisorPort implements IAdvisorPort {
  capturedRequest: AdvisorRequest | undefined;
  private readonly script: AdvisorEvent[];

  constructor(script: AdvisorEvent[]) {
    this.script = script;
  }

  async *ask(request: AdvisorRequest): AsyncIterable<AdvisorEvent> {
    this.capturedRequest = request;
    for (const event of this.script) {
      yield event;
    }
  }
}

/** A scripted port whose `ask` never actually reaches its terminal event unless the consumer keeps
 * iterating — used to prove the cancellation path fires only when iteration is truly abandoned. */
class NeverTerminatingAdvisorPort implements IAdvisorPort {
  async *ask(): AsyncIterable<AdvisorEvent> {
    yield { kind: 'token', text: 'partial', runId: 'run-abandoned' };
    // A real adapter would keep streaming; this test double hangs here deliberately so the only
    // way execution proceeds is the consumer breaking out of iteration.
    await new Promise<void>(() => {});
    yield { kind: 'token', text: 'unreachable', runId: 'run-abandoned' };
  }
}

describe('AskAdvisorUC', () => {
  describe('Functional Sandwich ordering', () => {
    it('resolves locale and baseCurrency via IUserSettingsPort before the port is ever asked', async () => {
      const settings = new SettingsStub();
      await settings.setSetting('language', 'es');
      await settings.setSetting('base_currency', 'EUR');
      const port = new ScriptedAdvisorPort([
        { kind: 'completed', runId: 'run-1', receipt: buildReceipt(), disclaimer: false, figuresIncomplete: false },
      ]);
      const runLog = new RunLogSpy();
      const useCase = new AskAdvisorUC(port, runLog, settings);

      const events: AdvisorEvent[] = [];
      for await (const event of useCase.execute({ message: 'hola' })) {
        events.push(event);
      }

      expect(port.capturedRequest).toEqual({
        message: 'hola',
        threadId: expect.any(String),
        locale: 'es',
        baseCurrency: 'EUR',
      });
      expect(events).toHaveLength(1);
    });

    it('falls back to en/USD when neither setting has ever been configured', async () => {
      const settings = new SettingsStub();
      const port = new ScriptedAdvisorPort([{ kind: 'completed', runId: 'run-1', receipt: buildReceipt(), disclaimer: false, figuresIncomplete: false }]);
      const runLog = new RunLogSpy();
      const useCase = new AskAdvisorUC(port, runLog, settings);

      for await (const _event of useCase.execute({ message: 'hi' })) {
        // drain
      }

      expect(port.capturedRequest?.locale).toBe('en');
      expect(port.capturedRequest?.baseCurrency).toBe('USD');
    });
  });

  describe('receipt persistence on the terminal event', () => {
    it.each([
      ['completed', { kind: 'completed', runId: 'run-1', receipt: buildReceipt(), disclaimer: false, figuresIncomplete: false } satisfies AdvisorEvent],
      [
        'refused',
        {
          kind: 'refused',
          runId: 'run-1',
          reason: 'not grounded',
          processorId: 'grounding-directive-detector',
          receipt: buildReceipt(),
        } satisfies AdvisorEvent,
      ],
      [
        'failed',
        { kind: 'failed', runId: 'run-1', code: 'ALL_PROVIDERS_FAILED', cause: { kind: 'auth-rejected', providerId: 'ollama-cloud', modelId: 'gpt-oss:120b' }, receipt: buildReceipt() } satisfies AdvisorEvent,
      ],
    ])('writes exactly one row with outcome = %s', async (expectedOutcome, terminalEvent) => {
      const settings = new SettingsStub();
      const port = new ScriptedAdvisorPort([{ kind: 'token', text: 'partial', runId: 'run-1' }, terminalEvent]);
      const runLog = new RunLogSpy();
      const useCase = new AskAdvisorUC(port, runLog, settings);

      for await (const _event of useCase.execute({ message: 'hi' })) {
        // drain fully
      }

      expect(runLog.calls).toHaveLength(1);
      expect(runLog.calls[0]?.outcome.kind).toBe(expectedOutcome);
    });
  });

  describe('cancellation with no terminal event', () => {
    it('a consumer abandoning iteration mid-run still writes exactly one aborted row, and no terminal event reaches it', async () => {
      const settings = new SettingsStub();
      const port = new NeverTerminatingAdvisorPort();
      const runLog = new RunLogSpy();
      const useCase = new AskAdvisorUC(port, runLog, settings);

      const events: AdvisorEvent[] = [];
      for await (const event of useCase.execute({ message: 'hi', threadId: 'thread-abandoned' })) {
        events.push(event);
        break;
      }

      expect(events).toEqual([{ kind: 'token', text: 'partial', runId: 'run-abandoned' }]);
      expect(events.some((e) => e.kind === 'completed' || e.kind === 'refused' || e.kind === 'failed')).toBe(false);
      expect(runLog.calls).toHaveLength(1);
      expect(runLog.calls[0]?.outcome).toEqual({ kind: 'aborted' });
      expect(runLog.calls[0]?.receipt.threadId).toBe('thread-abandoned');
      expect(runLog.calls[0]?.receipt.runId).toBe('run-abandoned');
    });

    it('falls back to a freshly generated runId only when the port never yields anything at all before throwing', async () => {
      const settings = new SettingsStub();
      const port: IAdvisorPort = {
        async *ask(): AsyncIterable<AdvisorEvent> {
          throw new Error('the port failed before yielding a single event');
        },
      };
      const runLog = new RunLogSpy();
      const useCase = new AskAdvisorUC(port, runLog, settings);

      await expect(async () => {
        for await (const _event of useCase.execute({ message: 'hi' })) {
          // never reached
        }
      }).rejects.toThrow('the port failed before yielding a single event');

      expect(runLog.calls).toHaveLength(1);
      expect(runLog.calls[0]?.outcome).toEqual({ kind: 'aborted' });
      expect(typeof runLog.calls[0]?.receipt.runId).toBe('string');
      expect(runLog.calls[0]?.receipt.runId.length).toBeGreaterThan(0);
    });
  });

  describe('the read-only invariant', () => {
    it('never touches anything beyond IAdvisorPort/IAdvisorRunLogPort/IUserSettingsPort', async () => {
      const { readFileSync } = await import('node:fs');
      const source = readFileSync(new URL('../AskAdvisorUC.ts', import.meta.url), 'utf8');

      expect(source).not.toMatch(/ILedgerPort|ITaxCalculatorPort|IDatabasePort|DuckDB|duckdb/);
      expect(source).not.toMatch(/\.(insert|update|delete|save|write)\(/);
    });

    it('a request asking to change, delete, or add an asset terminates the run and leaves every ledger table byte-identical, the receipt row being the only write', async () => {
      const db = new DatabaseSync(':memory:');
      try {
        db.exec('PRAGMA foreign_keys = ON;');
        applyMigrations(db);
        db.exec(`
          INSERT INTO assets (id, symbol) VALUES ('BTC', 'BTC');
          INSERT INTO accounts (id, name, type) VALUES ('acc-1', 'Kraken', 'exchange');
          INSERT INTO spot_transactions
            (id, id_hash, account_id, tx_type, asset_in_id, amount_in, total_fiat, price_fiat, fiat_currency, timestamp, status)
          VALUES ('tx-1', 'h-1', 'acc-1', 'DEPOSIT', 'BTC', '1.50000000', '45000.00', '30000.00', 'EUR', '2024-01-01T10:00:00Z', 'COMPLETED');
          INSERT INTO tax_lots
            (id, spot_transaction_id, asset_id, account_id, original_qty, remaining_qty,
             unit_cost_fiat, total_cost_fiat, fiat_currency, acquisition_timestamp, exchange_location, status)
          VALUES ('lot-1', 'tx-1', 'BTC', 'acc-1', '1.50000000', '1.50000000', '30000.00', '45000.00', 'EUR',
                  '2024-01-01T10:00:00Z', 'Kraken', 'OPEN');
        `);
        const tableNames = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>)
          .map((row) => row.name)
          .filter((name) => name !== 'ai_advisor_runs');
        const dumpLedger = () =>
          JSON.stringify(tableNames.map((name) => [name, db.prepare(`SELECT * FROM "${name}"`).all()]));
        expect(tableNames).toEqual(expect.arrayContaining(['assets', 'spot_transactions', 'tax_lots']));
        const before = dumpLedger();

        const port = new ScriptedAdvisorPort([
          { kind: 'completed', runId: 'run-1', receipt: buildReceipt(), disclaimer: false, figuresIncomplete: false },
        ]);
        const useCase = new AskAdvisorUC(port, new SqliteAdvisorRunLogAdapter(db), new SettingsStub());

        const events: AdvisorEvent[] = [];
        for await (const event of useCase.execute({ message: 'please delete my BTC holdings' })) {
          events.push(event);
        }

        expect(events.at(-1)?.kind).toBe('completed');
        expect(dumpLedger()).toBe(before);
        expect(db.prepare('SELECT COUNT(*) AS n FROM ai_advisor_runs').get()).toEqual({ n: 1 });
      } finally {
        db.close();
      }
    });
  });
});
