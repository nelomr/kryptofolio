import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { declaredFieldNames, numberFields } from '../../__tests__/support/zodSchemaWalk.js';

const toolsDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const toolFiles = readdirSync(toolsDir)
  .filter((f) => f.endsWith('Tool.ts'))
  .map((f) => join(toolsDir, f));

const BANNED_PORT_IMPORTS = ['ILedgerPort', 'ITaxCalculatorPort', 'IDatabasePort', 'DuckDB', 'duckdb'];
const WRITE_METHOD_PATTERN = /\.(insert|update|delete|save|write)\(/;

async function buildAllTools() {
  const { buildImplementedTools } = await import('../index.js');
  const useCases = {
    portfolioSummary: {
      execute: async () => ({
        metrics: {
          rates_incomplete: false,
          prices_incomplete: false,
          total_equity_fiat: '0.00',
          total_cost_basis_fiat: '0.00',
          total_realized_pnl_fiat: '0.00',
          total_unrealized_pnl_fiat: '0.00',
          total_pnl_fiat: '0.00',
          currency: 'EUR',
        },
        holdings: [],
      }),
    },
    fiscalIntegrity: { execute: async () => ({ groups: [], totalDefects: 0, pendingReview: 0, needsRecalculation: false }) },
    tokenHistory: { execute: async () => ({ lots: [], history: {}, relocations: {} }) },
    assetAllocation: { execute: async () => [] },
    riskMetrics: {
      execute: async () => ({
        maxDrawdownPct: '0',
        annualizedVolatility: '0',
        sharpeRatio: '0',
        alpha: '0',
        beta: '0',
        currency: 'EUR',
      }),
    },
    kpis: {
      execute: async () => ({
        ratesIncomplete: false,
        pricesIncomplete: false,
        totalEquity: '0.00',
        totalCostBasis: '0.00',
        totalUnrealizedPnl: '0.00',
        totalRealizedPnl: '0.00',
        allTimeHigh: '0.00',
        maxDrawdownPct: '0',
        annualizedVolatility: '0',
        sharpeRatio: '0',
        currency: 'EUR',
      }),
    },
    drawdownCurve: { execute: async () => [] },
    performanceHistory: { execute: async () => [] },
    volatilityHeatmap: { execute: async () => [] },
    spanishTaxReport: {
      execute: async () => ({
        year: 2024,
        method: 'FIFO',
        currency: 'EUR',
        conversion: { kind: 'NATIVE' as const },
        unconvertibleEvents: [],
        spotCapitalGains: '0',
        savingsBaseYields: '0',
        generalBaseAirdrops: '0',
        summary: {
          capital_gains: '0',
          capital_losses: '0',
          savings_base_yields: '0',
          general_base_airdrops: '0',
          net_patrimonial_result: '0',
          estimated_irpf: '0',
        },
        excludedFlaggedEvents: 0,
        excludedUnresolvedIncomeCount: 0,
        manuallyAssignedCount: 0,
        audit_trail: [],
      }),
    },
    priceHistory: { getLatest: async () => null, getTrackedSymbols: async () => [] },
    fiscalIntegrityRows: {
      execute: async () => ({ groups: [], totalDefects: 0, pendingReview: 0, needsRecalculation: false }),
    },
    tokenLots: { execute: async () => ({ lots: [], history: {}, relocations: {} }) },
  };
  const configs = {
    portfolioSummary: { topNHoldings: 15, maxChars: 4000 },
    fiscalIntegrity: { maxChars: 6000 },
    tokenHistory: { lotsPageSize: 20, maxChars: 6000 },
    assetAllocation: { topNHoldings: 15, maxChars: 3000 },
    riskMetrics: { maxChars: 1500 },
    kpis: { maxChars: 3000 },
    drawdownCurve: { maxChars: 4000 },
    performanceHistory: { maxChars: 4000 },
    volatilityHeatmap: { maxChars: 4000 },
    spanishTaxReport: { maxChars: 5000 },
    livePrices: { maxChars: 2000, currency: 'EUR' },
    fiscalIntegrityRows: { rowsPageSize: 25, maxChars: 4000 },
    tokenLots: { lotsPageSize: 20, maxChars: 4000 },
  };

  return buildImplementedTools(useCases, configs);
}

describe('read-only tool catalogue surface', () => {
  it('each tool file depends only on its wrapped use case plus pure configuration — no low-level port or DuckDB connection', () => {
    expect(toolFiles.length).toBeGreaterThan(0);

    for (const file of toolFiles) {
      const source = readFileSync(file, 'utf-8');
      for (const banned of BANNED_PORT_IMPORTS) {
        expect(source, `${file} must not reference ${banned}`).not.toContain(banned);
      }
    }
  });

  it('the registered tool set is exactly the thirteen names in ADVISOR_TOOL_NAMES', async () => {
    const { ADVISOR_TOOL_NAMES } = await import('@kryptofolio/shared-types');
    const tools = await buildAllTools();

    expect(Object.keys(tools)).toHaveLength(ADVISOR_TOOL_NAMES.length);
    expect(new Set(Object.keys(tools))).toEqual(new Set(ADVISOR_TOOL_NAMES));
  });

  it('no tool file performs an insert, update, or delete', () => {
    for (const file of toolFiles) {
      const source = readFileSync(file, 'utf-8');
      expect(WRITE_METHOD_PATTERN.test(source), `${file} must not call a write/mutation method`).toBe(false);
    }
  });
});

describe('input and output contracts across the whole catalogue', () => {
  async function schemasByTool() {
    const tools = await buildAllTools();
    return Object.entries(tools).map(([name, tool]) => {
      const { inputSchema, outputSchema } = tool;
      if (!(inputSchema instanceof z.ZodType) || !(outputSchema instanceof z.ZodType)) {
        throw new Error(`${name} does not declare Zod schemas`);
      }
      return { name, input: inputSchema, output: outputSchema };
    });
  }

  const FORBIDDEN_CURRENCY_FIELDS = ['targetCurrency', 'currency', 'livePrices'];
  const ANALYTICS_TOOLS = ['asset_allocation', 'risk_metrics', 'drawdown_curve', 'performance_history', 'kpis', 'volatility_heatmap'];
  const PERCENT_OR_RATIO_FIELDS = ['allocationPct', 'roiPct', 'winRatePercent', 'averageR', 'totalRoiPercent'];

  it('no tool inputSchema declares a targetCurrency, currency or livePrices field', async () => {
    const tools = await schemasByTool();

    expect(tools).toHaveLength(13);
    for (const { name, input } of tools) {
      const declared = declaredFieldNames(input);
      for (const forbidden of FORBIDDEN_CURRENCY_FIELDS) {
        expect(declared, `${name} must not declare ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('none of asset_allocation, risk_metrics, drawdown_curve, performance_history, kpis and volatility_heatmap declares an accountId', async () => {
    const tools = (await schemasByTool()).filter((t) => ANALYTICS_TOOLS.includes(t.name));

    expect(tools.map((t) => t.name).sort()).toEqual([...ANALYTICS_TOOLS].sort());
    for (const { name, input } of tools) {
      expect(declaredFieldNames(input), `${name} must not declare accountId`).not.toContain('accountId');
    }
  });

  it('the field scan sees a forbidden field at any depth and in any wrapper', () => {
    const nested = z.object({ filter: z.array(z.object({ currency: z.string().optional() })).optional() }).strict();

    expect(declaredFieldNames(nested)).toContain('currency');
    expect(declaredFieldNames(z.object({ symbols: z.array(z.string()) }).strict())).not.toContain('currency');
  });

  it('every number-typed outputSchema field is an integer, except the named percentage and ratio fields of kpis', async () => {
    const tools = await schemasByTool();
    const all = tools.flatMap(({ name, output }) => numberFields(output).map((field) => ({ name, ...field })));

    expect(all.length).toBeGreaterThan(30);
    const nonInteger = all.filter((field) => !field.isInt);
    expect(nonInteger.every((field) => field.name === 'kpis')).toBe(true);
    expect(nonInteger.length).toBeGreaterThan(0);
    expect(nonInteger.every((field) => PERCENT_OR_RATIO_FIELDS.some((f) => field.path.endsWith(f)))).toBe(true);
  });

  it('the number scan flags a non-integer z.number() inside a union, an array and an optional', () => {
    const schema = z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('ok'), rows: z.array(z.object({ price: z.number().optional(), count: z.number().int() })) }),
      z.object({ kind: z.literal('truncated') }),
    ]);

    expect(numberFields(schema)).toEqual([
      { path: 'rows[].price', isInt: false },
      { path: 'rows[].count', isInt: true },
    ]);
  });
});
