/**
 * Branded Types — Nominal typing for domain identifiers.
 *
 * Uses Zod's `.brand()` to create distinct types that prevent accidental
 * ID swapping at compile time. An `AssetId` cannot be passed where a
 * `TransactionId` is expected, even though both are strings at runtime.
 *
 * @see openspec/specs/zod-validation/spec.md
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Branded ID Schemas — parse + validate + brand in one step
// ---------------------------------------------------------------------------

export const AssetIdSchema = z.string().min(1, 'AssetId cannot be empty').brand<'AssetId'>()
export const TransactionIdSchema = z.string().min(1, 'TransactionId cannot be empty').brand<'TransactionId'>()
export const LotIdSchema = z.string().min(1, 'LotId cannot be empty').brand<'LotId'>()

// ---------------------------------------------------------------------------
// Exported types — inferred from Zod schemas
// ---------------------------------------------------------------------------

export type AssetId = z.infer<typeof AssetIdSchema>
export type TransactionId = z.infer<typeof TransactionIdSchema>
export type LotId = z.infer<typeof LotIdSchema>
