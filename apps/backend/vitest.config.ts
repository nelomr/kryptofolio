import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@kryptofolio/backend',
    passWithNoTests: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    /**
     * One DuckDB thread per instance. Vitest runs several files at once and each holds its own
     * in-memory DuckDB, so the default of one thread per core oversubscribes the machine and adds
     * ~30% to every query — measured on `getKpis()` against an empty ledger.
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
     * Several files here build a SQLite ledger and a DuckDB instance and then run a full
     * materialisation twice. The heaviest needs ~3.5 s unloaded and was measured at 5.7 s on a busy
     * machine — starved, not slow, and the default 5 s ceiling turns that into a phantom failure.
     * The hook budget is already 10 s for the same reason.
     */
    testTimeout: 15_000,
    /**
     * Type-level assertions (`expectTypeOf`) compile to nothing, so they pass vacuously unless
     * the file is type-checked. `include` above deliberately does not match `*.spec-d.ts`;
     * this block is what makes those assertions real during `vitest run --typecheck`.
     */
    typecheck: {
      include: ['src/**/*.spec-d.ts'],
    },
  },
});
