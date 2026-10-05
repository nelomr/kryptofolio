import { basename } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  ADVISOR_OWNED_FILES,
  AI_SUBTREE_ROOT,
  displayPath,
  findAnyEscapes,
  findCalls,
  findConstructions,
  findMoneyImports,
  findMonetaryOperations,
  findTypeAssertions,
  findNumericCoercion,
  findOrderingSqlAndTaxImports,
  productionSourcesUnder,
  readSource,
  type Violation,
} from './support/advisorSourceScan.js';

const aiSources = productionSourcesUnder(AI_SUBTREE_ROOT);

function offendersIn(files: readonly string[], scan: (source: string) => Violation[]): string[] {
  return files.flatMap((file) => scan(readSource(file)).map((v) => `${displayPath(file)}:${v.line} ${v.rule}`));
}

describe('AI subtree source scan', () => {
  it('scans the real subtree, not an empty or truncated listing', () => {
    expect(aiSources.length).toBeGreaterThan(30);
    expect(aiSources.map(displayPath)).toEqual(
      expect.arrayContaining([
        'infrastructure/ai/MastraAdvisorAdapter.ts',
        'infrastructure/ai/tools/portfolioSummaryTool.ts',
        'infrastructure/ai/tools/livePricesTool.ts',
      ]),
    );
  });

  describe('numeric coercion of money', () => {
    it('finds no Number(, parseFloat, toFixed, Intl.NumberFormat or decimal.js in the AI subtree', () => {
      expect(offendersIn(aiSources, findNumericCoercion)).toEqual([]);
    });

    it.each([
      ['Number(', 'const a = Number(x);', 'Number('],
      ['new Number(', 'const a = new Number(x);', 'Number('],
      ['parseFloat', 'const a = parseFloat(x);', 'parseFloat'],
      ['a method reference to toFixed', 'const a = x.toFixed(2);', 'toFixed'],
      ['Intl.NumberFormat', 'const f = new Intl.NumberFormat("en");', 'Intl.NumberFormat'],
      ['a decimal.js import', 'import Decimal from "decimal.js";', 'decimal.js'],
      ['a dynamic decimal.js import', 'const d = await import("decimal.js");', 'decimal.js'],
    ])('detects %s', (_label, source, rule) => {
      expect(findNumericCoercion(source).map((v) => v.rule)).toContain(rule);
    });

    it('ignores the same tokens inside comments and string literals', () => {
      const source = [
        '// Number(x), parseFloat(x), x.toFixed(2), Intl.NumberFormat, decimal.js',
        '/* Number(x) parseFloat toFixed */',
        'const note = "Number( parseFloat toFixed Intl.NumberFormat decimal.js";',
        'const ok = Number.isInteger(1);',
      ].join('\n');
      expect(findNumericCoercion(source)).toEqual([]);
    });
  });

  describe('type-safety escapes', () => {
    it('finds no `: any`, `as any`, `<any>`, `, any>` or `as never` in the AI subtree and the adapter', () => {
      expect(offendersIn(aiSources, findAnyEscapes)).toEqual([]);
    });

    it.each([
      ['a `: any` annotation', 'const a: any = 1;'],
      ['`as any`', 'const a = b as any;'],
      ['`<any>`', 'const a = <any>b;'],
      ['`, any>`', 'const a: Record<string, any> = {};'],
      ['`as never`', 'const a = b as never;'],
    ])('detects %s', (_label, source) => {
      expect(findAnyEscapes(source)).not.toEqual([]);
    });

    it('ignores the same text inside comments and string literals', () => {
      const source = [
        '// const a: any = b as any; <any>; Record<string, any>; as never',
        'const note = ": any as any <any> , any> as never";',
      ].join('\n');
      expect(findAnyEscapes(source)).toEqual([]);
    });
  });

  describe('Money stays out of the AI subtree', () => {
    it('imports neither Money nor decimal.js anywhere in the AI subtree', () => {
      expect(offendersIn(aiSources, findMoneyImports)).toEqual([]);
    });

    const SCENARIO_TOOLS = [
      'infrastructure/ai/tools/scenarioPositionValueTool.ts',
      'infrastructure/ai/tools/breakevenPriceTool.ts',
      'infrastructure/ai/tools/scenarioPortfolioShockTool.ts',
      'infrastructure/ai/tools/concentrationRiskTool.ts',
    ];

    it('scans the four scenario tools and finds no Money, decimal.js, coercion or monetary arithmetic in them', () => {
      const scenarioFiles = aiSources.filter((file) => SCENARIO_TOOLS.includes(displayPath(file)));

      expect(scenarioFiles.map(displayPath).sort()).toEqual([...SCENARIO_TOOLS].sort());
      expect(offendersIn(scenarioFiles, findMoneyImports)).toEqual([]);
      expect(offendersIn(scenarioFiles, findNumericCoercion)).toEqual([]);
      expect(offendersIn(scenarioFiles, findMonetaryOperations)).toEqual([]);
    });

    it.each([
      ['a named import from core-domain', 'import { Money } from "@kryptofolio/core-domain";'],
      ['an aliased import', 'import { rankHoldingsByValue, Money as M } from "@kryptofolio/core-domain";'],
      ['a type-only import', 'import type { Money } from "@kryptofolio/core-domain";'],
      ['a direct value-object import', 'import { Money } from "../../../../../packages/core-domain/src/value-objects/Money";'],
      ['a decimal.js import', 'import Decimal from "decimal.js";'],
    ])('detects %s', (_label, source) => {
      expect(findMoneyImports(source)).not.toEqual([]);
    });

    it('allows the pure core-domain functions that do the arithmetic on the AI subtree\'s behalf', () => {
      expect(
        findMoneyImports('import { rankHoldingsByValue, compareTaxSummaries } from "@kryptofolio/core-domain";'),
      ).toEqual([]);
    });
  });

  describe('custody and tax orderings', () => {
    const advisorOwned = [...aiSources, ...ADVISOR_OWNED_FILES];

    it('writes no PARTITION BY or ORDER BY clause and imports no FIFO, custody or DuckDB module anywhere the advisor owns', () => {
      expect(offendersIn(advisorOwned, findOrderingSqlAndTaxImports)).toEqual([]);
    });

    it.each([
      ['a PARTITION BY clause', 'const q = "SELECT sum(x) OVER (PARTITION BY asset_id) FROM t";'],
      ['an ORDER BY clause in a template', 'const q = `SELECT * FROM t ORDER BY ${col}`;'],
      ['a FIFO materializer import', 'import { m } from "../../application/services/FifoMaterializer.js";'],
      ['a DuckDB adapter import', 'import { a } from "../adapters/DuckDbMetricsAdapter.js";'],
    ])('detects %s', (_label, source) => {
      expect(findOrderingSqlAndTaxImports(source)).not.toEqual([]);
    });

    it('allows only the custody lookup use case and its tool, and still rejects any other custody module', () => {
      expect(
        findOrderingSqlAndTaxImports('import { u } from "../../../application/use-cases/GetLotCustodyLocationsUseCase.js";'),
      ).toEqual([]);
      expect(findOrderingSqlAndTaxImports('import { t } from "./custodyLocationsTool.js";')).toEqual([]);
      expect(findOrderingSqlAndTaxImports('import { c } from "../adapters/CustodyLedgerAdapter.js";')).not.toEqual([]);
      expect(findOrderingSqlAndTaxImports('import { c } from "./notCustodyLocationsTool.js";')).not.toEqual([]);
    });

    it('ignores a comment that merely names a clause', () => {
      expect(findOrderingSqlAndTaxImports('// ORDER BY timestamp, PARTITION BY asset_id\nconst a = 1;')).toEqual([]);
    });
  });
  describe('monetary comparison, sorting and arithmetic', () => {
    it('finds none anywhere in the AI subtree', () => {
      expect(offendersIn(aiSources, findMonetaryOperations)).toEqual([]);
    });

    it.each([
      ['a sort', 'rows.sort((a, b) => 0);', '.sort('],
      ['a toSorted', 'const r = rows.toSorted();', '.toSorted('],
      ['a comparison of values', 'const big = a.valueFiat > b.valueFiat;', 'comparison >'],
      ['a comparison of a price', 'if (price <= limit) {}', 'comparison <='],
      ['an addition of amounts', 'const t = a.amount + b.amount;', 'arithmetic +'],
      ['an accumulated subtraction', 'pnl -= fee;', 'arithmetic -='],
    ])('detects %s', (_label, source, rule) => {
      expect(findMonetaryOperations(source).map((v) => v.rule)).toContain(rule);
    });

    it('ignores comments, strings, string joins and count comparisons', () => {
      const source = [
        '// a.valueFiat > b.valueFiat; rows.sort(); total + amount',
        'const note = "amount + price; rows.sort()";',
        'const label = "total: " + totalText;',
        'const more = omittedCount > 0 && page < totalPages;',
      ].join('\n');
      expect(findMonetaryOperations(source)).toEqual([]);
    });
  });

  describe('the tools that rank delegate to rankHoldingsByValue', () => {
    const rankingTools = aiSources.filter((file) => ['portfolioSummaryTool.ts', 'assetAllocationTool.ts'].includes(basename(file)));

    it('portfolio_summary and asset_allocation call rankHoldingsByValue once, sort nothing, compare no monetary value and import no decimal.js', () => {
      expect(rankingTools.map((file) => basename(file)).sort()).toEqual(['assetAllocationTool.ts', 'portfolioSummaryTool.ts']);
      for (const file of rankingTools) {
        const source = readSource(file);
        expect(findCalls(source, 'rankHoldingsByValue'), displayPath(file)).toHaveLength(1);
        expect(findMonetaryOperations(source), displayPath(file)).toEqual([]);
        expect(findNumericCoercion(source), displayPath(file)).toEqual([]);
      }
    });

    it('the call scan sees a method call and ignores a comment naming it', () => {
      expect(findCalls('const r = svc.rankHoldingsByValue(a, b, c);', 'rankHoldingsByValue')).toHaveLength(1);
      expect(findCalls('// rankHoldingsByValue(a)\nconst s = "rankHoldingsByValue(a)";', 'rankHoldingsByValue')).toEqual([]);
    });
  });

  describe('one model chain, no agent duplicated per provider', () => {
    const constructionsOf = (className: string) =>
      aiSources.flatMap((file) => findConstructions(readSource(file), className).map(() => basename(file)));

    it('constructs exactly advisor, taxAnalyst and investmentAnalyst, each once', () => {
      expect(constructionsOf('Agent').sort()).toEqual(['advisor.ts', 'investmentAnalyst.ts', 'taxAnalyst.ts']);
    });

    it('resolves the chain into model config at exactly one call site, in the adapter', () => {
      const sites = aiSources.flatMap((file) =>
        findCalls(readSource(file), 'buildModelChainConfig').map(() => basename(file)),
      );
      expect(sites).toEqual(['MastraAdvisorAdapter.ts']);
    });

    it('the construction scan sees a second Agent and ignores a comment', () => {
      expect(findConstructions('const a = new Agent({}); const b = new Agent({});', 'Agent')).toHaveLength(2);
      expect(findConstructions('// new Agent({})\nconst s = "new Agent()";', 'Agent')).toEqual([]);
    });
  });

  describe('loose chunk payloads are narrowed, not cast', () => {
    const chunkSource = readSource(aiSources.find((file) => basename(file) === 'mastraChunk.ts') ?? '');

    it('mastraChunk.ts contains no type assertion and no non-null assertion', () => {
      expect(chunkSource.length).toBeGreaterThan(1000);
      expect(findTypeAssertions(chunkSource)).toEqual([]);
    });

    it.each([
      ['an `as` cast', 'const a = payload as ToolArgs;'],
      ['an angle-bracket cast', 'const a = <ToolArgs>payload;'],
      ['a non-null assertion', 'const a = payload!.args;'],
    ])('detects %s', (_label, source) => {
      expect(findTypeAssertions(source)).not.toEqual([]);
    });

    it('allows `as const` and ignores comments', () => {
      expect(findTypeAssertions('const a = ["x"] as const; // payload as Foo')).toEqual([]);
    });
  });
});
