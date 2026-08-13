/**
 * The frontend renders what the backend resolved.
 *
 * Two guards, both source-level because both defects are *absences* — nothing observable happens
 * when a second conversion path exists, it just quietly produces a second answer:
 *
 *   1. No rate multiplication anywhere outside the settings rate *label*, which states a rate
 *      rather than applying one. A figure converted twice is wrong by the square of the rate and
 *      looks perfectly plausible.
 *   2. No global Pinia store holding server data. Pinia Colada's cache is the store; a parallel
 *      `defineStore` holding a summary would serve a stale currency after a switch.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue
      out.push(...sourceFiles(full))
      continue
    }
    if (/\.(ts|vue)$/.test(entry) && !/\.(spec|test)\.ts$/.test(entry)) out.push(full)
  }
  return out
}

/** Comments carry the word "rate" in prose constantly; a scan over them is a scan over English. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

/**
 * Applying a rate: something rate-shaped as an operand of a multiplication or a division, in either
 * plain arithmetic or a Decimal/Money call.
 */
const RATE_APPLICATION =
  /(?:\.(?:mul|times|div|dividedBy)\s*\(\s*[^)]*\brate\b|\brate\b\s*[*/]|[*/]\s*(?:\w+\.)*\brate\b)/i

/**
 * `CurrencySettings.vue` formats the stored rate into a label (`USD/EUR = 0.988`). It states the
 * rate; it never multiplies a figure by it. The exemption is the file, and the assertion below
 * pins what the file is allowed to contain.
 */
const RATE_LABEL_ONLY = 'views/Settings/components/CurrencySettings.vue'

describe('no conversion arithmetic entered the frontend (task 9.7)', () => {
  const files = sourceFiles(SRC)

  it('scans a non-trivial number of files', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('applies a rate to a monetary figure nowhere', () => {
    const offenders = files
      .filter((file) => relative(SRC, file) !== RATE_LABEL_ONLY)
      .filter((file) => RATE_APPLICATION.test(stripComments(readFileSync(file, 'utf-8'))))
      .map((file) => relative(SRC, file))

    expect(offenders).toEqual([])
  })

  it('uses the one exempt file to state a rate, never to convert with it', () => {
    const source = stripComments(readFileSync(join(SRC, RATE_LABEL_ONLY), 'utf-8'))

    expect(source).toContain('formatRateLabel')
    expect(RATE_APPLICATION.test(source)).toBe(false)
  })
})

describe('no global Pinia store holds server data (task 9.7)', () => {
  it('defines no store at all outside the Colada cache', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => /\bdefineStore\s*\(/.test(stripComments(readFileSync(file, 'utf-8'))))
      .map((file) => relative(SRC, file))

    expect(offenders).toEqual([])
  })

  it('fetches the summary through a Colada query', () => {
    const source = readFileSync(join(SRC, 'composables/queries/usePortfolioQueries.ts'), 'utf-8')

    expect(source).toContain('useQuery')
    expect(source).toContain('portfolio-summary')
  })
})
