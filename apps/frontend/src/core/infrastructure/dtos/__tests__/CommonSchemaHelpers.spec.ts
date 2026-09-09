import { describe, it, expect } from 'vitest'
import { Money } from '@kryptofolio/core-domain'
import {
  numericField,
  nullableNumericField,
  moneyField,
  nullableMoneyField,
  optionalMoneyField,
} from '../CommonSchemaHelpers'

// numericField's existing behaviour (0 default) must survive untouched — 210 call sites across
// seven DTO modules rely on it for fields that are legitimately absent-means-zero.
describe('numericField — unchanged default behaviour', () => {
  it('defaults null to 0', () => {
    expect(numericField.parse(null)).toBe(0)
  })

  it('defaults undefined to 0', () => {
    expect(numericField.parse(undefined)).toBe(0)
  })

  it('defaults an empty string to 0', () => {
    expect(numericField.parse('')).toBe(0)
  })

  it('still coerces a genuine numeric string', () => {
    expect(numericField.parse('42.5')).toBe(42.5)
  })
})

// nullableNumericField is the surgical fix from D26: it must preserve the distinction between
// "unresolved" and "genuinely zero" for the handful of fields the backend can send as null.
describe('nullableNumericField — preserves the null/zero distinction', () => {
  it('preserves null rather than fabricating 0', () => {
    expect(nullableNumericField.parse(null)).toBeNull()
  })

  it('preserves undefined as null', () => {
    expect(nullableNumericField.parse(undefined)).toBeNull()
  })

  it('treats an empty string as absent, not as 0', () => {
    expect(nullableNumericField.parse('')).toBeNull()
  })

  it('still parses a genuine zero as 0, not as null', () => {
    expect(nullableNumericField.parse(0)).toBe(0)
    expect(nullableNumericField.parse('0')).toBe(0)
  })

  it('still coerces a genuine numeric string', () => {
    expect(nullableNumericField.parse('299.46')).toBe(299.46)
  })

  it('coerces a plain number through unchanged', () => {
    expect(nullableNumericField.parse(12)).toBe(12)
  })
})

describe('moneyField — exact decimal, no precision loss', () => {
  it('preserves an exact decimal string with no float rounding', () => {
    const result = moneyField.parse('0.000000010000000001')
    expect(result).toBeInstanceOf(Money)
    expect(result.equals(new Money('0.000000010000000001'))).toBe(true)
  })

  it('fails on a malformed decimal string rather than throwing out of Money', () => {
    expect(() => moneyField.parse('not-a-number')).toThrow()
  })

  it('maps null, undefined and empty string to Money("0"), matching numericField', () => {
    expect(moneyField.parse(null).equals(new Money('0'))).toBe(true)
    expect(moneyField.parse(undefined).equals(new Money('0'))).toBe(true)
    expect(moneyField.parse('').equals(new Money('0'))).toBe(true)
  })

  it('accepts a native number by routing it through preciseAmountFromNumber', () => {
    // Decimal's default toString renders this magnitude in exponential form (matching String(Number)
    // for the same value — see design.md D7b), so the value is compared, not the string.
    const result = moneyField.parse(1e-7)
    expect(result.equals(new Money('0.0000001'))).toBe(true)
  })
})

describe('nullableMoneyField — preserves the null/zero distinction as Money', () => {
  it('maps null, undefined and empty string to null, never Money("0")', () => {
    expect(nullableMoneyField.parse(null)).toBeNull()
    expect(nullableMoneyField.parse(undefined)).toBeNull()
    expect(nullableMoneyField.parse('')).toBeNull()
  })

  it('parses a valid decimal string to the exact Money', () => {
    const result = nullableMoneyField.parse('179.11')
    expect(result).not.toBeNull()
    expect(result?.toString()).toBe('179.11')
  })

  it('parses a stated zero to Money("0"), not to null', () => {
    const result = nullableMoneyField.parse('0')
    expect(result).not.toBeNull()
    expect(result?.equals(new Money('0'))).toBe(true)
  })

  it('accepts a native number by routing it through preciseAmountFromNumber', () => {
    const result = nullableMoneyField.parse(1e-7)
    expect(result?.equals(new Money('0.0000001'))).toBe(true)
  })
})

describe('optionalMoneyField — an absent value stays undefined, never Money("0")', () => {
  it('leaves undefined as undefined', () => {
    expect(optionalMoneyField.parse(undefined)).toBeUndefined()
  })

  it('parses a present value to the exact Money', () => {
    const result = optionalMoneyField.parse('42.5')
    expect(result?.toString()).toBe('42.5')
  })
})
