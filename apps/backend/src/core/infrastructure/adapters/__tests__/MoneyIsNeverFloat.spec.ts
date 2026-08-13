/**
 * A monetary amount is never born of a multiplication or a sum evaluated in floating
 * point. Where the engine forces a division, the result is bounded explicitly and is
 * never used as a cost basis.
 *
 * This is a source guard rather than a behavioural test, and deliberately so. The
 * KPI figures are rounded to two decimal places before they leave the adapter, and
 * the FIFO views bound intermediate products at DECIMAL(38,30) — eight integer
 * digits. Between those two limits there is no cost basis large enough for a DOUBLE
 * product to lose the cent yet small enough to survive the views, so a runtime
 * assertion on `getKpis` cannot distinguish the two arithmetics at all. A test that
 * cannot fail is not evidence, so the rule is asserted where it is actually legible.
 *
 * `DuckDbPortfolioAnalyticsAdapter` is covered behaviourally as well, in
 * `HoldingsDecimalExactness.spec.ts` — it returns full-scale decimal strings, so
 * there the difference is directly observable.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ADAPTERS = ['DuckDbPortfolioAnalyticsAdapter.ts', 'DuckDbMetricsAdapter.ts'];

/** Column names that carry money. `*_qty` is a quantity and is not one of them. */
const MONEY_COLUMNS = [
  'unit_cost_fiat',
  'total_cost_fiat',
  'cost_fiat',
  'gain_loss_fiat',
  'pnl_fiat',
  'fee_fiat',
  'sale_price_fiat',
  'current_value_fiat',
  'daily_value',
  'realized_pnl',
  'funding_amount',
  'fee_amount',
];

/**
 * The one money expression the engine forces onto DOUBLE.
 *
 * `avg_unit_cost = total_cost_fiat / total_qty`. DECIMAL / DECIMAL returns DOUBLE in
 * DuckDB and cannot be made exact, so it is bounded at twelve places by PRINTF
 * instead. It is a display figure: the basis that matters is `total_cost_fiat`,
 * which is exact, and nothing derives a cost basis or a tax figure from this column.
 */
const ENGINE_FORCED = [
  "PRINTF('%.12f', CAST(h.total_cost_fiat AS DOUBLE) / CAST(h.total_qty AS DOUBLE))",
];

function source(file: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', file), 'utf-8');
}

/** Comments name these columns while explaining them; scanning prose would report itself. */
function strippedSource(file: string): string {
  return source(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');
}

describe('money is never a float', () => {
  it.each(ADAPTERS)('%s casts no money column to DOUBLE outside the forced division', (file) => {
    let sql = strippedSource(file);
    for (const forced of ENGINE_FORCED) sql = sql.split(forced).join('<<ENGINE_FORCED>>');

    const offenders = MONEY_COLUMNS.filter((column) =>
      new RegExp(`CAST\\s*\\(\\s*[\\w.]*\\b${column}\\b\\s+AS\\s+DOUBLE\\s*\\)`).test(sql),
    );

    expect(offenders).toEqual([]);
  });

  it('still casts the price series to DECIMAL where it is multiplied into a value', () => {
    // `close` is a price, and a price multiplied by a quantity is money. Left as
    // DOUBLE it puts the money back into floating point one join later.
    for (const file of ADAPTERS) {
      expect(strippedSource(file)).not.toMatch(/CAST\s*\(\s*(lp\.)?close\s+AS\s+DOUBLE\s*\)/);
    }
  });

  it('proves the scan would catch a reintroduced DOUBLE cast', () => {
    // Without this the assertions above pass just as well against a broken regex.
    const probe = (sql: string) =>
      MONEY_COLUMNS.filter((column) =>
        new RegExp(`CAST\\s*\\(\\s*[\\w.]*\\b${column}\\b\\s+AS\\s+DOUBLE\\s*\\)`).test(sql),
      );

    expect(probe('SUM(CAST(l.unit_cost_fiat AS DOUBLE))')).toEqual(['unit_cost_fiat']);
    expect(probe('SUM(CAST(l.unit_cost_fiat AS DECIMAL(26,12)))')).toEqual([]);
    expect(probe('CAST(gain_loss_fiat AS DOUBLE)')).toEqual(['gain_loss_fiat']);
  });

  it('keeps the engine-forced division present and documented', () => {
    // If this expression is ever made exact, the allowlist above must shrink rather
    // than quietly keep sanctioning a DOUBLE that is no longer forced.
    const analytics = source('DuckDbPortfolioAnalyticsAdapter.ts');
    expect(analytics).toContain(ENGINE_FORCED[0]);
    expect(analytics).toMatch(/DECIMAL \/ DECIMAL returns DOUBLE/);
  });
});
