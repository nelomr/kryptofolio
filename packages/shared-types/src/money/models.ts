export const SUPPORTED_CURRENCIES = ["USD", "EUR"] as const;

export type FiatCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const FIAT_CURRENCY_SYMBOLS: Record<FiatCurrency, string> = {
  USD: "$",
  EUR: "€",
};

/**
 * Narrows an arbitrary code onto the currencies the money model can actually represent.
 *
 * Without it the only way to build a `FiatMoney` from a provider's string was a cast, which typed an
 * unsupported code as supported and let the converter return a figure in a currency that has no
 * definition here.
 */
export function isSupportedCurrency(code: string): code is FiatCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code);
}
