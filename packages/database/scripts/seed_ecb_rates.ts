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

// ---------------------------------------------------------------------------
// Config — resolve paths relative to the monorepo root (two levels up)
// ---------------------------------------------------------------------------

const MONOREPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const LEDGER_DB_PATH = path.join(MONOREPO_ROOT, 'kryptofolio_ledger.db');
const ECB_CSV_PATH = path.join(
  MONOREPO_ROOT,
  'prices_assets',
  'oracle_backups',
  'backup_ecb_exchange_rates.csv',
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EcbRateRow {
  date: string;
  pair: string;
  rate: string;
  source: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function parseEcbCsv(csvPath: string): Promise<EcbRateRow[]> {
  const rows: EcbRateRow[] = [];

  const rl = readline.createInterface({
    input: createReadStream(csvPath),
    crlfDelay: Infinity,
  });

  let isFirstLine = true;
  let headers: string[] = [];

  for await (const line of rl) {
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

    // We only need: date, pair, rate, source
    const row: EcbRateRow = {
      date: record['date'] ?? '',
      pair: record['pair'] ?? '',
      rate: record['rate'] ?? '',
      source: record['source'] ?? 'ECB',
    };

    if (row.date && row.pair && row.rate) {
      rows.push(row);
    }
  }

  return rows;
}

function bulkInsertRates(db: DatabaseSync, rows: EcbRateRow[]): number {
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
  const rows = await parseEcbCsv(ECB_CSV_PATH);
  console.log(`   → ${rows.length} rows parsed`);

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
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
