/**
 * BrandedTypeSchemas — Zod schemas for branded domain ID types.
 *
 * These schemas live in infrastructure because they depend on Zod (an external
 * library). The branded types themselves remain pure TypeScript in the domain.
 *
 * Usage: parse raw API strings through these schemas to produce
 * domain-safe branded IDs before constructing domain entities.
 *
 * @see src/core/domain/models/BrandedTypes.ts
 * @see openspec/specs/domain-purity/spec.md
 */

import { z } from 'zod'
import type { AssetId, TransactionId, LotId, AccountId, TransactionIdHash } from '@/core/domain/models/BrandedTypes'

// ---------------------------------------------------------------------------
// Branded ID Schemas — parse + validate + produce branded domain types
// ---------------------------------------------------------------------------

/** Validates and brands a raw string as an AssetId */
export const AssetIdSchema = z
  .string()
  .min(1, 'AssetId cannot be empty')
  .transform((val) => val as AssetId)

/** Validates and brands a raw string as a TransactionId */
export const TransactionIdSchema = z
  .string()
  .min(1, 'TransactionId cannot be empty')
  .transform((val) => val as TransactionId)

/** Validates and brands a raw string as a LotId */
export const LotIdSchema = z
  .string()
  .min(1, 'LotId cannot be empty')
  .transform((val) => val as LotId)

/** Validates and brands a raw string as an AccountId */
export const AccountIdSchema = z
  .string()
  .min(1, 'AccountId cannot be empty')
  .transform((val) => val as AccountId)

/** Validates and brands a raw string as a TransactionIdHash */
export const TransactionIdHashSchema = z
  .string()
  .min(1, 'TransactionIdHash cannot be empty')
  .transform((val) => val as TransactionIdHash)
