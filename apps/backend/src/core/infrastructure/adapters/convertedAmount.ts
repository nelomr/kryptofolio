import { isSupportedCurrency, type ConvertedAmount, type FiatCurrency } from '@kryptofolio/shared-types';

interface ConversionRow {
  readonly amount: string;
  /**
   * The figure before any rate was applied. Distinct from `amount` because the converted figure is
   * meaningless exactly when the conversion failed — a rate coalesced to one, or a product that
   * fell below the destination scale — and that is the case where the native figure is reported.
   */
  readonly nativeAmount: string;
  readonly nativeCurrency: string | null;
  readonly requested: FiatCurrency;
  readonly rate: string | null;
  readonly rateDate: string | null;
  readonly unconvertible: boolean;
}

/**
 * Turns a converted SQL row into the outcome union.
 *
 * The three arms are decided here, at the adapter boundary, because this is the only place that
 * knows everything the query resolved: the figure's native currency, whether a rate was found, and
 * which currency was asked for. A caller handed a bare number and a nullable rate would have to
 * re-derive that, and would eventually derive it differently.
 */
export function toConvertedAmount(row: ConversionRow): ConvertedAmount {
  const native = row.nativeCurrency;

  // A currency the money model cannot represent is not a conversion that merely failed to find a
  // rate — there is no rate to look for. It reports as unconvertible carrying the honest figure.
  if (native === null || !isSupportedCurrency(native) || row.unconvertible) {
    return {
      kind: 'UNCONVERTIBLE',
      nativeAmount: row.nativeAmount,
      nativeCurrency: native ?? row.requested,
      requested: row.requested,
    };
  }

  // Its own arm, not CONVERTED with a rate of 1: a figure that was never multiplied stays
  // distinguishable from one multiplied by exactly one.
  if (native === row.requested) {
    return { kind: 'NATIVE', amount: row.amount, currency: row.requested };
  }

  return {
    kind: 'CONVERTED',
    amount: row.amount,
    currency: row.requested,
    rate: row.rate ?? '1',
    rateDate: row.rateDate ?? '',
  };
}
