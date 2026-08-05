import { DatabaseSync } from 'node:sqlite';
import { resolveLedgerDbPath } from '../dataPaths.js';

let instance: DatabaseSync | null = null;
let instancePath: string | null = null;

/**
 * Initializes and returns the SQLite database connection.
 * @param dbPath Path to the database file. Defaults to the ledger file in the resolved data root.
 */
export function getLedgerDb(dbPath?: string): DatabaseSync {
  const targetPath = dbPath || resolveLedgerDbPath();

  if (instance) {
    // S-4 fix: validate that the requested path matches the existing singleton.
    // Silently returning a wrong DB connection is a critical silent bug.
    if (instancePath && instancePath !== targetPath) {
      throw new Error(
        `getLedgerDb: requested path "${targetPath}" conflicts with existing singleton at "${instancePath}". ` +
        'Close the existing connection first with closeLedgerDb().',
      );
    }
    return instance;
  }

  instance = new DatabaseSync(targetPath);
  instancePath = targetPath;

  // Configure Pragmas
  instance.exec('PRAGMA journal_mode = WAL;');
  instance.exec('PRAGMA synchronous = NORMAL;');
  // CRITICAL: SQLite does NOT enforce foreign keys by default.
  // This must be set per-connection, every time the DB is opened.
  instance.exec('PRAGMA foreign_keys = ON;');

  return instance;
}

/**
 * Closes the ledger database connection if it exists.
 */
export function closeLedgerDb(): void {
  if (instance) {
    instance.close();
    instance = null;
    instancePath = null;
  }
}
