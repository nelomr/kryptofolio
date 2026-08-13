import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { SQLiteLedgerAdapter } from '../SQLiteLedgerAdapter.js';
import type { DailyExchangeRate } from '../../../domain/ports/IFxRateLedgerPort.js';

function published(date: string, rate: string, pair = 'USD/EUR'): DailyExchangeRate {
  return { date, pair, rate, source: 'ECB' };
}

function carriedForward(date: string, rate: string, pair = 'USD/EUR'): DailyExchangeRate {
  return { date, pair, rate, source: 'ECB_PRIOR_DAY' };
}

describe('SQLiteLedgerAdapter — the FX rate ledger', () => {
  let db: DatabaseSync;
  let adapter: SQLiteLedgerAdapter;

  beforeEach(async () => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    adapter = new SQLiteLedgerAdapter(db);
    await adapter.initialize();
  });

  afterEach(() => {
    db.close();
  });

  function storedRows(): DailyExchangeRate[] {
    return db
      .prepare('SELECT date, pair, rate, source FROM exchange_rates ORDER BY pair, date')
      .all() as unknown as DailyExchangeRate[];
  }

  describe('getRateAsOf', () => {
    it('returns the most recent row on or before the requested date', async () => {
      await adapter.upsertDailyExchangeRates([
        published('2025-04-16', '0.88'),
        published('2025-04-17', '0.89'),
        published('2025-04-22', '0.90'),
      ]);

      // A Sunday resolves the preceding Thursday's publication, not the following Tuesday's.
      expect(await adapter.getRateAsOf('USD/EUR', '2025-04-20')).toEqual(
        published('2025-04-17', '0.89'),
      );
    });

    it('returns the row itself when one is published on the requested date', async () => {
      await adapter.upsertDailyExchangeRates([published('2025-04-17', '0.89')]);

      expect(await adapter.getRateAsOf('USD/EUR', '2025-04-17')).toEqual(
        published('2025-04-17', '0.89'),
      );
    });

    it('returns nothing where only later rows exist', async () => {
      await adapter.upsertDailyExchangeRates([published('2025-04-17', '0.89')]);

      expect(await adapter.getRateAsOf('USD/EUR', '2025-04-16')).toBeNull();
    });

    it('never resolves across pairs', async () => {
      await adapter.upsertDailyExchangeRates([published('2025-04-17', '0.89', 'USD/EUR')]);

      expect(await adapter.getRateAsOf('GBP/EUR', '2025-04-20')).toBeNull();
    });
  });

  describe('getStoredRateDates', () => {
    beforeEach(async () => {
      await adapter.upsertDailyExchangeRates([
        published('2025-04-16', '0.88'),
        published('2025-04-17', '0.89'),
        published('2025-04-22', '0.90'),
        published('2025-04-23', '0.91', 'GBP/EUR'),
      ]);
    });

    it('reports the dates held for the pair, ascending, bounded inclusively by the range', async () => {
      expect(
        await adapter.getStoredRateDates({ pair: 'USD/EUR', from: '2025-04-17', to: '2025-04-22' }),
      ).toEqual(['2025-04-17', '2025-04-22']);
    });

    it('reports only the requested pair', async () => {
      expect(
        await adapter.getStoredRateDates({ pair: 'GBP/EUR', from: '2025-04-01', to: '2025-04-30' }),
      ).toEqual(['2025-04-23']);
    });

    it('reports nothing for a range it holds nothing in', async () => {
      expect(
        await adapter.getStoredRateDates({ pair: 'USD/EUR', from: '2024-01-01', to: '2024-12-31' }),
      ).toEqual([]);
    });
  });

  describe('write precedence', () => {
    it('replaces a carried-forward row with the rate the ECB actually published', async () => {
      await adapter.upsertDailyExchangeRates([carriedForward('2025-04-22', '0.89')]);

      const written = await adapter.upsertDailyExchangeRates([published('2025-04-22', '0.9012')]);

      expect(written).toBe(1);
      expect(storedRows()).toEqual([published('2025-04-22', '0.9012')]);
    });

    it('never rewrites a published rate, even where the incoming rate differs', async () => {
      await adapter.upsertDailyExchangeRates([published('2025-04-22', '0.9012')]);

      const written = await adapter.upsertDailyExchangeRates([published('2025-04-22', '0.7777')]);

      expect(written).toBe(0);
      expect(storedRows()).toEqual([published('2025-04-22', '0.9012')]);
    });

    it('never downgrades a published rate to a carried-forward one', async () => {
      await adapter.upsertDailyExchangeRates([published('2025-04-22', '0.9012')]);

      const written = await adapter.upsertDailyExchangeRates([carriedForward('2025-04-22', '0.85')]);

      expect(written).toBe(0);
      expect(storedRows()).toEqual([published('2025-04-22', '0.9012')]);
    });

    it('is a no-op when a carried-forward row is presented again', async () => {
      await adapter.upsertDailyExchangeRates([carriedForward('2025-04-22', '0.89')]);

      const written = await adapter.upsertDailyExchangeRates([carriedForward('2025-04-22', '0.85')]);

      expect(written).toBe(0);
      expect(storedRows()).toEqual([carriedForward('2025-04-22', '0.89')]);
    });

    it('counts only the rows it actually wrote across a mixed batch', async () => {
      await adapter.upsertDailyExchangeRates([
        carriedForward('2025-04-22', '0.89'),
        published('2025-04-23', '0.90'),
      ]);

      const written = await adapter.upsertDailyExchangeRates([
        published('2025-04-22', '0.9012'),
        published('2025-04-23', '0.7777'),
        published('2025-04-24', '0.91'),
      ]);

      expect(written).toBe(2);
      expect(storedRows()).toEqual([
        published('2025-04-22', '0.9012'),
        published('2025-04-23', '0.90'),
        published('2025-04-24', '0.91'),
      ]);
    });

    it('resolves precedence per pair, never across them', async () => {
      await adapter.upsertDailyExchangeRates([published('2025-04-22', '0.9012', 'USD/EUR')]);

      const written = await adapter.upsertDailyExchangeRates([
        published('2025-04-22', '0.85', 'GBP/EUR'),
      ]);

      expect(written).toBe(1);
      expect(storedRows()).toEqual([
        published('2025-04-22', '0.85', 'GBP/EUR'),
        published('2025-04-22', '0.9012', 'USD/EUR'),
      ]);
    });
  });

  describe('provenance', () => {
    function storeUnattributed(date: string, source: string): void {
      db.prepare('INSERT INTO exchange_rates (date, pair, rate, source) VALUES (?, ?, ?, ?)').run(
        date,
        'USD/EUR',
        '0.89',
        source,
      );
    }

    it('refuses a row whose source is outside the two the port defines, naming the value', async () => {
      storeUnattributed('2025-04-17', 'manual');

      await expect(adapter.getRateAsOf('USD/EUR', '2025-04-17')).rejects.toThrow(/manual/);
    });

    it('never reads an unattributed row as a published ECB rate', async () => {
      storeUnattributed('2025-04-17', 'manual');

      const read = await adapter.getRateAsOf('USD/EUR', '2025-04-17').catch(() => null);

      expect(read).toBeNull();
    });
  });

  describe('batch durability', () => {
    it('writes a whole batch inside one nestable transaction rather than a commit per row', async () => {
      const executed: string[] = [];
      const recording = new Proxy(db, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver) as unknown;
          if (property === 'exec' && typeof value === 'function') {
            return (sql: string) => {
              executed.push(sql);
              return (value as (s: string) => unknown).call(target, sql);
            };
          }
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });

      const recordingAdapter = new SQLiteLedgerAdapter(recording);
      await recordingAdapter.upsertDailyExchangeRates([
        published('2025-04-22', '0.90'),
        published('2025-04-23', '0.91'),
      ]);

      // A SAVEPOINT rather than BEGIN: a backfill may already be inside a transaction, and SQLite
      // refuses a nested BEGIN outright.
      expect(executed.some((sql) => sql.startsWith('SAVEPOINT'))).toBe(true);
      expect(executed.some((sql) => sql.startsWith('RELEASE'))).toBe(true);
      expect(storedRows()).toHaveLength(2);
    });

    it('writes nothing at all when a row in the batch is rejected', async () => {
      await adapter.upsertDailyExchangeRates([published('2025-04-22', '0.90')]);

      const rejected: readonly DailyExchangeRate[] = [
        published('2025-04-23', '0.91'),
        // `date` is NOT NULL in a STRICT table, so this row cannot be stored and the statement throws.
        { date: null as unknown as string, pair: 'USD/EUR', rate: '0.92', source: 'ECB' },
      ];

      await expect(adapter.upsertDailyExchangeRates(rejected)).rejects.toThrow();

      expect(storedRows()).toEqual([published('2025-04-22', '0.90')]);
    });
  });
});
