import { describe, expect, it } from 'vitest';

import {
  SOURCE_PROFILE_IDS,
  isSourceProfileId,
  sourceProfileIdSchema,
} from '../../src/ingestion/sourceProfileIds.js';

describe('the source profile identifier vocabulary', () => {
  it('names the six measured exports and the generic fallback, and nothing else', () => {
    expect([...SOURCE_PROFILE_IDS].sort()).toEqual([
      'bit2me-spot',
      'bitunix-spot',
      'bitvavo-spot',
      'generic',
      'kraken-futures',
      'kraken-spot',
      'tangem',
    ]);
  });

  it('accepts every declared identifier and rejects anything else', () => {
    for (const id of SOURCE_PROFILE_IDS) {
      expect(sourceProfileIdSchema.parse(id)).toBe(id);
    }
    expect(sourceProfileIdSchema.safeParse('binance-spot').success).toBe(false);
    expect(sourceProfileIdSchema.safeParse('').success).toBe(false);
    expect(sourceProfileIdSchema.safeParse(undefined).success).toBe(false);
  });

  it('has no default: an omitted identifier is a parse failure, not a named source', () => {
    const body = sourceProfileIdSchema.safeParse(undefined);
    expect(body.success).toBe(false);
  });

  it('narrows an unknown string only when it is a declared identifier', () => {
    expect(isSourceProfileId('kraken-spot')).toBe(true);
    expect(isSourceProfileId('generic')).toBe(true);
    expect(isSourceProfileId('KRAKEN-SPOT')).toBe(false);
    expect(isSourceProfileId(7)).toBe(false);
  });

  it('is re-exported from the package entry so no consumer restates the list', async () => {
    const entry = await import('../../src/index.js');
    expect(entry.SOURCE_PROFILE_IDS).toBe(SOURCE_PROFILE_IDS);
  });
});
