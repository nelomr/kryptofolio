/**
 * CommonSchemaHelpers — Shared Zod preprocessors and validators across infrastructure DTOs.
 *
 * Provides centralized, reusable helpers to transform and validate raw API payload fields
 * into clean domain types without code duplication.
 *
 * @see openspec/specs/zod-validation/spec.md
 */

import { z } from 'zod'

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
