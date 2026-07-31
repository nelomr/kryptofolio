import { describe, it, expect } from 'vitest';
import { toSqliteParams, toDuckDbParams, toDuckDbValue } from '../src/adapters/sqlParams.js';

/**
 * `IDatabasePort` accepts `unknown[]` so the domain never names a driver's value union. The two
 * adapters used to bridge that with `params as any[]`, which let an object or an undefined through
 * to the driver and surfaced as an opaque native error several frames away from the caller.
 *
 * The two drivers do not accept the same set: `node:sqlite` binds ArrayBufferViews but not
 * booleans, DuckDB the reverse. Narrowing them apart is what makes the difference visible.
 */

describe('toSqliteParams', () => {
  it('passes through the value types node:sqlite binds natively', () => {
    const params = ['XRP', 179.11, 42n, null];
    expect(toSqliteParams(params, 'test')).toEqual(params);
  });

  it('accepts a Uint8Array, which binds as a BLOB', () => {
    const blob = new Uint8Array([1, 2, 3]);
    expect(toSqliteParams([blob], 'test')).toEqual([blob]);
  });

  it('rejects a boolean, which node:sqlite cannot bind', () => {
    // Silently coercing to 0/1 would make `is_synthetic = ?` match rows the caller did not mean.
    expect(() => toSqliteParams([true], 'test')).toThrow(/index 0/);
  });

  it('returns an empty array unchanged', () => {
    expect(toSqliteParams([], 'test')).toEqual([]);
  });

  it('preserves order', () => {
    expect(toSqliteParams(['a', 1, null], 'test')).toEqual(['a', 1, null]);
  });

  it('rejects undefined instead of binding it as NULL', () => {
    expect(() => toSqliteParams([undefined], 'test')).toThrow(/undefined/);
  });

  it('rejects a plain object', () => {
    expect(() => toSqliteParams([{ amount: '1' }], 'test')).toThrow(/index 0/);
  });

  it('rejects a Decimal-like object rather than stringifying it silently', () => {
    // Monetary values must be converted to TEXT by the caller; guessing here would hide a bug in
    // the anti-corruption layer.
    const decimalLike = { toString: () => '179.11', isNegative: () => false };
    expect(() => toSqliteParams([decimalLike], 'test')).toThrow(/index 0/);
  });

  it('names the offending index, not just the first parameter', () => {
    expect(() => toSqliteParams(['ok', 1, undefined], 'test')).toThrow(/index 2/);
  });

  it('names the caller so the failure points at the query, not at the helper', () => {
    expect(() => toSqliteParams([undefined], 'getSpotTransactions')).toThrow(
      /getSpotTransactions/
    );
  });
});

describe('toDuckDbParams', () => {
  it('passes through the value types DuckDB binds natively, booleans included', () => {
    const params = ['XRP', 179.11, 42n, null, true];
    expect(toDuckDbParams(params, 'test')).toEqual(params);
  });

  it('rejects a Uint8Array, which DuckDB needs wrapped as a blob value', () => {
    expect(() => toDuckDbParams([new Uint8Array([1])], 'test')).toThrow(/index 0/);
  });

  it('rejects undefined', () => {
    expect(() => toDuckDbParams([undefined], 'test')).toThrow(/undefined/);
  });

  it('rejects a plain object', () => {
    expect(() => toDuckDbParams([{ a: 1 }], 'test')).toThrow(/index 0/);
  });

  it('names the caller and the index', () => {
    expect(() => toDuckDbParams(['ok', {}], 'queryMany')).toThrow(/queryMany.*index 1/s);
  });
});

describe('toDuckDbValue', () => {
  it('passes a primitive through', () => {
    expect(toDuckDbValue('179.11', 'bulkInsert', 'amount')).toBe('179.11');
  });

  it('names the column so a bad row is traceable to its field', () => {
    expect(() => toDuckDbValue({}, 'bulkInsert', 'total_fiat')).toThrow(/column "total_fiat"/);
  });

  it('rejects a Date, which must reach DuckDB as TEXT', () => {
    expect(() => toDuckDbValue(new Date(0), 'bulkInsert', 'timestamp')).toThrow(/timestamp/);
  });
});
