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
     * materialisation twice. They are starved rather than slow: two workers share the machine, so a
     * test's wall-clock grows with the number of files in the suite, not with its own work.
     *
     * Re-measured after the suite grew from 45 files to 60. The heaviest reconciliation tests were
     * observed at 14.3 s, 17.4 s and 18.8 s in a full run, against a ceiling of 15 s — which turned
     * a green suite into three phantom failures in one run out of three, while the same tests passed
     * in isolation at a fraction of that. A ceiling that close to the observed worst case is not a
     * timeout, it is a coin toss.
     *
     * 40 s is a little over twice the worst case measured, deliberately: this number exists to catch
     * a test that has genuinely hung, and every second below that is a second of false failures on a
     * busy machine or a slower CI runner. Raise it again rather than tightening it if the suite grows.
     */
    testTimeout: 40_000,
    /**
     * The same reasoning for the fixtures. Most of the cost in these files is in `beforeEach` —
     * migrations, a DuckDB instance and a full materialisation — so the hook needs the same headroom
     * as the test body, and the 10 s default is below what the setup alone was measured to take.
     */
    hookTimeout: 40_000,
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
