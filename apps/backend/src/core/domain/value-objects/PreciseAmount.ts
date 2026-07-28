/**
 * PreciseAmount — Domain value object for arbitrary-precision financial amounts.
 *
 * DOMAIN ISOLATION RULE: This type must NOT import any external library.
 * The branded string pattern keeps the domain layer pure while allowing
 * Infrastructure adapters to convert to/from Decimal.js at the boundary.
 *
 * Usage:
 *   - Domain entities hold PreciseAmount (opaque string).
 *   - Adapters (Infrastructure): convert TEXT from DB → toPreciseAmount()
 *   - Adapters (Infrastructure): convert PreciseAmount → new Decimal(val) for arithmetic
 *   - Use Cases / Services (Application): import Decimal for arithmetic, call toPreciseAmount() before writing to domain entities.
 */

/** Branded string that carries a precise decimal number with full precision (no float rounding). */
export type PreciseAmount = string & { readonly __brand: 'PreciseAmount' };

/**
 * Converts a string or number to a PreciseAmount.
 * No external dependencies — safe for use in any layer.
 *
 * @param val A numeric string, integer, or float. Must be a valid decimal representation.
 */
export const toPreciseAmount = (val: string | number): PreciseAmount =>
  String(val) as PreciseAmount;
