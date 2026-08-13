import { describe, it, expect } from 'vitest';
import {
  convertedAmountSchema,
  CONVERSION_OUTCOMES,
  isConvertible,
  nativeAmountOf,
  type ConvertedAmount,
} from '../../src/money/converted-amount.js';
import { FIFO_QUALITY_FLAGS } from '../../src/schemas/fifo-policy.js';

const CONVERTED: ConvertedAmount = {
  kind: 'CONVERTED',
  amount: '1234.56',
  currency: 'USD',
  rate: '1.0825',
  rateDate: '2023-06-15',
};
const NATIVE: ConvertedAmount = { kind: 'NATIVE', amount: '1234.56', currency: 'EUR' };
const UNCONVERTIBLE: ConvertedAmount = {
  kind: 'UNCONVERTIBLE',
  nativeAmount: '1234.56',
  nativeCurrency: 'EUR',
  requested: 'USD',
};

describe('ConvertedAmount', () => {
  it('has exactly three outcomes', () => {
    expect([...CONVERSION_OUTCOMES].sort()).toEqual(['CONVERTED', 'NATIVE', 'UNCONVERTIBLE']);
  });

  it('accepts each of the three arms', () => {
    for (const arm of [CONVERTED, NATIVE, UNCONVERTIBLE]) {
      expect(convertedAmountSchema.parse(arm)).toEqual(arm);
    }
  });

  it('does not let NATIVE be expressed as CONVERTED with rate 1', () => {
    // A conversion to the currency you were already in is the identity function,
    // and the type must say so rather than leave it inferred from a rate value.
    const rateOne = { ...NATIVE, kind: 'CONVERTED', rate: '1', rateDate: '2023-06-15' };
    expect(convertedAmountSchema.safeParse(rateOne).success).toBe(true);
    expect(convertedAmountSchema.parse(rateOne)).not.toEqual(NATIVE);

    // NATIVE carries no rate at all — an added one is rejected, not ignored.
    expect(convertedAmountSchema.safeParse({ ...NATIVE, rate: '1' }).success).toBe(false);
  });

  it('rejects a CONVERTED arm missing its rate or rate date', () => {
    expect(convertedAmountSchema.safeParse({ ...CONVERTED, rate: undefined }).success).toBe(false);
    expect(convertedAmountSchema.safeParse({ ...CONVERTED, rateDate: undefined }).success).toBe(
      false,
    );
  });

  it('always carries the native amount and currency on UNCONVERTIBLE', () => {
    expect(convertedAmountSchema.safeParse({ kind: 'UNCONVERTIBLE', requested: 'USD' }).success).toBe(
      false,
    );
    expect(nativeAmountOf(UNCONVERTIBLE)).toEqual({ amount: '1234.56', currency: 'EUR' });
    expect(nativeAmountOf(NATIVE)).toEqual({ amount: '1234.56', currency: 'EUR' });
    expect(nativeAmountOf(CONVERTED)).toEqual({ amount: '1234.56', currency: 'USD' });
  });

  it('treats only UNCONVERTIBLE as not convertible', () => {
    expect(isConvertible(CONVERTED)).toBe(true);
    expect(isConvertible(NATIVE)).toBe(true);
    expect(isConvertible(UNCONVERTIBLE)).toBe(false);
  });

  it('rejects an unrecognised outcome rather than defaulting it', () => {
    expect(convertedAmountSchema.safeParse({ ...NATIVE, kind: 'ASSUMED' }).success).toBe(false);
    expect(convertedAmountSchema.safeParse({ ...NATIVE, kind: undefined }).success).toBe(false);
  });

  it('rejects a currency outside SUPPORTED_CURRENCIES', () => {
    expect(convertedAmountSchema.safeParse({ ...NATIVE, currency: 'GBP' }).success).toBe(false);
  });

  it('rejects an amount that is not a decimal string', () => {
    expect(convertedAmountSchema.safeParse({ ...NATIVE, amount: 1234.56 }).success).toBe(false);
    expect(convertedAmountSchema.safeParse({ ...NATIVE, amount: '1.2e-9' }).success).toBe(false);
  });

  it('shares no vocabulary with FIFO_QUALITY_FLAGS', () => {
    // A display conversion that fails is not a lot quality defect: the lot is
    // sound and the view cannot express it. Overlapping the two would make the
    // same lot read as defective in EUR and healthy in USD.
    const flags = new Set<string>(FIFO_QUALITY_FLAGS);
    for (const outcome of CONVERSION_OUTCOMES) {
      expect(flags.has(outcome)).toBe(false);
    }
    expect(flags.has('MISSING_FX_RATE')).toBe(true);
    expect(CONVERSION_OUTCOMES).not.toContain('MISSING_FX_RATE');
  });
});
