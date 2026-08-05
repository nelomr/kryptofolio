import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Every suite here gets its own empty Parquet price tree.
 *
 * The path used to be resolved from `process.cwd()`, so a test run happened to land on an empty
 * directory under `packages/database/` and the suites came to rely on `historical_prices` being
 * empty without ever saying so. Once the path resolved correctly the same suites read the seeded
 * production tree — and `DuckDbAdapter.initialize()` would have written its 1970 sentinel into it.
 * A per-worker temp directory states the intent instead of inheriting it from the environment.
 */
const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'kryptofolio-prices-'));
process.env.PARQUET_DATA_PATH = tree;

export function teardown(): void {
  fs.rmSync(tree, { recursive: true, force: true });
}
