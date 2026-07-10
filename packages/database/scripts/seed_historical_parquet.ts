#!/usr/bin/env tsx
/**
 * seed_historical_parquet.ts — Standalone seeding script for the Parquet storage layer.
 *
 * Reads existing CSV backup files from prices_assets/ and writes year-partitioned
 * Parquet files to data/historical/prices/ using DuckDB's native COPY command.
 *
 * Sources:
 *   1. prices_assets/prices/        — CoinMarketCap format (semicolon-separated, OHLCV)
 *   2. prices_assets/price-usd/     — USD-denominated CoinMarketCap format
 *   3. prices_assets/oracle_backups/backup_market_prices_fiscal.csv — oracle backup
 *
 * Usage: pnpm run seed:parquet
 *
 * The script is IDEMPOTENT — re-running overwrites existing year partitions atomically
 * (DuckDB COPY replaces the file). No duplicate rows are introduced.
 */

import path from 'node:path';
import fs from 'node:fs';
import { DuckDBInstance } from '@duckdb/node-api';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MONOREPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const PRICES_DIR = path.join(MONOREPO_ROOT, 'prices_assets', 'prices');
const PRICE_USD_DIR = path.join(MONOREPO_ROOT, 'prices_assets', 'price-usd');
const ORACLE_BACKUP = path.join(
  MONOREPO_ROOT,
  'prices_assets',
  'oracle_backups',
  'backup_market_prices_fiscal.csv',
);
const PARQUET_OUTPUT = path.join(MONOREPO_ROOT, 'data', 'historical', 'prices');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the asset symbol from a CoinMarketCap filename. */
function extractSymbolFromFilename(filename: string): string | null {
  // Filenames like: "Bitcoin_1_1_2024-31_12_2024_historical_data_coinmarketcap.csv"
  // or "Bitcoin_1_1_2025-31_3_2026_historical_data_USD.csv"
  // We use the asset name column in the CSV (column "name") when available.
  // As a fallback, use the first word of the filename.
  const nameMatch = filename.match(/^([^_]+)/);
  return nameMatch?.[1] ?? null;
}

/** Collect all CSV files from a directory. */
function collectCsvFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.csv') || f.endsWith('.USDcsv.csv') || f.toLowerCase().endsWith('csv'))
    .map((f) => path.join(dir, f));
}

// ---------------------------------------------------------------------------
// Symbol mapping — CoinMarketCap name → our ticker symbol
// ---------------------------------------------------------------------------

const NAME_TO_SYMBOL: Record<string, string> = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  solana: 'SOL',
  cardano: 'ADA',
  ripple: 'XRP',
  hedera: 'HBAR',
  stellar: 'XLM',
  'jasmy coin': 'JASMY',
  jasmycoin: 'JASMY',
  'wrapped hbar': 'WHBAR',
  'saucerswap': 'SAUCE',
  gigachad: 'GIGA',
  'bit2me': 'B2M',
  elizaos: 'AI16Z', // alias
  'ai16z': 'AI16Z',
  dino: 'DINO',
  velo: 'VELO',
};

function mapNameToSymbol(name: string): string {
  const lower = name.toLowerCase().trim();
  return NAME_TO_SYMBOL[lower] ?? name.toUpperCase().replace(/\s+/g, '');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('🗄️  Parquet Historical Prices Seeder');
  console.log('══════════════════════════════════════════');
  console.log(`📂 Output: ${PARQUET_OUTPUT}`);
  console.log('');

  // Ensure output directory exists
  fs.mkdirSync(PARQUET_OUTPUT, { recursive: true });

  // Create an in-process DuckDB instance for the seeding operation
  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();

  let totalRowsWritten = 0;
  const yearsProcessed = new Set<number>();
  const assetsProcessed = new Set<string>();

  try {
    // -----------------------------------------------------------------------
    // STEP 1: CoinMarketCap CSVs (prices/ and price-usd/)
    // -----------------------------------------------------------------------

    const cmcFiles = [
      ...collectCsvFiles(PRICES_DIR),
      ...collectCsvFiles(PRICE_USD_DIR),
    ];

    console.log(`📄 Found ${cmcFiles.length} CoinMarketCap CSV file(s)`);

    // Create a staging table for CMC data
    await conn.run(`
      CREATE TEMP TABLE cmc_staging (
        date       DATE,
        symbol     VARCHAR,
        open       DECIMAL(38,18),
        high       DECIMAL(38,18),
        low        DECIMAL(38,18),
        close      DECIMAL(38,18),
        volume     DECIMAL(38,18),
        currency   VARCHAR,
        year       INTEGER
      );
    `);

    for (const csvPath of cmcFiles) {
      const filename = path.basename(csvPath);
      console.log(`  ↳ Processing: ${filename}`);

      try {
        // Detect separator (CoinMarketCap exports use semicolons, some use commas)
        const sample = fs.readFileSync(csvPath, 'utf-8').split('\n')[1] ?? '';
        const sep = sample.includes(';') ? ';' : ',';

        // Read CSV using DuckDB's native reader — handles BOM, different encodings
        const rawTable = `_raw_${Date.now()}`;
        await conn.run(`
          CREATE TEMP TABLE "${rawTable}" AS
          SELECT *
          FROM read_csv_auto(
            '${csvPath.replace(/'/g, "''")}',
            delim = '${sep}',
            header = true,
            ignore_errors = true
          );
        `);

        // Discover column names to handle both CMC formats
        const reader = await conn.run(`SELECT * FROM "${rawTable}" LIMIT 0`);
        const columnNames = reader.columnNames().map((c) => c.toLowerCase());

        // Determine the date column
        const dateCol = columnNames.includes('timestamp')
          ? 'timestamp'
          : columnNames.includes('timeclose')
          ? 'timeClose'
          : columnNames.includes('snapped_at')
          ? 'snapped_at'
          : 'date';

        // Determine symbol — use 'name' column if available, else extract from filename
        const hasNameCol = columnNames.includes('name');
        const symbolExpr = hasNameCol
          ? `name`
          : `'${mapNameToSymbol(extractSymbolFromFilename(filename) ?? filename)}'`;

        const closeCol = columnNames.includes('close') ? 'close' : 'price';
        const volumeCol = columnNames.includes('volume') ? 'volume' : 'total_volume';
        const openCol = columnNames.includes('open') ? 'open' : '0';
        const highCol = columnNames.includes('high') ? 'high' : '0';
        const lowCol = columnNames.includes('low') ? 'low' : '0';

        // Insert into staging table
        await conn.run(`
          INSERT INTO cmc_staging
          SELECT
            CAST(TRY_CAST(CAST("${dateCol}" AS VARCHAR) AS DATE) AS DATE) AS date,
            ${hasNameCol ? `'${mapNameToSymbol(extractSymbolFromFilename(filename) ?? '')}'` : `'${mapNameToSymbol(extractSymbolFromFilename(filename) ?? filename)}'`} AS symbol,
            CAST(COALESCE(TRY_CAST(${openCol} AS DECIMAL(38,18)), 0) AS DECIMAL(38,18)) AS open,
            CAST(COALESCE(TRY_CAST(${highCol} AS DECIMAL(38,18)), 0) AS DECIMAL(38,18)) AS high,
            CAST(COALESCE(TRY_CAST(${lowCol} AS DECIMAL(38,18)), 0) AS DECIMAL(38,18)) AS low,
            CAST(COALESCE(TRY_CAST(${closeCol} AS DECIMAL(38,18)), 0) AS DECIMAL(38,18)) AS close,
            CAST(COALESCE(TRY_CAST(${volumeCol} AS DECIMAL(38,18)), 0) AS DECIMAL(38,18)) AS volume,
            'USD' AS currency,
            CAST(YEAR(TRY_CAST(CAST("${dateCol}" AS VARCHAR) AS DATE)) AS INTEGER) AS year
          FROM "${rawTable}"
          WHERE TRY_CAST(CAST("${dateCol}" AS VARCHAR) AS DATE) IS NOT NULL
            AND ${closeCol} IS NOT NULL;
        `);

        await conn.run(`DROP TABLE IF EXISTS "${rawTable}";`);
      } catch (err) {
        console.warn(`    ⚠️  Skipped (parse error): ${filename} — ${err}`);
      }
    }

    // -----------------------------------------------------------------------
    // STEP 2: Oracle backup CSV (backup_market_prices_fiscal.csv)
    // -----------------------------------------------------------------------

    if (fs.existsSync(ORACLE_BACKUP)) {
      console.log(`📄 Processing oracle backup: ${path.basename(ORACLE_BACKUP)}`);

      await conn.run(`
        CREATE TEMP TABLE oracle_staging AS
        SELECT
          CAST(date AS DATE)             AS date,
          symbol,
          CAST(0 AS DECIMAL(38,18))      AS open,
          CAST(0 AS DECIMAL(38,18))      AS high,
          CAST(0 AS DECIMAL(38,18))      AS low,
          CAST(price_usd AS DECIMAL(38,18)) AS close,
          CAST(0 AS DECIMAL(38,18))      AS volume,
          'USD'                          AS currency,
          CAST(YEAR(CAST(date AS DATE)) AS INTEGER) AS year
        FROM read_csv_auto('${ORACLE_BACKUP.replace(/'/g, "''")}', header = true)
        WHERE date IS NOT NULL
          AND price_usd IS NOT NULL;
      `);

      // Merge oracle data into cmc_staging (only insert symbols NOT already covered)
      await conn.run(`
        INSERT INTO cmc_staging
        SELECT date, symbol, open, high, low, close, volume, currency, year
        FROM oracle_staging
        WHERE (date, symbol) NOT IN (SELECT date, symbol FROM cmc_staging);
      `);

      await conn.run(`DROP TABLE IF EXISTS oracle_staging;`);
    }

    // -----------------------------------------------------------------------
    // STEP 3: Deduplicate staging table (keep last close per date+symbol)
    // -----------------------------------------------------------------------

    await conn.run(`
      CREATE TEMP TABLE deduped_staging AS
      SELECT *
      FROM cmc_staging
      QUALIFY ROW_NUMBER() OVER (PARTITION BY date, symbol ORDER BY close DESC) = 1;
    `);

    // Collect stats before writing
    const statsResult = await conn.prepare(`
      SELECT
        COUNT(*) AS total_rows,
        COUNT(DISTINCT year) AS years_count,
        COUNT(DISTINCT symbol) AS assets_count,
        GROUP_CONCAT(DISTINCT CAST(year AS VARCHAR)) AS years_list,
        GROUP_CONCAT(DISTINCT symbol) AS assets_list
      FROM deduped_staging
      WHERE date IS NOT NULL
        AND year IS NOT NULL;
    `);
    const stats = await (await statsResult.run()).getRowObjects();
    const stat = stats[0] as Record<string, unknown>;

    totalRowsWritten = Number(stat?.total_rows ?? 0);
    const yearsStr = String(stat?.years_list ?? '');
    const assetsStr = String(stat?.assets_list ?? '');

    if (yearsStr) yearsStr.split(',').forEach((y) => yearsProcessed.add(parseInt(y)));
    if (assetsStr) assetsStr.split(',').forEach((a) => assetsProcessed.add(a));

    // -----------------------------------------------------------------------
    // STEP 4: COPY to Parquet with year-level Hive partitioning
    // -----------------------------------------------------------------------

    console.log('');
    console.log(`⚡ Writing ${totalRowsWritten} rows to Parquet...`);

    await conn.run(`
      COPY (
        SELECT
          date,
          '' AS asset_id,       -- assetId is not in CSV; populated by IngestDailyPricesUseCase
          symbol,
          open,
          high,
          low,
          close,
          volume,
          currency,
          year
        FROM deduped_staging
        WHERE date IS NOT NULL
          AND year IS NOT NULL
        ORDER BY symbol, date
      ) TO '${PARQUET_OUTPUT}' (FORMAT PARQUET, PARTITION_BY (year), OVERWRITE_OR_IGNORE true);
    `);
  } finally {
    // conn.close() is not required in @duckdb/node-api
  }

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------

  console.log('');
  console.log('✅ Seeding complete!');
  console.log(`   Total rows written : ${totalRowsWritten}`);
  console.log(`   Years covered      : ${[...yearsProcessed].sort().join(', ')}`);
  console.log(`   Assets processed   : ${[...assetsProcessed].sort().join(', ')}`);
  console.log('');
  console.log(`📁 Output: ${PARQUET_OUTPUT}`);
}

main().catch((err) => {
  console.error('❌ Fatal error during Parquet seeding:', err);
  process.exit(1);
});
