/**
 * Branded Types — Nominal typing for domain identifiers.
 *
 * Uses TypeScript phantom branding to create distinct nominal types that
 * prevent accidental ID swapping at compile time. An `AssetId` cannot be
 * passed where a `TransactionId` is expected, even though both are strings
 * at runtime. No external libraries — pure TypeScript only.
 *
 * Zod validation schemas for these types live in:
 * @see src/core/infrastructure/dtos/BrandedTypeSchemas.ts
 *
 * @see openspec/specs/domain-purity/spec.md
 */

// ---------------------------------------------------------------------------
// Phantom brand helper — no runtime overhead
// ---------------------------------------------------------------------------

type Brand<T, B extends string> = T & { readonly __brand: B }

// ---------------------------------------------------------------------------
// Branded ID types — nominal identity for domain entities
// ---------------------------------------------------------------------------

/** Nominal type for asset/holding identifiers (e.g. "asset-btc-1") */
export type AssetId = Brand<string, 'AssetId'>

/** Nominal type for transaction identifiers (e.g. "tx-12345") */
export type TransactionId = Brand<string, 'TransactionId'>

/** Nominal type for FIFO lot identifiers (e.g. "lot-btc-1") */
export type LotId = Brand<string, 'LotId'>

/** Nominal type for account identifiers, including synthetic `ownwallet-<ASSET>` accounts */
export type AccountId = Brand<string, 'AccountId'>

/** Nominal type for the deterministic transaction identity manual overrides key on */
export type TransactionIdHash = Brand<string, 'TransactionIdHash'>
