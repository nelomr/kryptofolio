/**
 * Which asset symbols are units of account rather than taxable holdings.
 *
 * Needed in three places that must never disagree: the domain classifier deciding whether a
 * `deposit` is funding or custody, `ensureAssetExists` persisting `assets.is_fiat`, and the SQL
 * seed.
 *
 * ISO-4217 codes only. Stablecoins are not fiat here: `USDT` disposals are taxable events, and
 * classifying it as fiat would drop it from FIFO tracking altogether.
 */

/**
 * Scoped to currencies the supported venues actually settle in rather than the full ISO list. An
 * unlisted code defaults to non-fiat, which is the safe direction: a misclassified crypto asset
 * stays inside FIFO and remains visible, whereas a misclassified fiat asset would vanish from it.
 */
export const FIAT_CURRENCY_CODES = [
  'EUR',
  'USD',
  'GBP',
  'CHF',
  'JPY',
  'CAD',
  'AUD',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
] as const;

export type FiatCurrencyCode = (typeof FIAT_CURRENCY_CODES)[number];

const FIAT_CODE_SET: ReadonlySet<string> = new Set(FIAT_CURRENCY_CODES);

/** Normalises case and whitespace: source exports are inconsistent about both. */
export function isFiatCurrencyCode(assetSymbol: string): boolean {
  return FIAT_CODE_SET.has(assetSymbol.trim().toUpperCase());
}
