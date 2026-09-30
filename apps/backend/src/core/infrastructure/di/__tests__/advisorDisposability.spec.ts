import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyMigrations } from '@kryptofolio/database';
import { createAdvisorMemory } from '../../ai/createAdvisorMemory.js';
import { composeAskAdvisor, lateBoundToolUseCases, type ToolUseCaseSource } from '../advisorComposition.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import type { ICryptographyPort } from '../../../domain/ports/ICryptographyPort.js';
import type { IVaultCredentialsPort } from '../../../domain/ports/IVaultCredentialsPort.js';

class SettingsStub implements IUserSettingsPort {
  private readonly values = new Map<string, string>();
  async getSetting(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async setSetting(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

const cryptographyStub = { isUnlocked: () => false } as unknown as ICryptographyPort;
const vaultStub = { getConfiguredServices: async () => [] } as unknown as IVaultCredentialsPort;

const unusedToolSource = new Proxy({} as ToolUseCaseSource, {
  get: (_, key) => {
    throw new Error(`${String(key)} is not used in this test`);
  },
});

type AdvisorMessage = Parameters<ReturnType<typeof createAdvisorMemory>['saveMessages']>[0]['messages'][number];

interface RunRow {
  id: string;
  thread_id: string;
  outcome: string;
  failure_code: string | null;
}

describe('advisor database disposability', () => {
  let dir: string;
  let ledgerPath: string;
  let advisorDbPath: string;
  let ledgerDb: DatabaseSync;

  function openLedger(): DatabaseSync {
    const db = new DatabaseSync(ledgerPath);
    db.exec('PRAGMA foreign_keys = ON;');
    applyMigrations(db);
    return db;
  }

  function compose(db: DatabaseSync) {
    return composeAskAdvisor({
      ledgerDb: db,
      advisorDbPath,
      userSettingsPort: new SettingsStub(),
      cryptographyPort: cryptographyStub,
      vaultPort: vaultStub,
      toolUseCases: lateBoundToolUseCases(unusedToolSource),
    });
  }

  async function ask(db: DatabaseSync, message: string): Promise<void> {
    for await (const event of compose(db).execute({ message })) void event;
  }

  function runRows(db: DatabaseSync): RunRow[] {
    return db
      .prepare('SELECT id, thread_id, outcome, failure_code FROM ai_advisor_runs')
      .all() as unknown as RunRow[];
  }

  function userMessage(threadId: string, text: string): AdvisorMessage {
    return {
      id: `msg-${threadId}`,
      role: 'user',
      createdAt: new Date(),
      threadId,
      resourceId: 'local',
      content: { format: 2, parts: [{ type: 'text', text }] },
    };
  }

  function removeAdvisorDatabase(): void {
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      fs.rmSync(`${advisorDbPath}${suffix}`, { force: true });
    }
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'advisor-disposability-'));
    ledgerPath = path.join(dir, 'ledger.db');
    advisorDbPath = path.join(dir, 'ai-advisor.db');
    ledgerDb = openLedger();
  });

  afterEach(() => {
    ledgerDb.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('erases every thread and message, keeps every run row, and leaves the advisor working after a restart', async () => {
    await ask(ledgerDb, 'first question');
    await ask(ledgerDb, 'second question');

    const before = createAdvisorMemory(advisorDbPath);
    await before.createThread({ threadId: 'thread-A', resourceId: 'local', title: 'A' });
    await before.saveMessages({ messages: [userMessage('thread-A', 'what is my BTC position?')] });
    expect(await before.getThreadById({ threadId: 'thread-A' })).not.toBeNull();
    expect((await before.recall({ threadId: 'thread-A' })).messages).toHaveLength(1);

    const runsBefore = runRows(ledgerDb);
    const schemaBefore = ledgerDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    expect(runsBefore).toHaveLength(2);

    ledgerDb.close();
    removeAdvisorDatabase();
    expect(fs.existsSync(advisorDbPath)).toBe(false);

    ledgerDb = openLedger();
    const after = createAdvisorMemory(advisorDbPath);
    expect(await after.getThreadById({ threadId: 'thread-A' })).toBeNull();
    expect((await after.recall({ threadId: 'thread-A' })).messages).toHaveLength(0);

    expect(runRows(ledgerDb)).toEqual(runsBefore);
    expect(ledgerDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual(
      schemaBefore,
    );
    expect(ledgerDb.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });

    await ask(ledgerDb, 'third question, after the wipe');
    expect(runRows(ledgerDb)).toHaveLength(3);
    expect(runRows(ledgerDb)).toEqual(expect.arrayContaining(runsBefore));
  });

  it('keeps conversation content out of the ledger file entirely', async () => {
    const memory = createAdvisorMemory(advisorDbPath);
    await memory.createThread({ threadId: 'thread-B', resourceId: 'local', title: 'B' });
    await memory.saveMessages({ messages: [userMessage('thread-B', 'a distinctive portfolio sentence')] });
    await ask(ledgerDb, 'a distinctive portfolio sentence');

    ledgerDb.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    const ledgerBytes = fs.readFileSync(ledgerPath).toString('latin1');
    expect(ledgerBytes).not.toContain('a distinctive portfolio sentence');
  });
});
