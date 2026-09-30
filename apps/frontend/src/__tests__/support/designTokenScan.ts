import designSource from '../../../../../DESIGN.md?raw'

/**
 * Scans class strings for colour and surface utilities that do not resolve to a token the design
 * system defines. The token list is read from the design system file itself so a renamed or
 * removed token fails instead of silently leaving a class Tailwind can no longer generate.
 */

const COLOR_UTILITY =
  /(?<![\w-])((?:[\w\-[\]/.%(),]+:)*)(bg|text|border|ring|fill|stroke|from|to|via|outline|divide|decoration|accent|caret|shadow)-([a-z][a-z0-9-]*)(?:\/(\d{1,3}))?(?![\w-])/g

/** The shadcn aliases the design system names itself when it maps its tokens onto the primitives. */
const DESIGN_NAMED_ALIASES = ['background', 'foreground', 'card', 'primary', 'primary-foreground']

/** Utilities that share a prefix with a colour utility but are not colours. */
const NON_COLOR_NAMES = new Set([
  'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', 'display',
  'left', 'right', 'center', 'start', 'end', 'justify', 'wrap', 'nowrap', 'balance', 'pretty',
  'ellipsis', 'clip', 'b', 't', 'l', 'r', 'x', 'y', 's', 'e',
  'dashed', 'dotted', 'solid', 'none', 'transparent', 'current', 'inherit', 'hidden', 'auto',
  'opacity', 'offset', 'inset', 'spacing',
])

const GENERIC_PALETTE =
  /^(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(-|$)/

export function designColorTokens(source: string): Set<string> {
  const tokens = new Set<string>(DESIGN_NAMED_ALIASES)
  for (const match of source.matchAll(/--color-([a-z0-9-]+):/g)) tokens.add(match[1])
  return tokens
}

export function designShadowTokens(source: string): Set<string> {
  const tokens = new Set<string>()
  for (const match of source.matchAll(/--shadow-([a-z0-9-]+):/g)) tokens.add(match[1])
  return tokens
}

export function findUnresolvedClasses(source: string, colors: Set<string>, shadows: Set<string>): string[] {
  const unresolved: string[] = []
  for (const literal of source.match(/"[^"]*"|'[^']*'|`[^`]*`/g) ?? []) {
    COLOR_UTILITY.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = COLOR_UTILITY.exec(literal)) !== null) {
      const [whole, variants, prefix, name] = match
      if (variants.split(':').some((variant) => variant === 'dark')) {
        unresolved.push(whole)
        continue
      }
      if (prefix === 'shadow') {
        if (!shadows.has(name)) unresolved.push(whole)
        continue
      }
      if (NON_COLOR_NAMES.has(name)) continue
      if (/^\d/.test(name)) continue
      if (GENERIC_PALETTE.test(name) || !colors.has(name)) unresolved.push(whole)
    }
  }
  return unresolved
}

export const designSystemSource = designSource
