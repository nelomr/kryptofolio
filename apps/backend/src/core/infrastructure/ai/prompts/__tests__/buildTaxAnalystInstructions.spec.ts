import { describe, expect, it } from 'vitest';
import { buildTaxAnalystInstructions } from '../buildTaxAnalystInstructions.js';
import type { AdvisorRequest } from '../../../../domain/models/AdvisorRequest.js';

function baseRequest(overrides: Partial<AdvisorRequest> = {}): AdvisorRequest {
  return {
    message: 'ignored by this function',
    threadId: '00000000-0000-0000-0000-000000000000',
    locale: 'en',
    baseCurrency: 'EUR',
    ...overrides,
  };
}

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
});
