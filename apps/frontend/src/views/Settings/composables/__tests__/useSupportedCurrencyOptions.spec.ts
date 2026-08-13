/**
 * The selector may only offer currencies the FX ledger can serve.
 *
 * `SUPPORTED_CURRENCIES` is the set the money model and the FX ledger both agree on. A literal list
 * inside the component would drift from it silently, and the drift is only visible as an
 * unconvertible figure much later, in a different view.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SUPPORTED_CURRENCIES } from '@kryptofolio/shared-types'
import { supportedCurrencyOptions } from '../useSupportedCurrencyOptions'

const HERE = dirname(fileURLToPath(import.meta.url))

describe('supportedCurrencyOptions (task 9.6)', () => {
  it('offers exactly the currencies the FX ledger can serve', () => {
    expect(supportedCurrencyOptions().map((option) => option.code)).toEqual([
      ...SUPPORTED_CURRENCIES,
    ])
  })

  it('offers no currency outside that set', () => {
    for (const option of supportedCurrencyOptions()) {
      expect(SUPPORTED_CURRENCIES).toContain(option.code)
    }
  })

  it('derives a translation key per option rather than hard-coding a label', () => {
    for (const option of supportedCurrencyOptions()) {
      expect(option.labelKey).toBe(`settings.currency.option_${option.code.toLowerCase()}`)
    }
  })
})

describe('the component holds no list of its own (task 9.6)', () => {
  const source = readFileSync(
    join(HERE, '..', '..', 'components', 'CurrencySettings.vue'),
    'utf-8',
  )

  it('builds its options from the shared derivation', () => {
    expect(source).toContain('supportedCurrencyOptions')
  })

  it('contains no literal currency-code array', () => {
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    // Two or more quoted three-letter uppercase codes inside brackets — the literal-list shape.
    expect(stripped).not.toMatch(/\[\s*(['"][A-Z]{3}['"]\s*,\s*){1,}['"][A-Z]{3}['"]/)
  })
})
