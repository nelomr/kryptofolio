import type { DuckDBValue } from '@duckdb/node-api';

/** What `node:sqlite` binds without conversion. Booleans are absent because the driver rejects them. */
type SqliteParam = null | number | bigint | string | NodeJS.ArrayBufferView;

/**
 * Narrows the port's `unknown[]` onto what a driver actually binds.
 *
 * `IDatabasePort` deliberately says `unknown[]` so the domain never names a driver's value union.
 * Casting that straight to the driver's type moves the failure to a native frame with no statement
 * and no parameter index in it; validating here names both.
 */
function reject(value: unknown, context: string, position: string): never {
  throw new TypeError(
    `[${context}] cannot bind parameter at ${position}: ` +
      `${value === undefined ? 'undefined' : typeof value} is not a bindable value`
  );
}

function narrow<T>(
  params: readonly unknown[],
  context: string,
  accepts: (value: unknown) => value is T
): T[] {
  const narrowed: T[] = [];

  for (const [index, value] of params.entries()) {
    if (!accepts(value)) reject(value, context, `index ${index}`);
    narrowed.push(value);
  }

  return narrowed;
}

function isSqliteParam(value: unknown): value is SqliteParam {
  return (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'string' ||
    ArrayBuffer.isView(value)
  );
}

function isDuckDbPrimitive(value: unknown): value is DuckDBValue {
  return (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  );
}

export function toSqliteParams(params: readonly unknown[], context: string): SqliteParam[] {
  return narrow(params, context, isSqliteParam);
}

/**
 * DuckDB's own value union covers far more than these primitives, but everything this codebase
 * binds is a primitive: dates and decimals cross the boundary as TEXT and are cast in SQL.
 */
export function toDuckDbParams(params: readonly unknown[], context: string): DuckDBValue[] {
  return narrow(params, context, isDuckDbPrimitive);
}

/** Single-value form for the Appender, which is called per column and per row. */
export function toDuckDbValue(value: unknown, context: string, column: string): DuckDBValue {
  if (!isDuckDbPrimitive(value)) reject(value, context, `column "${column}"`);
  return value;
}
