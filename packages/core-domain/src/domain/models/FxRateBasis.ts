/**
 * FxRateBasis — which date a monetary figure converts at.
 *
 * Lives in the DOMAIN layer. NO external imports (no Decimal.js, no Zod, no SQL).
 *
 * Expressed only as hand-written ASOF joins, this rule would have no single
 * definition and five places to drift apart. It is stated once here and
 * *applied* by the adapters; a basis names a date source symbolically, never a
 * column, so the rule stays testable without a database.
 */

/** The classes of monetary figure the read model returns. */
export type FxFigureKind = 'COST_BASIS' | 'REALIZED_GAIN' | 'PRESENT_VALUE' | 'SERIES_POINT';

export type FxRateBasis =
  | { readonly kind: 'ACQUISITION_DATE' }
  | { readonly kind: 'DISPOSAL_DATE' }
  | { readonly kind: 'LATEST' }
  | { readonly kind: 'POINT_DATE' };

const ACQUISITION_DATE: FxRateBasis = Object.freeze({ kind: 'ACQUISITION_DATE' as const });
const DISPOSAL_DATE: FxRateBasis = Object.freeze({ kind: 'DISPOSAL_DATE' as const });
const LATEST: FxRateBasis = Object.freeze({ kind: 'LATEST' as const });
const POINT_DATE: FxRateBasis = Object.freeze({ kind: 'POINT_DATE' as const });

/**
 * A figure about the past converts at a rate from the past. Only a
 * present-value figure may use the latest rate; applying it to a cost basis
 * would make a historical acquisition a function of today's FX.
 */
export function resolveRateBasis(figure: FxFigureKind): FxRateBasis {
  switch (figure) {
    case 'COST_BASIS':
      return ACQUISITION_DATE;
    case 'REALIZED_GAIN':
      return DISPOSAL_DATE;
    case 'PRESENT_VALUE':
      return LATEST;
    case 'SERIES_POINT':
      return POINT_DATE;
  }
}
