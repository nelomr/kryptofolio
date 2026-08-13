/**
 * Presentation of a backend-resolved `ConvertedAmount`.
 *
 * Formatting only. No rate is applied here and none may be: the conversion happened in the read
 * model, at each figure's own rate date, and a second multiplication on this side would produce a
 * second — wrong, plausible-looking — answer.
 */

import type { ConvertedAmount, FiatCurrency } from '@kryptofolio/shared-types'
import { formatCurrency } from '@/composables/useFormatters'

export type ConvertedAmountDisplay =
  | {
      kind: 'CONVERTED'
      text: string
      currency: FiatCurrency
      rate: string
      rateDate: string
    }
  | { kind: 'NATIVE'; text: string; currency: FiatCurrency }
  | { kind: 'UNCONVERTIBLE'; text: string; currency: string; requested: FiatCurrency }

export function describeConvertedAmount(value: ConvertedAmount): ConvertedAmountDisplay {
  switch (value.kind) {
    case 'CONVERTED':
      return {
        kind: 'CONVERTED',
        text: formatCurrency(value.amount, value.currency),
        currency: value.currency,
        rate: value.rate,
        rateDate: value.rateDate,
      }
    case 'NATIVE':
      return {
        kind: 'NATIVE',
        text: formatCurrency(value.amount, value.currency),
        currency: value.currency,
      }
    case 'UNCONVERTIBLE':
      // The native amount, in the native currency. Presenting it under the requested currency is
      // the fabrication this arm exists to prevent.
      return {
        kind: 'UNCONVERTIBLE',
        text: formatCurrency(value.nativeAmount, value.nativeCurrency),
        currency: value.nativeCurrency,
        requested: value.requested,
      }
  }
}

/**
 * What the view must tell the reader about the figures as a whole.
 *
 * `UNCONVERTED` carries no display currency on purpose: with nothing converted there is no rate
 * basis to state, and an empty portfolio has not chosen a currency for its figures — it has no
 * figures.
 */
export type ConversionSummary =
  | { kind: 'UNCONVERTED' }
  | { kind: 'CONVERTED'; displayCurrency: FiatCurrency; rateDates: string[] }
  | {
      kind: 'PARTIALLY_CONVERTED'
      displayCurrency: FiatCurrency
      rateDates: string[]
      unconvertibleCount: number
    }

export function summariseConversion(amounts: readonly ConvertedAmount[]): ConversionSummary {
  const rateDates = new Set<string>()
  let displayCurrency: FiatCurrency | undefined
  let unconvertibleCount = 0

  for (const amount of amounts) {
    if (amount.kind === 'CONVERTED') {
      rateDates.add(amount.rateDate)
      displayCurrency ??= amount.currency
    } else if (amount.kind === 'UNCONVERTIBLE') {
      unconvertibleCount += 1
      displayCurrency ??= amount.requested
    }
  }

  if (displayCurrency === undefined) return { kind: 'UNCONVERTED' }

  const sortedDates = [...rateDates].sort()
  return unconvertibleCount > 0
    ? { kind: 'PARTIALLY_CONVERTED', displayCurrency, rateDates: sortedDates, unconvertibleCount }
    : { kind: 'CONVERTED', displayCurrency, rateDates: sortedDates }
}

/**
 * Presentation of one per-event figure in a table cell.
 *
 * `null` renders as a dash rather than a zero: no price was ever resolved for the event, and a `0`
 * would state that it earned nothing. `UNCONVERTIBLE` renders its native amount followed by the
 * currency it is really in, because the column header names the display currency and a bare number
 * under it would assert a conversion that never happened.
 */
export function figureText(figure: ConvertedAmount | null): string {
  if (figure === null) return '—'
  const display = describeConvertedAmount(figure)
  return display.kind === 'UNCONVERTIBLE' ? `${display.text} ${display.currency}` : display.text
}

/**
 * Which of the four states a figure is in.
 *
 * Kept separate from the Tailwind class so the sign comparison happens once: an `UNCONVERTIBLE`
 * amount is usually positive, and any caller comparing it directly would paint a failed conversion
 * as a profit.
 */
export function figureTone(
  figure: ConvertedAmount | null,
): 'gain' | 'loss' | 'neutral' | 'unconverted' {
  if (figure === null) return 'neutral'
  if (figure.kind === 'UNCONVERTIBLE') return 'unconverted'
  const amount = Number(figure.amount)
  if (amount > 0) return 'gain'
  return amount < 0 ? 'loss' : 'neutral'
}

const TONE_CLASSES: Record<ReturnType<typeof figureTone>, string> = {
  gain: 'text-profit',
  loss: 'text-loss',
  neutral: 'text-muted-foreground',
  unconverted: 'text-warning',
}

export function figureClass(figure: ConvertedAmount | null): string {
  return TONE_CLASSES[figureTone(figure)]
}

/** Whether a figure earns a leading `+`. Only a genuine, converted gain does. */
export function isPositiveFigure(figure: ConvertedAmount | null): boolean {
  return figureTone(figure) === 'gain'
}
