import { describe, expect, it } from 'vitest';
import { ADVISOR_TOOL_NAMES, ADVISOR_TOOL_TIERS, type ExecutionProfileKind } from '@kryptofolio/shared-types';
import { buildTaxAnalystInstructions } from '../buildTaxAnalystInstructions.js';

interface InstructionsInput {
  locale: string;
  baseCurrency: string;
  profile: ExecutionProfileKind;
}

function baseRequest(overrides: Partial<InstructionsInput> = {}): InstructionsInput {
  return { locale: 'en', baseCurrency: 'EUR', profile: 'metered', ...overrides };
}

const EXTENDED = ADVISOR_TOOL_NAMES.filter((name) => ADVISOR_TOOL_TIERS[name] === 'extended');
const CORE = ADVISOR_TOOL_NAMES.filter((name) => ADVISOR_TOOL_TIERS[name] === 'core');
const names = (text: string, tool: string) => new RegExp(`\\b${tool}\\b`).test(text);
const stablePrefix = (text: string) => text.slice(0, text.indexOf('Response format:'));

describe('buildTaxAnalystInstructions', () => {
  it('produces a byte-identical stable prefix across two contexts differing only in locale', () => {
    const english = buildTaxAnalystInstructions(baseRequest({ locale: 'en' }));
    const spanish = buildTaxAnalystInstructions(baseRequest({ locale: 'es' }));

    const suffixMarker = 'Response format:';
    const stablePrefixEnglish = english.slice(0, english.indexOf(suffixMarker));
    const stablePrefixSpanish = spanish.slice(0, spanish.indexOf(suffixMarker));

    expect(stablePrefixEnglish).toBe(stablePrefixSpanish);
    expect(english).not.toBe(spanish);
  });

  it('never contains an asset symbol, quantity, balance, or fiscal figure — only tool results carry those', () => {
    const instructions = buildTaxAnalystInstructions(baseRequest());

    expect(instructions).not.toMatch(/\d[\d,.]*\s?(BTC|ETH|EUR|USD|%)/);
    expect(instructions).not.toMatch(/\d+\.\d+/);
  });

  it('does not hard-code a page size the execution profile can change', () => {
    const instructions = buildTaxAnalystInstructions(baseRequest());

    expect(instructions).not.toMatch(/\btop \d+\b/i);
  });

  it('directs the agent to report a total as partial whenever a tool result signals incompleteness', () => {
    const instructions = buildTaxAnalystInstructions(baseRequest());

    expect(instructions).toMatch(/incomplete/i);
    expect(instructions).toMatch(/never present a partial total as final|report.*partial/i);
  });

  it('requires figures to be echoed verbatim inside inline code', () => {
    const instructions = buildTaxAnalystInstructions(baseRequest());

    expect(instructions).toMatch(/inline code/i);
    expect(instructions).toMatch(/verbatim/i);
  });

  it('substitutes the request locale into the volatile suffix', () => {
    const instructions = buildTaxAnalystInstructions(baseRequest({ locale: 'es' }));

    expect(instructions).toContain('es');
  });

  it('makes the model state each tool result’s declared currency instead of promising the base currency', () => {
    const instructions = buildTaxAnalystInstructions(baseRequest({ baseCurrency: 'USD' }));

    expect(instructions).toMatch(/currency field/i);
    expect(instructions).toMatch(/never\s+convert/i);
    expect(instructions).not.toMatch(/Report every\s+monetary figure in/i);
  });

  it('keeps the base currency out of the stable prefix', () => {
    const usd = buildTaxAnalystInstructions(baseRequest({ baseCurrency: 'USD' }));
    const gbp = buildTaxAnalystInstructions(baseRequest({ baseCurrency: 'GBP' }));
    const marker = 'Response format:';

    expect(usd.slice(0, usd.indexOf(marker))).toBe(gbp.slice(0, gbp.indexOf(marker)));
    expect(usd).toContain('USD');
  });

  it('states that tools cover every account and forbids asking the user for an internal identifier', () => {
    const instructions = buildTaxAnalystInstructions(baseRequest());
    const stablePrefix = instructions.slice(0, instructions.indexOf('Response format:'));

    expect(stablePrefix).toMatch(/all of the user's accounts/i);
    expect(stablePrefix).toMatch(/never ask the user for an account id/i);
    expect(stablePrefix).toMatch(/internal identifier/i);
  });

  describe('arithmetic is forbidden and routed to tools', () => {
    it('states the fixed never-compute rule for every profile', () => {
      for (const profile of ['local', 'metered'] as const) {
        const text = stablePrefix(buildTaxAnalystInstructions(baseRequest({ profile })));

        expect(text, profile).toMatch(/never compute, convert, sum, subtract or estimate/i);
      }
    });

    it('sends hypothetical prices and percentages to the scenario tools the profile exposes', () => {
      const metered = stablePrefix(buildTaxAnalystInstructions(baseRequest({ profile: 'metered' })));
      const local = stablePrefix(buildTaxAnalystInstructions(baseRequest({ profile: 'local' })));

      expect(metered).toMatch(/hypothetical price or percentage/i);
      for (const tool of ['scenario_position_value', 'breakeven_price', 'scenario_portfolio_shock']) {
        expect(names(metered, tool), tool).toBe(true);
      }
      expect(local).toMatch(/hypothetical price or percentage/i);
      expect(names(local, 'scenario_position_value')).toBe(true);
      expect(names(local, 'scenario_portfolio_shock')).toBe(false);
    });

    it('sends a comparison across years to tax_year_comparison', () => {
      for (const profile of ['local', 'metered'] as const) {
        const text = stablePrefix(buildTaxAnalystInstructions(baseRequest({ profile })));

        expect(text, profile).toMatch(/comparison across years[^.]*tax_year_comparison/i);
      }
    });

    it('tells the model to state a typed non-computed outcome as it is', () => {
      const text = stablePrefix(buildTaxAnalystInstructions(baseRequest()));

      expect(text).toMatch(/not computed[^.]*state it to the user as it is/i);
    });

    it('mentions larger profiles only for the local profile', () => {
      expect(stablePrefix(buildTaxAnalystInstructions(baseRequest({ profile: 'local' })))).toMatch(/larger profile/i);
      expect(stablePrefix(buildTaxAnalystInstructions(baseRequest({ profile: 'metered' })))).not.toMatch(/larger profile/i);
    });

    it('asks the user to narrow a tx_search filter when its result is cut off', () => {
      expect(stablePrefix(buildTaxAnalystInstructions(baseRequest({ profile: 'metered' })))).toMatch(
        /tx_search[^.]*narrower/i,
      );
    });
  });

  describe('the tool list is exactly the profile’s exposed set', () => {
    it('never names an extended tool for a local profile', () => {
      const text = buildTaxAnalystInstructions(baseRequest({ profile: 'local' }));

      for (const tool of EXTENDED) expect(names(text, tool), tool).toBe(false);
    });

    it('names every core tool for a local profile', () => {
      const text = buildTaxAnalystInstructions(baseRequest({ profile: 'local' }));

      for (const tool of CORE) expect(names(text, tool), tool).toBe(true);
    });

    it('names every one of the tools for a metered profile', () => {
      const text = buildTaxAnalystInstructions(baseRequest({ profile: 'metered' }));

      for (const tool of ADVISOR_TOOL_NAMES) expect(names(text, tool), tool).toBe(true);
    });

    it('keeps the prefix byte-identical per profile whatever the locale or base currency', () => {
      for (const profile of ['local', 'metered'] as const) {
        const a = stablePrefix(buildTaxAnalystInstructions(baseRequest({ profile, locale: 'en', baseCurrency: 'EUR' })));
        const b = stablePrefix(buildTaxAnalystInstructions(baseRequest({ profile, locale: 'es', baseCurrency: 'USD' })));

        expect(a, profile).toBe(b);
      }
    });

    it('differs between profiles, since the exposed set differs', () => {
      expect(stablePrefix(buildTaxAnalystInstructions(baseRequest({ profile: 'local' })))).not.toBe(
        stablePrefix(buildTaxAnalystInstructions(baseRequest({ profile: 'metered' }))),
      );
    });
  });
});
