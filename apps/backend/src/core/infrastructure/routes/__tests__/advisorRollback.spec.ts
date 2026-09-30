import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { closeLedgerDb, getLedgerDb } from '@kryptofolio/database';
import { DIContainer } from '../../di/container.js';
import { createAdvisorApi } from '../advisor.js';
import { MODEL_CHAIN_SETTINGS_KEY } from '../../ai/models/resolveModelChain.js';

const ENV_KEYS = ['LEDGER_DB_PATH', 'VAULT_DB_PATH', 'ADVISOR_DB_PATH', 'DUCKDB_PATH'] as const;

type SqliteMasterRow = { name: string };
type CountRow = { n: number };

describe('advisor rollback: no model chain configured', () => {
  let dir: string;
  let container: DIContainer;
  let api: Hono;
  const saved = new Map<string, string | undefined>();

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'advisor-rollback-'));
    for (const key of ENV_KEYS) saved.set(key, process.env[key]);
    process.env.LEDGER_DB_PATH = path.join(dir, 'ledger.db');
    process.env.VAULT_DB_PATH = path.join(dir, 'vault.db');
    process.env.ADVISOR_DB_PATH = path.join(dir, 'ai-advisor.db');
    process.env.DUCKDB_PATH = ':memory:';
    closeLedgerDb();

    container = new DIContainer();
    await container.sqlitePort.initialize();
    await container.initializeLedgerUseCase.execute();
    api = new Hono().route(
      '/advisor',
      createAdvisorApi({
        askAdvisorUC: { execute: (input) => container.askAdvisorUC.execute(input) },
        userSettingsPort: container.userSettingsPort,
        vaultCredentialsPort: container.vaultCredentialsPort,
        cryptographyPort: container.cryptographyPort,
      }),
    );
  });

  afterEach(() => {
    closeLedgerDb();
    for (const key of ENV_KEYS) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function post(route: string): Promise<Response> {
    return Promise.resolve(
      api.request(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'what is my BTC position?' }),
      }),
    );
  }

  function rowCountsOutsideAdvisorRuns(): Record<string, number> {
    const db = getLedgerDb();
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as unknown as SqliteMasterRow[])
      .map((row) => row.name)
      .filter((name) => name !== 'ai_advisor_runs' && !name.startsWith('sqlite_'));
    return Object.fromEntries(
      tables.map((name) => {
        const row = db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get() as unknown as CountRow;
        return [name, row.n];
      }),
    );
  }

  it('starts with the model chain setting unset', async () => {
    expect(await container.userSettingsPort.getSetting(MODEL_CHAIN_SETTINGS_KEY)).toBeNull();
    const res = await api.request('/advisor/config');
    expect(((await res.json()) as { chain: unknown[] }).chain).toEqual([]);
  });

  it('POST /advisor/ask answers NO_MODEL_AVAILABLE and nothing else', async () => {
    const res = await post('/advisor/ask');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: 'failed', code: 'NO_MODEL_AVAILABLE' });
  });

  it('POST /advisor/stream answers a single failed frame with NO_MODEL_AVAILABLE and no tokens', async () => {
    const res = await post('/advisor/stream');

    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const frames = (await res.text())
      .split('\n\n')
      .flatMap((block) => block.split('\n').filter((line) => line.startsWith('data: ')))
      .map((line) => JSON.parse(line.slice('data: '.length)) as { kind: string; code?: string });

    expect(frames.map((frame) => frame.kind)).toEqual(['failed']);
    expect(frames[0]?.code).toBe('NO_MODEL_AVAILABLE');
  });

  it('records a run row for a streamed request as well as for an ask', async () => {
    await (await post('/advisor/stream')).text();

    expect(getLedgerDb().prepare('SELECT outcome, failure_code FROM ai_advisor_runs').all()).toEqual([
      { outcome: 'failed', failure_code: 'NO_MODEL_AVAILABLE' },
    ]);
  });

  it('stores no execution profile and no step counts for a run that failed before any profile existed', async () => {
    await (await post('/advisor/ask')).text();

    expect(
      getLedgerDb().prepare('SELECT execution_profile, steps_used, max_steps FROM ai_advisor_runs').all(),
    ).toEqual([{ execution_profile: null, steps_used: null, max_steps: null }]);
  });

  it('leaves every other table and the chain setting untouched, recording only the two failed runs', async () => {
    const before = rowCountsOutsideAdvisorRuns();

    await (await post('/advisor/ask')).text();
    await (await post('/advisor/stream')).text();

    expect(rowCountsOutsideAdvisorRuns()).toEqual(before);
    expect(await container.userSettingsPort.getSetting(MODEL_CHAIN_SETTINGS_KEY)).toBeNull();
    expect(getLedgerDb().prepare('SELECT outcome, failure_code FROM ai_advisor_runs').all()).toEqual([
      { outcome: 'failed', failure_code: 'NO_MODEL_AVAILABLE' },
      { outcome: 'failed', failure_code: 'NO_MODEL_AVAILABLE' },
    ]);
  });
});
