/**
 * CommonSchemaHelpers — Shared Zod preprocessors and validators across infrastructure DTOs.
 *
 * Provides centralized, reusable helpers to transform and validate raw API payload fields
 * into clean domain types without code duplication.
 *
 * @see openspec/specs/zod-validation/spec.md
 */

import { z } from 'zod'
import { Money } from '@kryptofolio/core-domain'
import { preciseAmountFromNumber } from '@kryptofolio/shared-types'

/**
 * Coerces numeric inputs (number or numeric string) into a native number.
 * Defaults null or undefined to 0. Passes non-numeric corrupted strings to z.number()
 * so that Zod schema validation fails gracefully on malformed API payloads.
 */
export const numericField = z.preprocess((val) => {
  if (val === null || val === undefined) return 0
  if (typeof val === 'number') return val
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (trimmed === '') return 0
    const n = Number(trimmed)
    return isNaN(n) ? val : n
  }
  return val
}, z.number({ invalid_type_error: 'Expected number or numeric string' }))

/**
 * Same coercion as numericField, except an absent value stays absent instead of becoming 0.
 *
 * Reserved for fields the backend can genuinely send as `null` because no value could be
 * resolved (an unpriced disposal, its derived gain). Applying this everywhere numericField is
 * used today would turn every legitimately-zero field into `null` across the application —
 * this variant exists so that conversion is opt-in, field by field.
 */
export const nullableNumericField = z.preprocess((val) => {
  if (val === null || val === undefined) return null
  if (typeof val === 'number') return val
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (trimmed === '') return null
    const n = Number(trimmed)
    return isNaN(n) ? val : n
  }
  return val
}, z.number({ invalid_type_error: 'Expected number or numeric string' }).nullable())

/**
 * Constructs a `Money` from an exact decimal wire string, mirroring `numericField`'s absent-value
 * mapping: `null`/`undefined`/`''` become `Money('0')`. A native `number` input (still fed by some
 * fixtures/tests) is routed through `preciseAmountFromNumber` rather than `String(n)`, which would
 * throw on a value like `1e-7`.
 */
export const moneyField = z.preprocess((val) => {
  if (val === null || val === undefined) return '0'
  if (typeof val === 'number') return preciseAmountFromNumber(val)
  if (typeof val === 'string') {
    const trimmed = val.trim()
    return trimmed === '' ? '0' : trimmed
  }
  return val
}, z.string()).transform((val) => new Money(val))

/**
 * The `Money` analogue of `nullableNumericField`: absence stays `null`, never `Money('0')`, so a
 * stated zero remains separable from an unresolved figure.
 */
export const nullableMoneyField = z.preprocess((val) => {
  if (val === null || val === undefined) return null
  if (typeof val === 'number') return preciseAmountFromNumber(val)
  if (typeof val === 'string') {
    const trimmed = val.trim()
    return trimmed === '' ? null : trimmed
  }
  return val
}, z.string().nullable()).transform((val) => (val === null ? null : new Money(val)))

/**
 * For a genuinely optional field (e.g. `amountIn`/`amountOut`): an absent value stays `undefined`,
 * never coerced to `Money('0')`.
 */
export const optionalMoneyField = z.preprocess((val) => {
  if (val === null || val === undefined) return undefined
  if (typeof val === 'number') return preciseAmountFromNumber(val)
  if (typeof val === 'string') {
    const trimmed = val.trim()
    return trimmed === '' ? undefined : trimmed
  }
  return val
}, z.string().optional()).transform((val) => (val === undefined ? undefined : new Money(val)))

/**
 * Normalizes various timestamp formats (ISO 8601 strings, "YYYY-MM-DD HH:MM:SS",
 * or Unix epoch numbers) into native Date objects.
 */
export const timestampToDate = z.preprocess((val) => {
  if (val instanceof Date) return val

  if (typeof val === 'number') {
    const ms = val < 1e10 ? val * 1000 : val
    return new Date(ms)
  }

  if (typeof val === 'string') {
    let normalized = val.replace(' ', 'T')
    if (!normalized.endsWith('Z') && !normalized.includes('+')) {
      normalized += 'Z'
    }
    const d = new Date(normalized)
    return isNaN(d.getTime()) ? new Date(0) : d
  }

  return new Date(0)
}, z.date())
