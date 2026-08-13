/**
 * The currencies the selector may offer.
 *
 * Derived from `SUPPORTED_CURRENCIES` — the set the money model and the ECB-quoted FX ledger both
 * agree on — rather than listed in the component. A component-local list drifts from that set
 * silently, and the drift only surfaces later, in another view, as an unconvertible figure.
 */

import { SUPPORTED_CURRENCIES, type FiatCurrency } from '@kryptofolio/shared-types'

export interface CurrencyOption {
  readonly code: FiatCurrency
  readonly labelKey: string
}

export function supportedCurrencyOptions(): readonly CurrencyOption[] {
  return SUPPORTED_CURRENCIES.map((code) => ({
    code,
    labelKey: `settings.currency.option_${code.toLowerCase()}`,
  }))
}
