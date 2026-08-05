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
import { resolveDataRoot, resolveParquetPricesPath } from '../src/dataPaths.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Output through the shared resolver, so the tree this writes is the one DuckDB federates.
const DATA_ROOT = resolveDataRoot();
const PRICES_DIR = path.join(DATA_ROOT, 'prices_assets', 'prices');
const PRICE_USD_DIR = path.join(DATA_ROOT, 'prices_assets', 'price-usd');
const ORACLE_BACKUP = path.join(
  DATA_ROOT,
  'prices_assets',
  'oracle_backups',
  'backup_market_prices_fiscal.csv',
);
const PARQUET_OUTPUT = resolveParquetPricesPath();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The asset name a price file is for, taken from the part of its name before the date range.
 *
 * Split on `-` as well as `_`: `dino-usd-max-01-01-2025-to-25-03-2026-USD.csv` separates its name with
 * dashes, and matching only up to the first `_` returned the entire filename — which then reached the
 * price series as a ticker literally called
 * `DINO-USD-MAX-01-01-2025-TO-25-03-2026-USD.CSV`, so DINO had no resolvable price at all.
 */
function extractSymbolFromFilename(filename: string): string | null {
  const nameMatch = path.basename(filename, path.extname(filename)).match(/^([^_-]+)/);
  return nameMatch?.[1] ?? null;
}

/**
 * Whether a resolved name is plausibly a ticker.
 *
 * A file whose name this script cannot read must be skipped loudly, not written under an invented
 * symbol: an unresolvable ticker in the series is indistinguishable from an asset nobody holds, so the
 * defect surfaces as a missing price months later rather than as a failed seed now.
 */
function isPlausibleTicker(symbol: string): boolean {
  return /^[A-Z0-9]{1,12}$/.test(symbol);
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

/**
 * Tickers the oracle backup writes under a second name, folded onto the one the ledger uses.
 *
 * Both entries were checked against the file rather than assumed, because folding two genuinely
 * different assets would silently value one at the other's price. `GIGACHAD` matches `GIGA` on all 399
 * shared dates, so they are one series; `PUMP-FUN` is the only name under which the ledger's `PUMP` is
 * priced at all. Deliberately absent: `JASMYNE` disagrees with `JASMY` on all 468 shared dates and
 * `WHBAR` with `HBAR` on all 356, so neither is an alias — wrapped HBAR is its own asset.
 */
const ORACLE_SYMBOL_ALIASES: Record<string, string> = {
  GIGACHAD: 'GIGA',
  'PUMP-FUN': 'PUMP',
};

function oracleSymbolExpr(): string {
  const cases = Object.entries(ORACLE_SYMBOL_ALIASES)
    .map(([from, to]) => `WHEN symbol = '${from}' THEN '${to}'`)
    .join(' ');
  return `CASE ${cases} ELSE symbol END`;
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

        /**
         * From the filename, never the `name` column. Both branches of the ternary this replaces read
         * the filename anyway — the `name` alternative was computed into an unused variable — and the
         * column holds a display name (`Wrapped HBAR`) rather than a ticker, so reading it would put
         * prose in the symbol.
         */
        const resolvedName = extractSymbolFromFilename(filename);
        const symbol = resolvedName === null ? null : mapNameToSymbol(resolvedName);
        if (symbol === null || !isPlausibleTicker(symbol)) {
          console.warn(
            `    ⚠️  Skipped: ${filename} — no ticker could be read from its name` +
              `${symbol === null ? '' : ` (got "${symbol}")`}. Add it to NAME_TO_SYMBOL.`,
          );
          await conn.run(`DROP TABLE IF EXISTS "${rawTable}";`);
          continue;
        }

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
            '${symbol}' AS symbol,
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

      /**
       * The backup states each price in EUR, in USD, or in both, and `currency` is a column of the
       * series precisely so a row can say which. Reading only `price_usd` therefore discarded every
       * asset the oracle priced in euro alone — USDT, USDC, BNB, SOL and PUMP-FUN among them, 1920 rows
       * whose `price_eur` was populated throughout — and those became the ledger's `MISSING_PRICE`
       * lots. A euro price is also the better of the two here: the ledger reports in euro, so it needs
       * no FX conversion and cannot raise `CURRENCY_MISMATCH`.
       *
       * Measured before relying on it: no symbol in the backup mixes the two, so a series never flips
       * denomination mid-stream.
       */
      await conn.run(`
        CREATE TEMP TABLE oracle_staging AS
        SELECT
          CAST(date AS DATE)             AS date,
          ${oracleSymbolExpr()}          AS symbol,
          CAST(0 AS DECIMAL(38,18))      AS open,
          CAST(0 AS DECIMAL(38,18))      AS high,
          CAST(0 AS DECIMAL(38,18))      AS low,
          COALESCE(
            TRY_CAST(price_usd AS DECIMAL(38,18)),
            TRY_CAST(price_eur AS DECIMAL(38,18))
          )                              AS close,
          CAST(0 AS DECIMAL(38,18))      AS volume,
          CASE
            WHEN TRY_CAST(price_usd AS DECIMAL(38,18)) IS NOT NULL THEN 'USD'
            ELSE 'EUR'
          END                            AS currency,
          CAST(YEAR(CAST(date AS DATE)) AS INTEGER) AS year
        FROM read_csv_auto('${ORACLE_BACKUP.replace(/'/g, "''")}', header = true)
        WHERE date IS NOT NULL
          AND COALESCE(
                TRY_CAST(price_usd AS DECIMAL(38,18)),
                TRY_CAST(price_eur AS DECIMAL(38,18))
              ) IS NOT NULL;
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
