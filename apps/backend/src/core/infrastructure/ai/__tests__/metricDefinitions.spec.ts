import { describe, it, expect, expectTypeOf } from 'vitest';
import { ADVISOR_TOOL_NAMES, METRIC_IDS, type AdvisorToolName } from '@kryptofolio/shared-types';
import { METRIC_DEFINITIONS } from '../metricDefinitions.js';

describe('METRIC_DEFINITIONS', () => {
  it('has exactly one entry per MetricId', () => {
    expect(Object.keys(METRIC_DEFINITIONS).sort()).toEqual([...METRIC_IDS].sort());
  });

  it.each(METRIC_IDS)('%s has a non-empty definition in both locales and names a producing tool', (metric) => {
    const entry = METRIC_DEFINITIONS[metric];

    expect(entry.en.trim().length).toBeGreaterThan(0);
    expect(entry.es.trim().length).toBeGreaterThan(0);
    expect(entry.es).not.toBe(entry.en);
    expect(entry.producedBy.length).toBeGreaterThan(0);
  });

  it('states formulas in words and never uses an example number', () => {
    for (const metric of METRIC_IDS) {
      const { en, es } = METRIC_DEFINITIONS[metric];
      expect(en, `${metric} (en)`).not.toMatch(/\d/);
      expect(es, `${metric} (es)`).not.toMatch(/\d/);
    }
  });

  it('names a producing tool that really exists in the catalogue', () => {
    for (const metric of METRIC_IDS) {
      expect(ADVISOR_TOOL_NAMES, metric).toContain(METRIC_DEFINITIONS[metric].producedBy);
    }
    expectTypeOf(METRIC_DEFINITIONS.hhi.producedBy).toEqualTypeOf<AdvisorToolName>();
  });
});
