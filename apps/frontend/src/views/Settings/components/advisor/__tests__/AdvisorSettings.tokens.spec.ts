import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import {
  designColorTokens,
  designShadowTokens,
  designSystemSource,
  findUnresolvedClasses,
} from '@/__tests__/support/designTokenScan'
import { Card } from '@/components/ui/card'
import { byTestId, createSettingsPort, mountSettings, resetDom } from './advisorSettingsTestKit'

vi.mock('@/composables/useI18n', async () => {
  const { translateEnglish } = await import('./i18nMock')
  return { useI18n: () => ({ t: translateEnglish }) }
})

const featureSources = import.meta.glob<string>(['../*.vue', '../*.ts', '../composables/*.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const templatesOnly = Object.entries(featureSources).filter(([path]) => path.endsWith('.vue'))

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  resetDom()
})

describe('AI advisor settings section: design system', () => {
  it('renders as a card-wrapped section inside Settings', async () => {
    wrapper = await mountSettings(createSettingsPort())
    const section = byTestId(wrapper, 'advisor-settings')
    expect(section.exists()).toBe(true)
    expect(wrapper.findComponent(Card).element).toBe(section.element)
  })

  it('finds the feature sources it is supposed to scan', () => {
    const names = Object.keys(featureSources)
    expect(names.some((path) => path.endsWith('AdvisorSettings.vue'))).toBe(true)
    expect(names.some((path) => path.endsWith('ModelChainEditor.vue'))).toBe(true)
    expect(names.some((path) => path.endsWith('ExecutionProfilesEditor.vue'))).toBe(true)
  })

  it('resolves every colour, surface and shadow class to a DESIGN.md token', () => {
    const colors = designColorTokens(designSystemSource)
    const shadows = designShadowTokens(designSystemSource)
    const offenders = Object.entries(featureSources).flatMap(([path, source]) =>
      findUnresolvedClasses(source, colors, shadows).map((cls) => `${path}: ${cls}`),
    )
    expect(offenders).toEqual([])
  })

  it('builds its controls from the existing primitives instead of raw form elements', () => {
    const offenders = templatesOnly.flatMap(([path, source]) => {
      const template = source.slice(source.indexOf('<template>'))
      return ['<button', '<select', '<input', '<textarea'].filter((tag) => template.includes(tag)).map((tag) => `${path}: ${tag}`)
    })
    expect(offenders).toEqual([])
  })

  it('does not dress anything in the brand colour at rest', () => {
    const brandAtRest = templatesOnly.filter(([, source]) => /(?<![\w:-])(bg|text|border)-brand(?![\w-])/.test(source))
    expect(brandAtRest.map(([path]) => path)).toEqual([])
  })
})
