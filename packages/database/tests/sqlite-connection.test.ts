import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { getLedgerDb, closeLedgerDb } from '../src/sqlite/connection';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('SQLite Database Connection', () => {
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `test_ledger_${Date.now()}.db`);
  });

  afterEach(() => {
    closeLedgerDb();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should initialize connection with WAL mode and NORMAL synchronous', () => {
    const db = getLedgerDb(testDbPath);
    expect(db).toBeInstanceOf(DatabaseSync);

    // Verify pragmas
    const journalMode = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    expect(journalMode.journal_mode.toUpperCase()).toBe('WAL');

    const synchronous = db.prepare('PRAGMA synchronous').get() as { synchronous: number };
    // NORMAL is 1 in SQLite
    expect(synchronous.synchronous).toBe(1);
  });
  
  it('should return a singleton connection if called multiple times', () => {
    const db1 = getLedgerDb(testDbPath);
    const db2 = getLedgerDb(testDbPath);
    expect(db1).toBe(db2);
  });
});
