/**
 * Enforces DESIGN.md golden rule 3 — the brand colour is used at most twice per view.
 *
 * The rule was decorative for as long as "a use" was undefined: a raw token count scores a
 * `border-primary/10` hairline the same as a solid `bg-brand` fill, and no one can act on that
 * number. This counts what the rule's operational definition describes — a *saturated, resting*
 * application — and one class attribute carrying a fill plus its matching border is one brand
 * moment, not two.
 *
 * @see DESIGN.md §4 rule 3
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VIEWS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'views')

/** Brand budget per view, from DESIGN.md rule 3. */
const BUDGET = 2

/**
 * A quoted string literal: every class attribute is one, and so is every entry of a class map in
 * `<script setup>`. Taking the literal as the unit is what makes `bg-brand … border-brand` count
 * once — they dress a single element.
 */
const STRING_LITERAL = /"[^"]*"|'[^']*'|`[^`]*`/g

/**
 * A brand utility, with any leading Tailwind variants and any trailing opacity captured so both can
 * be tested for exemption.
 */
const BRAND_UTILITY =
  /((?:[A-Za-z0-9_\-[\]/.%,():]+?:)*)(?:text|bg|border|ring|fill|stroke|from|to|via|outline|divide|shadow|decoration|accent|caret)-(?:primary|brand)(-hover|-soft|-medium|-foreground)?(?:\/(\d{1,3}))?\b/g

/** Variants that describe a transient state, so the view at rest does not carry the colour. */
const TRANSIENT_VARIANT = /(?:^|:)(?:group-)?(?:hover|focus|focus-visible|focus-within|active)(?:\/[A-Za-z0-9_-]+)?:/

/** `--brand-soft` is alpha 0.08 and `--brand-medium` is 0.14; both sit under the 40% exemption. */
const TINTED_TOKEN = new Set(['-soft', '-medium'])

export function countBrandUses(source: string): number {
  let uses = 0
  for (const literal of source.match(STRING_LITERAL) ?? []) {
    BRAND_UTILITY.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = BRAND_UTILITY.exec(literal)) !== null) {
      const [, variants, token, opacity] = match
      if (TRANSIENT_VARIANT.test(variants ?? '')) continue
      // `-hover` is the hover token itself; `-foreground` is the contrast colour laid over brand,
      // not an application of the brand colour.
      if (token === '-hover' || token === '-foreground') continue
      if (token !== undefined && TINTED_TOKEN.has(token)) continue
      if (opacity !== undefined && Number(opacity) <= 40) continue
      uses += 1
      break // one saturated brand utility in a class attribute is one brand moment
    }
  }
  return uses
}

function vueFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory()
      ? vueFilesUnder(path)
      : path.endsWith('.vue')
        ? [path]
        : []
  })
}

const VIEWS = readdirSync(VIEWS_DIR).filter((entry) =>
  statSync(join(VIEWS_DIR, entry)).isDirectory(),
)

describe('DESIGN.md rule 3 — budgeted brand', () => {
  it.each(VIEWS)('%s spends the brand at most twice', (view) => {
    const perFile = vueFilesUnder(join(VIEWS_DIR, view))
      .map((file) => [file.slice(VIEWS_DIR.length + 1), countBrandUses(readFileSync(file, 'utf8'))] as const)
      .filter(([, uses]) => uses > 0)

    const total = perFile.reduce((sum, [, uses]) => sum + uses, 0)

    expect(total, `brand uses in ${view}: ${JSON.stringify(Object.fromEntries(perFile))}`).toBeLessThanOrEqual(BUDGET)
  })

  it('counts a saturated fill as a use', () => {
    expect(countBrandUses('class="bg-brand text-white"')).toBe(1)
  })

  it('counts a fill and its matching border on one element once', () => {
    expect(countBrandUses('class="bg-brand text-white border-brand"')).toBe(1)
  })

  it('counts two separate elements separately', () => {
    expect(countBrandUses('class="bg-primary"\nclass="text-primary"')).toBe(2)
  })

  it('exempts a hover state, which the view does not carry at rest', () => {
    expect(countBrandUses('class="hover:bg-primary"')).toBe(0)
  })

  it('exempts a scoped group-hover state', () => {
    expect(countBrandUses('class="group-hover/toggle:text-primary"')).toBe(0)
  })

  it('exempts a focus ring, which §1.3 sanctions as a brand context', () => {
    expect(countBrandUses('class="focus:border-primary/50"')).toBe(0)
  })

  it('exempts a hairline at 10% opacity', () => {
    expect(countBrandUses('class="border-primary/10"')).toBe(0)
  })

  it('exempts a tinted gradient at 20% and 5%', () => {
    expect(countBrandUses('class="bg-linear-to-r from-primary/20 to-primary/5"')).toBe(0)
  })

  it('exempts the soft and medium tokens, whose alpha is already under 40%', () => {
    expect(countBrandUses('class="bg-brand-soft"')).toBe(0)
    expect(countBrandUses('class="bg-brand-medium"')).toBe(0)
  })

  it('does not count the contrast colour laid over a brand fill as a use of its own', () => {
    // Asserted alone, not beside a fill: with a fill present the per-literal collapse would make
    // this pass whether the exemption exists or not.
    expect(countBrandUses('class="text-primary-foreground"')).toBe(0)
    expect(countBrandUses('class="bg-primary text-primary-foreground"')).toBe(1)
  })

  it('counts an application at 50% opacity, which is above the exemption', () => {
    expect(countBrandUses('class="bg-primary/50"')).toBe(1)
  })
})
