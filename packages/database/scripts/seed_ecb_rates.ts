#!/usr/bin/env tsx
/**
 * seed_ecb_rates.ts — Standalone seeding script for the exchange_rates table.
 *
 * Reads existing ECB CSV backup files from prices_assets/oracle_backups/
 * and bulk-inserts them into the exchange_rates table in kryptofolio_ledger.db.
 *
 * Usage: pnpm --filter @kryptofolio/database seed:ecb-rates
 *
 * The script is idempotent: re-running it will skip rows already present
 * thanks to the INSERT OR IGNORE pattern (PRIMARY KEY conflict).
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import readline from 'node:readline';
import { resolveDataRoot, resolveLedgerDbPath } from '../src/dataPaths.js';
import { classifyEcbBackupRecord, type EcbBackupRow } from './ecbBackupRecord.js';

// ---------------------------------------------------------------------------
// Config — resolve paths relative to the monorepo root (two levels up)
// ---------------------------------------------------------------------------

// The ledger comes from the shared resolver, so seeding follows a relocated `KRYPTOFOLIO_DATA_DIR`
// instead of writing to a second database beside the repository.
const LEDGER_DB_PATH = resolveLedgerDbPath();
const ECB_CSV_PATH = path.join(
  resolveDataRoot(),
  'prices_assets',
  'oracle_backups',
  'backup_ecb_exchange_rates.csv',
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedBackup {
  readonly rows: readonly EcbBackupRow[];
  readonly rejected: readonly string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function parseEcbCsv(csvPath: string): Promise<ParsedBackup> {
  const rows: EcbBackupRow[] = [];
  const rejected: string[] = [];

  const rl = readline.createInterface({
    input: createReadStream(csvPath),
    crlfDelay: Infinity,
  });

  let isFirstLine = true;
  let headers: string[] = [];
  let lineNumber = 0;

  for await (const line of rl) {
    lineNumber += 1;
    if (!line.trim()) continue;

    if (isFirstLine) {
      headers = line.split(',').map((h) => h.trim());
      isFirstLine = false;
      continue;
    }

    const values = line.split(',').map((v) => v.trim());
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      record[h] = values[i] ?? '';
    });

    const outcome = classifyEcbBackupRecord(record);
    if (outcome.kind === 'accepted') {
      rows.push(outcome.row);
    } else {
      rejected.push(`line ${lineNumber}: ${outcome.reason}`);
    }
  }

  return { rows, rejected };
}

function bulkInsertRates(db: DatabaseSync, rows: readonly EcbBackupRow[]): number {
  if (rows.length === 0) return 0;

  const insert = db.prepare(
    'INSERT OR IGNORE INTO exchange_rates (date, pair, rate, source) VALUES (?, ?, ?, ?)',
  );

  let inserted = 0;
  // Use a transaction for bulk inserts — dramatically faster than individual INSERTs
  db.exec('BEGIN');
  try {
    for (const row of rows) {
      const result = insert.run(row.date, row.pair, row.rate, row.source);
      inserted += Number(result.changes ?? 0);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return inserted;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('🌍 ECB Exchange Rates Seeder');
  console.log('══════════════════════════════════════════');

  // 1. Validate paths
  if (!fs.existsSync(LEDGER_DB_PATH)) {
    console.error(`❌ Ledger DB not found at: ${LEDGER_DB_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(ECB_CSV_PATH)) {
    console.error(`❌ ECB CSV backup not found at: ${ECB_CSV_PATH}`);
    process.exit(1);
  }

  console.log(`📂 DB:  ${LEDGER_DB_PATH}`);
  console.log(`📄 CSV: ${ECB_CSV_PATH}`);
  console.log('');

  // 2. Open DB
  const db = new DatabaseSync(LEDGER_DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');

  // 3. Parse CSV
  console.log('📖 Parsing ECB CSV...');
  const { rows, rejected } = await parseEcbCsv(ECB_CSV_PATH);
  console.log(`   → ${rows.length} rows parsed`);

  if (rejected.length > 0) {
    console.error(`⛔ ${rejected.length} row(s) rejected and not seeded:`);
    for (const reason of rejected) console.error(`   ${reason}`);
  }

  if (rows.length === 0) {
    console.warn('⚠️  No rows found in the CSV. Exiting.');
    db.close();
    return;
  }

  // 4. Bulk insert
  console.log('⚡ Inserting into exchange_rates (INSERT OR IGNORE)...');
  const inserted = bulkInsertRates(db, rows);
  const skipped = rows.length - inserted;

  db.close();

  // 5. Summary
  console.log('');
  console.log('✅ Seeding complete!');
  console.log(`   Total rows processed : ${rows.length}`);
  console.log(`   Rows inserted        : ${inserted}`);
  console.log(`   Rows skipped (dups)  : ${skipped}`);
  console.log(`   Rows rejected        : ${rejected.length}`);

  // A rejected row is a backup file the ledger cannot represent, not a seeding detail: exiting
  // non-zero keeps it out of a CI log's green tail.
  if (rejected.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
