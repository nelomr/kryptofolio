import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeLedgerDb } from '@kryptofolio/database';
import { DIContainer } from '../container.js';

const ENV_KEYS = ['LEDGER_DB_PATH', 'VAULT_DB_PATH', 'ADVISOR_DB_PATH', 'DUCKDB_PATH'] as const;

describe('DIContainer advisor wiring', () => {
  let dir: string;
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'container-advisor-'));
    for (const key of ENV_KEYS) saved.set(key, process.env[key]);
    process.env.LEDGER_DB_PATH = path.join(dir, 'ledger.db');
    process.env.VAULT_DB_PATH = path.join(dir, 'vault.db');
    process.env.ADVISOR_DB_PATH = path.join(dir, 'ai-advisor.db');
    process.env.DUCKDB_PATH = ':memory:';
    closeLedgerDb();
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

  it('exposes one askAdvisorUC for the container lifetime', () => {
    const container = new DIContainer();
    expect(container.askAdvisorUC).toBe(container.askAdvisorUC);
  });

  it('does not create the advisor database until the use case is first read', () => {
    const container = new DIContainer();
    expect(fs.existsSync(path.join(dir, 'ai-advisor.db'))).toBe(false);
    void container.askAdvisorUC;
    expect(fs.existsSync(path.join(dir, 'ai-advisor.db'))).toBe(true);
  });

  it('places the advisor database at the resolved advisor path, not the ledger path', () => {
    const container = new DIContainer();
    void container.askAdvisorUC;
    expect(fs.existsSync(path.join(dir, 'ai-advisor.db'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'ledger.db'))).toBe(true);
  });
});
