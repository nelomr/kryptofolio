import { describe, it, expect } from 'vitest'
import { numericField, nullableNumericField } from '../CommonSchemaHelpers'

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
