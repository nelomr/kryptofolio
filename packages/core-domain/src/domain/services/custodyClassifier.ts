/**
 * Resolves what a source `deposit` / `withdrawal` / `transfer` row means fiscally.
 *
 * The labels are ambiguous: 500 EUR into an exchange is funding, 179 XRP into a wallet is custody,
 * and both arrive as `deposit`. The distinction is the asset, not the label, so it is resolved here
 * rather than guessed downstream.
 *
 * Pure: no framework imports, no I/O, no mutation of its input.
 */

import { isFiatCurrencyCode } from '@kryptofolio/shared-types';

/**
 * A discriminated union rather than a thrown error or a defaulted value, so the caller must handle
 * the unclassified case explicitly instead of silently receiving a plausible type.
 */
export type CustodyClassification =
  /** A movement of a crypto asset between the user's own accounts. Never a taxable disposal. */
  | { readonly kind: 'CUSTODY_MOVEMENT'; readonly txType: 'TRANSFER_IN' | 'TRANSFER_OUT' }
  /** Fiat moving in or out of a venue. Not a crypto acquisition, and outside FIFO entirely. */
  | { readonly kind: 'FIAT_FUNDING'; readonly txType: 'DEPOSIT' | 'WITHDRAWAL' }
  /** Not a movement, or a movement whose direction cannot be established. */
  | { readonly kind: 'UNCLASSIFIED'; readonly reason: string };

export interface CustodyClassificationInput {
  /** The source's own type label, e.g. `withdrawal`, `deposito`, `transfer`. */
  readonly rawType: string;
  readonly assetSymbol: string;
  /**
   * The source's own asset classification when it provides one — Kraken emits `crypto` / `fiat`.
   * Takes precedence over the ISO-4217 lookup, so a token whose ticker collides with a currency code
   * follows the venue's own judgement.
   */
  readonly subclass?: 'crypto' | 'fiat';
  /** Signed amount. Only consulted for generic `transfer` rows, which carry no direction. */
  readonly amount?: string | null;
}

type Direction = 'IN' | 'OUT';

/** Source labels that unambiguously denote an inbound movement, across the supported locales. */
const INBOUND_LABELS: ReadonlySet<string> = new Set(['deposit', 'deposito', 'depósito']);

/** Source labels that unambiguously denote an outbound movement. */
const OUTBOUND_LABELS: ReadonlySet<string> = new Set(['withdrawal', 'withdraw', 'retiro']);

/** Source labels that denote a movement whose direction must come from the amount's sign. */
const DIRECTIONLESS_LABELS: ReadonlySet<string> = new Set(['transfer', 'transferencia']);

function normaliseLabel(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Direction from the sign of the amount, for labels that do not carry one.
 *
 * Returns `null` for a missing, unparseable or zero amount. Zero is not treated as inbound: a
 * guessed direction attributes custody to the wrong account invisibly, whereas a rejected row is
 * reviewable.
 */
function directionFromAmount(amount: string | null | undefined): Direction | null {
  if (amount === null || amount === undefined) return null;
  const trimmed = amount.trim();
  if (trimmed.length === 0) return null;

  const value = Number(trimmed);
  if (!Number.isFinite(value) || value === 0) return null;

  return value > 0 ? 'IN' : 'OUT';
}

/** Whether the moved asset is a unit of account, preferring the source's own classification. */
function resolveIsFiat(input: CustodyClassificationInput): boolean {
  if (input.subclass === 'fiat') return true;
  if (input.subclass === 'crypto') return false;
  return isFiatCurrencyCode(input.assetSymbol);
}

export function classifyCustodyMovement(
  input: CustodyClassificationInput
): CustodyClassification {
  const label = normaliseLabel(input.rawType);
  const symbol = input.assetSymbol.trim();

  if (symbol.length === 0) {
    return {
      kind: 'UNCLASSIFIED',
      reason: `movement '${label}' has no asset symbol, so its fiscal meaning cannot be resolved`,
    };
  }

  let direction: Direction | null;
  if (INBOUND_LABELS.has(label)) {
    direction = 'IN';
  } else if (OUTBOUND_LABELS.has(label)) {
    direction = 'OUT';
  } else if (DIRECTIONLESS_LABELS.has(label)) {
    direction = directionFromAmount(input.amount);
    if (direction === null) {
      return {
        kind: 'UNCLASSIFIED',
        reason: `generic transfer of '${symbol}' has no signed amount, so its direction is unknown`,
      };
    }
  } else {
    return {
      kind: 'UNCLASSIFIED',
      reason: `'${label}' is not a custody movement`,
    };
  }

  if (resolveIsFiat(input)) {
    // Excluded from FIFO by `assets.is_fiat`, so no lot is ever created for it.
    return {
      kind: 'FIAT_FUNDING',
      txType: direction === 'IN' ? 'DEPOSIT' : 'WITHDRAWAL',
    };
  }

  // The principal is non-taxable; only a crypto network fee is a disposal.
  return {
    kind: 'CUSTODY_MOVEMENT',
    txType: direction === 'IN' ? 'TRANSFER_IN' : 'TRANSFER_OUT',
  };
}
