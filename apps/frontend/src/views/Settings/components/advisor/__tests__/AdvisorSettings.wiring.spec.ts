import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { en } from '@/i18n/dictionaries/en'
import { es } from '@/i18n/dictionaries/es'
import { byTestId, click, configWith, createSettingsPort, mountSettings, resetDom } from './advisorSettingsTestKit'

const translate = vi.fn((key: string, params?: Record<string, string>) => {
  void params
  return key
})
vi.mock('@/composables/useI18n', () => ({ useI18n: () => ({ t: translate }) }))

const featureSources = import.meta.glob<string>(['../*.vue', '../*.ts', '../composables/*.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
})
const mutationSource = import.meta.glob<string>('../../../../../composables/queries/useAdvisorMutations.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
})

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  resetDom()
  translate.mockClear()
})

describe('AI advisor settings section: i18n', () => {
  it('routes every rendered string through the translator', async () => {
    wrapper = await mountSettings(createSettingsPort(configWith([{ providerId: 'anthropic', modelId: 'claude' }])))

    const visible = wrapper.text().replace(/\s+/g, ' ').trim()
    const keyed = visible.split(' ').filter((word) => word !== '' && !word.includes('.') && !/^[\d,]+$/.test(word))
    expect(keyed).toEqual([])
    expect(translate).toHaveBeenCalled()
  })

  it('has no hardcoded user-facing literal in any template', () => {
    const offenders = Object.entries(featureSources)
      .filter(([path]) => path.endsWith('.vue'))
      .flatMap(([path, source]) => {
        const template = source.slice(source.indexOf('<template>'))
        const textNodes = [...template.matchAll(/>([^<>{}]*[A-Za-z]{2,}[^<>{}]*)</g)].map((match) => match[1].trim())
        return textNodes.filter((text) => text !== '').map((text) => `${path}: ${text}`)
      })
    expect(offenders).toEqual([])
  })

  it('defines every settings.advisor key in both dictionaries', () => {
    const keys = Object.keys(en).filter((key) => key.startsWith('settings.advisor.'))
    expect(keys.length).toBeGreaterThan(20)
    expect(keys.filter((key) => es[key] === undefined)).toEqual([])
    expect(Object.keys(es).filter((key) => key.startsWith('settings.advisor.') && en[key] === undefined)).toEqual([])
  })

  it('defines every key the feature sources reference', () => {
    const referenced = Object.values(featureSources).flatMap((source) =>
      [...source.matchAll(/['"`](settings\.advisor\.[A-Za-z0-9_.{}$-]+)['"`]/g)].map((match) => match[1]),
    )
    const literal = referenced.filter((key) => !key.includes('${'))
    expect(literal.filter((key) => en[key] === undefined)).toEqual([])
  })
})

describe('AI advisor settings section: data access', () => {
  it('reads the chain, providers and profiles through the advisor port', async () => {
    const port = createSettingsPort()
    wrapper = await mountSettings(port)

    expect(port.getConfig).toHaveBeenCalledTimes(1)
    expect(port.getExecutionProfiles).toHaveBeenCalledTimes(1)
  })

  it('writes through Pinia Colada mutations, not raw calls in a component', async () => {
    const source = Object.values(mutationSource)[0] ?? ''
    expect(source).toContain('useMutation')
    expect(source).toContain('setModelChain')
    expect(source).toContain('setExecutionProfiles')
    for (const [path, component] of Object.entries(featureSources)) {
      expect(component, path).not.toMatch(/port\.(setModelChain|setExecutionProfiles|getConfig|getExecutionProfiles)/)
      expect(component, path).not.toMatch(/\bfetch\(|axios/)
    }
  })

  it('refreshes the config after saving a chain so the chat panel sees the new order', async () => {
    const port = createSettingsPort(configWith([{ providerId: 'openai', modelId: 'gpt-5' }]))
    wrapper = await mountSettings(port)

    await click(wrapper, 'chain-save')
    await flushPromises()

    expect(port.getConfig).toHaveBeenCalledTimes(2)
  })

  it('reuses the vault credential entry instead of offering API key inputs of its own', async () => {
    wrapper = await mountSettings(createSettingsPort(configWith([{ providerId: 'anthropic', modelId: 'claude' }])))

    expect(wrapper.find('input[type="password"]').exists()).toBe(false)
    expect(byTestId(wrapper, 'entry-credential-flag').find('a').attributes('href')).toBe('#vault-credentials')
  })

  it('shows a skeleton geometry while the config loads', async () => {
    const port = createSettingsPort()
    vi.mocked(port.getConfig).mockReturnValue(new Promise(() => undefined))
    wrapper = await mountSettings(port)

    expect(byTestId(wrapper, 'advisor-settings-loading').exists()).toBe(true)
  })
})
