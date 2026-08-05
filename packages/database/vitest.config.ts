import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@kryptofolio/database',
    passWithNoTests: true,
    environment: 'node',
    setupFiles: ['./tests/setup/isolateParquetTree.ts'],
    /**
     * One DuckDB thread per instance. Several test files run at once and each holds its own
     * in-memory DuckDB, so the default of one thread per core oversubscribes the machine several
     * times over and every query pays the scheduling for it.
     */
    env: {
      DUCKDB_THREADS: '1',
    },
    /**
     * These are integration tests: each file builds a SQLite ledger and its own in-memory DuckDB.
     * Four of them at once on a machine that is already busy makes every query several times slower
     * and pushes the heaviest tests past the default 5 s limit — the tests are not slow, they are
     * starved. Two workers keeps them comfortably inside it.
     */
    maxWorkers: 2,
    minWorkers: 1,
    /**
     * The same budget `apps/backend` already carries, for the same measured reason. `maxWorkers: 2`
     * bounds this package's own load but not the machine's: under `turbo run test` five packages run
     * at once, and the heaviest custody suites then exceed the default 5 s ceiling while passing
     * comfortably when the package runs alone. That is starvation reported as failure.
     */
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
