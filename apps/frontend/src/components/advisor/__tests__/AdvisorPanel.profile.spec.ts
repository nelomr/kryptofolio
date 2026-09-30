import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import type { AdvisorConfig } from '@/core/domain/models/AdvisorEntities'
import { useAdvisorPanel } from '@/composables/useAdvisorPanel'
import { createControlledPort, done, mountPanel, resetPanel, send } from './advisorTestKit'
import { copy } from './i18nMock'

vi.mock('@/composables/useI18n', async () => {
  const { translateEnglish } = await import('./i18nMock')
  return { useI18n: () => ({ t: translateEnglish }) }
})

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  resetPanel()
})

function configWith(chain: AdvisorConfig['chain']): AdvisorConfig {
  return { chain, providers: [] }
}

async function panelFor(chain: AdvisorConfig['chain']) {
  const harness = createControlledPort(configWith(chain))
  wrapper = await mountPanel(harness.port)
  await flushPromises()
  return { panel: wrapper, harness }
}

describe('model and execution badges', () => {
  it('shows the active model as a mono badge', async () => {
    const { panel } = await panelFor([{ providerId: 'anthropic', modelId: 'claude-sonnet' }])
    const badge = panel.find('[data-testid="advisor-model-badge"]')
    expect(badge.text()).toBe('claude-sonnet')
    expect(badge.classes()).toContain('font-mono')
  })

  it('labels a plain local ollama model "local"', async () => {
    const { panel } = await panelFor([{ providerId: 'ollama', modelId: 'llama3', contextWindow: 8192 }])
    const badge = panel.find('[data-testid="advisor-profile-badge"]')
    expect(badge.text()).toBe(copy('advisor.profile.local'))
    expect(badge.attributes('data-profile')).toBe('local')
  })

  it.each(['qwen3:cloud', 'gpt-oss:120b-cloud'])('labels an ollama model id %s "cloud", because it still leaves the machine', async (modelId) => {
    const { panel } = await panelFor([{ providerId: 'ollama', modelId }])
    const badge = panel.find('[data-testid="advisor-profile-badge"]')
    expect(badge.text()).toBe(copy('advisor.profile.cloud'))
    expect(badge.attributes('data-profile')).toBe('cloud')
  })

  it.each(['openai', 'anthropic', 'google', 'opencode', 'ollama-cloud'] as const)(
    'labels any %s model "cloud"',
    async (providerId) => {
      const { panel } = await panelFor([{ providerId, modelId: 'some-model' }])
      expect(panel.find('[data-testid="advisor-profile-badge"]').attributes('data-profile')).toBe('cloud')
    },
  )

  it('explains on the cloud badge that requests leave the machine', async () => {
    const { panel } = await panelFor([{ providerId: 'openai', modelId: 'gpt' }])
    expect(panel.find('[data-testid="advisor-profile-badge"]').attributes('title')).toBe(
      copy('advisor.profile.cloud_hint'),
    )
  })

  it('shows neither badge before a chain is configured', async () => {
    const { panel } = await panelFor([])
    expect(panel.find('[data-testid="advisor-model-badge"]').exists()).toBe(false)
    expect(panel.find('[data-testid="advisor-profile-badge"]').exists()).toBe(false)
  })

  it('switches to the model that actually answered once a run completes', async () => {
    const { panel, harness } = await panelFor([{ providerId: 'ollama', modelId: 'llama3', contextWindow: 8192 }])
    await send(panel, 'hello')
    harness.lastRun.push(done({ providerId: 'anthropic', modelId: 'claude-fallback', executionProfile: 'mixed' }))
    await flushPromises()

    expect(panel.find('[data-testid="advisor-model-badge"]').text()).toBe('claude-fallback')
    expect(panel.find('[data-testid="advisor-profile-badge"]').attributes('data-profile')).toBe('cloud')
  })
})

describe('config loading', () => {
  it('does not ask the server for the model chain until the panel is opened', async () => {
    const harness = createControlledPort(configWith([{ providerId: 'openai', modelId: 'gpt' }]))
    wrapper = await mountPanel(harness.port, { open: false })
    expect(harness.port.getConfig).not.toHaveBeenCalled()

    useAdvisorPanel().open()
    await flushPromises()

    expect(harness.port.getConfig).toHaveBeenCalledTimes(1)
  })
})
