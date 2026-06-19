export const SUPPORTED_CURRENCIES = ["USD", "EUR"] as const;

export type FiatCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const FIAT_CURRENCY_SYMBOLS: Record<FiatCurrency, string> = {
  USD: "$",
  EUR: "€",
};
