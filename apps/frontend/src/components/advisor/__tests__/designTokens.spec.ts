import { describe, it, expect } from 'vitest'
import {
  designColorTokens,
  designShadowTokens,
  designSystemSource as designSource,
  findUnresolvedClasses,
} from '../../../__tests__/support/designTokenScan'

/**
 * Every colour and surface utility the panel writes must resolve to a token the design system
 * defines. The token list is read from the design system file itself so a renamed or removed token
 * fails here instead of silently leaving a class that Tailwind can no longer generate.
 */

const panelSources = import.meta.glob<string>(['../*.vue', '../*.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

describe('chat panel design tokens', () => {
  const colors = designColorTokens(designSource)
  const shadows = designShadowTokens(designSource)

  it('reads a real token vocabulary out of DESIGN.md', () => {
    expect(colors.has('surface-3')).toBe(true)
    expect(colors.has('info-soft')).toBe(true)
    expect(shadows.has('modal')).toBe(true)
  })

  it('flags an invented or generic class, so a clean result below is not vacuous', () => {
    expect(findUnresolvedClasses('class="bg-blue-500 text-muted"', colors, shadows)).toEqual(['bg-blue-500'])
    expect(findUnresolvedClasses('class="bg-made-up"', colors, shadows)).toEqual(['bg-made-up'])
    expect(findUnresolvedClasses('class="dark:bg-surface"', colors, shadows)).toEqual(['dark:bg-surface'])
    expect(findUnresolvedClasses('class="shadow-xl"', colors, shadows)).toEqual(['shadow-xl'])
    expect(findUnresolvedClasses('class="text-sm border-b bg-info-soft/40 hover:bg-surface-2"', colors, shadows)).toEqual([])
  })

  it('finds the panel sources it is supposed to scan', () => {
    expect(Object.keys(panelSources).some((path) => path.endsWith('AdvisorPanel.vue'))).toBe(true)
  })

  it('resolves every colour and surface class in the panel to a DESIGN.md token', () => {
    const offenders = Object.entries(panelSources).flatMap(([path, source]) =>
      findUnresolvedClasses(source, colors, shadows).map((cls) => `${path}: ${cls}`),
    )
    expect(offenders).toEqual([])
  })
})
