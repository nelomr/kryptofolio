import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { Select } from '@/components/ui/select'
import {
  EMPTY_CONFIG,
  allByTestId,
  byTestId,
  chooseProvider,
  click,
  configWith,
  createSettingsPort,
  mountSettings,
  resetDom,
  typeInto,
} from './advisorSettingsTestKit'
import { copy } from './i18nMock'

vi.mock('@/composables/useI18n', async () => {
  const { translateEnglish } = await import('./i18nMock')
  return { useI18n: () => ({ t: translateEnglish }) }
})

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  resetDom()
})

const chain = [
  { providerId: 'openai', modelId: 'gpt-5' },
  { providerId: 'ollama', modelId: 'llama3', contextWindow: 8192 },
  { providerId: 'ollama', modelId: 'gpt-oss:cloud' },
] as const

describe('model chain editor: entries', () => {
  it('renders the stored entries in order', async () => {
    wrapper = await mountSettings(createSettingsPort(configWith(chain)))

    const models = allByTestId(wrapper, 'entry-model').map((input) => (input.element as HTMLInputElement).value)
    expect(models).toEqual(['gpt-5', 'llama3', 'gpt-oss:cloud'])
    expect(wrapper.findAllComponents(Select)).toHaveLength(3)
  })

  it('adds an entry at the end and removes a chosen one', async () => {
    wrapper = await mountSettings(createSettingsPort(configWith(chain)))

    await click(wrapper, 'chain-add')
    expect(allByTestId(wrapper, 'chain-entry')).toHaveLength(4)

    await click(wrapper, 'entry-remove', 0)
    const models = allByTestId(wrapper, 'entry-model').map((input) => (input.element as HTMLInputElement).value)
    expect(models).toEqual(['llama3', 'gpt-oss:cloud', ''])
  })

  it('reorders with move up and move down buttons, no pointer drag involved', async () => {
    wrapper = await mountSettings(createSettingsPort(configWith(chain)))

    await click(wrapper, 'entry-move-down', 0)
    let models = allByTestId(wrapper, 'entry-model').map((input) => (input.element as HTMLInputElement).value)
    expect(models).toEqual(['llama3', 'gpt-5', 'gpt-oss:cloud'])

    await click(wrapper, 'entry-move-up', 2)
    models = allByTestId(wrapper, 'entry-model').map((input) => (input.element as HTMLInputElement).value)
    expect(models).toEqual(['llama3', 'gpt-oss:cloud', 'gpt-5'])
  })

  it('cannot move the first entry up or the last entry down', async () => {
    wrapper = await mountSettings(createSettingsPort(configWith(chain)))

    const up = allByTestId(wrapper, 'entry-move-up')
    const down = allByTestId(wrapper, 'entry-move-down')
    expect(up[0].attributes('disabled')).toBeDefined()
    expect(up[1].attributes('disabled')).toBeUndefined()
    expect(down[2].attributes('disabled')).toBeDefined()
    expect(down[1].attributes('disabled')).toBeUndefined()
  })

  it('names each move and remove button by its position so a screen reader can tell them apart', async () => {
    wrapper = await mountSettings(createSettingsPort(configWith(chain)))

    expect(allByTestId(wrapper, 'entry-move-up')[1].attributes('aria-label')).toBe(
      copy('settings.advisor.chain.entry.move_up', { position: '2' }),
    )
    expect(allByTestId(wrapper, 'entry-remove')[2].attributes('aria-label')).toBe(
      copy('settings.advisor.chain.entry.remove', { position: '3' }),
    )
  })

  it('saves the edited order through the port', async () => {
    const port = createSettingsPort(configWith(chain))
    wrapper = await mountSettings(port)

    await click(wrapper, 'entry-move-down', 0)
    await click(wrapper, 'chain-save')

    expect(port.setModelChain).toHaveBeenCalledWith([
      { providerId: 'ollama', modelId: 'llama3', contextWindow: 8192 },
      { providerId: 'openai', modelId: 'gpt-5' },
      { providerId: 'ollama', modelId: 'gpt-oss:cloud' },
    ])
  })
})

describe('model chain editor: contextWindow input', () => {
  it('appears only on a local ollama entry and is absent, not disabled, everywhere else', async () => {
    wrapper = await mountSettings(createSettingsPort(configWith(chain)))

    const rows = allByTestId(wrapper, 'chain-entry')
    expect(rows[0].find('[data-testid="entry-context-window"]').exists()).toBe(false)
    expect(rows[1].find('[data-testid="entry-context-window"]').exists()).toBe(true)
    expect(rows[2].find('[data-testid="entry-context-window"]').exists()).toBe(false)
  })

  it('shows and hides as the provider and the model id change', async () => {
    wrapper = await mountSettings(createSettingsPort(configWith([{ providerId: 'openai', modelId: 'gpt-5' }])))
    expect(allByTestId(wrapper, 'entry-context-window')).toHaveLength(0)

    await chooseProvider(wrapper, 0, 'ollama')
    expect(allByTestId(wrapper, 'entry-context-window')).toHaveLength(1)

    await typeInto(wrapper, 'entry-model', 'gpt-oss:cloud')
    expect(allByTestId(wrapper, 'entry-context-window')).toHaveLength(0)

    await typeInto(wrapper, 'entry-model', 'llama3')
    expect(allByTestId(wrapper, 'entry-context-window')).toHaveLength(1)
  })

  it('never sends a contextWindow for an entry that stopped being local', async () => {
    const port = createSettingsPort(configWith([{ providerId: 'ollama', modelId: 'llama3', contextWindow: 8192 }]))
    wrapper = await mountSettings(port)

    await chooseProvider(wrapper, 0, 'anthropic')
    await click(wrapper, 'chain-save')

    expect(port.setModelChain).toHaveBeenCalledWith([{ providerId: 'anthropic', modelId: 'llama3' }])
  })

  it('refuses to save a local entry without a context window and says why next to it', async () => {
    const port = createSettingsPort(configWith([{ providerId: 'ollama', modelId: 'llama3', contextWindow: 8192 }]))
    wrapper = await mountSettings(port)

    await typeInto(wrapper, 'entry-context-window', '')
    await click(wrapper, 'chain-save')

    expect(port.setModelChain).not.toHaveBeenCalled()
    expect(byTestId(wrapper, 'entry-error').text()).toBe(copy('settings.advisor.chain.error.context_window_required'))
  })

  it.each(['0', '-4', '12.5', 'abc'])('refuses the context window %s', async (value) => {
    const port = createSettingsPort(configWith([{ providerId: 'ollama', modelId: 'llama3', contextWindow: 8192 }]))
    wrapper = await mountSettings(port)

    await typeInto(wrapper, 'entry-context-window', value)
    await click(wrapper, 'chain-save')

    expect(port.setModelChain).not.toHaveBeenCalled()
    expect(byTestId(wrapper, 'entry-error').exists()).toBe(true)
  })

  it('refuses an entry with no model id', async () => {
    const port = createSettingsPort(EMPTY_CONFIG)
    wrapper = await mountSettings(port)

    await click(wrapper, 'chain-add')
    await click(wrapper, 'chain-save')

    expect(port.setModelChain).not.toHaveBeenCalled()
    expect(byTestId(wrapper, 'entry-error').text()).toBe(copy('settings.advisor.chain.error.model_required'))
  })
})

describe('model chain editor: derived classification', () => {
  it('labels each entry Local or Cloud and Local or Metered limits from the shared classifier', async () => {
    wrapper = await mountSettings(createSettingsPort(configWith(chain)))

    const locality = allByTestId(wrapper, 'entry-locality')
    const profile = allByTestId(wrapper, 'entry-profile')
    expect(locality.map((badge) => badge.text())).toEqual([
      copy('settings.advisor.locality.cloud'),
      copy('settings.advisor.locality.local'),
      copy('settings.advisor.locality.cloud'),
    ])
    expect(profile.map((badge) => badge.text())).toEqual([
      copy('settings.advisor.profile.metered'),
      copy('settings.advisor.profile.local'),
      copy('settings.advisor.profile.metered'),
    ])
  })

  it('presents an ollama model id ending :cloud as cloud even though the provider is ollama', async () => {
    wrapper = await mountSettings(createSettingsPort(configWith([{ providerId: 'ollama', modelId: 'gpt-oss:cloud' }])))

    expect(byTestId(wrapper, 'entry-locality').attributes('data-locality')).toBe('cloud')
    expect(byTestId(wrapper, 'entry-profile').attributes('data-profile')).toBe('metered')
  })

  it('follows an edit immediately, with nothing stored on the row', async () => {
    wrapper = await mountSettings(createSettingsPort(configWith([{ providerId: 'openai', modelId: 'gpt-5' }])))
    expect(byTestId(wrapper, 'entry-profile').attributes('data-profile')).toBe('metered')

    await chooseProvider(wrapper, 0, 'ollama')

    expect(byTestId(wrapper, 'entry-locality').attributes('data-locality')).toBe('local')
    expect(byTestId(wrapper, 'entry-profile').attributes('data-profile')).toBe('local')
  })
})

describe('model chain editor: cloud-suffixed ollama ids', () => {
  it.each(['gpt-oss:120b-cloud', 'minimax-m2:cloud'])(
    'presents %s as cloud, metered and without a contextWindow input',
    async (modelId) => {
      wrapper = await mountSettings(createSettingsPort(configWith([{ providerId: 'ollama', modelId }])))

      expect(byTestId(wrapper, 'entry-locality').attributes('data-locality')).toBe('cloud')
      expect(byTestId(wrapper, 'entry-profile').attributes('data-profile')).toBe('metered')
      expect(allByTestId(wrapper, 'entry-context-window')).toHaveLength(0)
    },
  )

  it('drops the contextWindow from what is sent once the id becomes cloud-suffixed, and saves', async () => {
    const port = createSettingsPort(configWith([{ providerId: 'ollama', modelId: 'llama3', contextWindow: 8192 }]))
    wrapper = await mountSettings(port)

    await typeInto(wrapper, 'entry-model', 'gpt-oss:120b-cloud')
    expect(allByTestId(wrapper, 'entry-context-window')).toHaveLength(0)
    await click(wrapper, 'chain-save')

    expect(port.setModelChain).toHaveBeenCalledWith([{ providerId: 'ollama', modelId: 'gpt-oss:120b-cloud' }])
  })

  it('asks for a contextWindow again, and refuses to save without it, when the id goes back to a local one', async () => {
    const port = createSettingsPort(configWith([{ providerId: 'ollama', modelId: 'gpt-oss:120b-cloud' }]))
    wrapper = await mountSettings(port)

    await typeInto(wrapper, 'entry-model', 'llama3')
    expect(allByTestId(wrapper, 'entry-context-window')).toHaveLength(1)
    await click(wrapper, 'chain-save')

    expect(port.setModelChain).not.toHaveBeenCalled()
    expect(byTestId(wrapper, 'entry-error').text()).toBe(copy('settings.advisor.chain.error.context_window_required'))
  })
})

describe('model chain editor: ollama-cloud suffix hint', () => {
  it.each(['gpt-oss:120b-cloud', 'minimax-m2:cloud'])(
    'hints that ollama-cloud uses the plain API names when the id is %s',
    async (modelId) => {
      wrapper = await mountSettings(createSettingsPort(configWith([{ providerId: 'ollama-cloud', modelId }])))

      expect(byTestId(wrapper, 'entry-suffix-hint').text()).toBe(copy('settings.advisor.chain.entry.cloud_suffix_hint'))
    },
  )

  it('does not hint for a plain ollama-cloud id, nor for the ollama provider with a suffixed id', async () => {
    wrapper = await mountSettings(
      createSettingsPort(
        configWith([
          { providerId: 'ollama-cloud', modelId: 'gpt-oss:120b' },
          { providerId: 'ollama', modelId: 'gpt-oss:120b-cloud' },
        ]),
      ),
    )

    expect(allByTestId(wrapper, 'entry-suffix-hint')).toHaveLength(0)
  })

  it('appears and disappears as the id is edited, and never blocks saving', async () => {
    const port = createSettingsPort(configWith([{ providerId: 'ollama-cloud', modelId: 'gpt-oss:120b' }]))
    wrapper = await mountSettings(port)

    await typeInto(wrapper, 'entry-model', 'gpt-oss:120b-cloud')
    expect(allByTestId(wrapper, 'entry-suffix-hint')).toHaveLength(1)
    await click(wrapper, 'chain-save')
    expect(port.setModelChain).toHaveBeenCalledWith([{ providerId: 'ollama-cloud', modelId: 'gpt-oss:120b-cloud' }])

    await typeInto(wrapper, 'entry-model', 'gpt-oss:120b')
    expect(allByTestId(wrapper, 'entry-suffix-hint')).toHaveLength(0)
  })
})

describe('model chain editor: credential flags', () => {
  it('flags an entry whose provider has no credential, pointing at the credentials section', async () => {
    wrapper = await mountSettings(createSettingsPort(configWith([{ providerId: 'anthropic', modelId: 'claude-sonnet' }])))

    const flag = byTestId(wrapper, 'entry-credential-flag')
    expect(flag.attributes('data-state')).toBe('absent')
    expect(flag.text()).toContain(copy('settings.advisor.credential.absent'))
    expect(flag.find('a').attributes('href')).toBe('#vault-credentials')
  })

  it('flags an entry whose vault is locked', async () => {
    wrapper = await mountSettings(createSettingsPort(configWith([{ providerId: 'google', modelId: 'gemini' }])))

    const flag = byTestId(wrapper, 'entry-credential-flag')
    expect(flag.attributes('data-state')).toBe('locked')
    expect(flag.text()).toContain(copy('settings.advisor.credential.locked'))
  })

  it('does not flag a provider with a credential', async () => {
    wrapper = await mountSettings(createSettingsPort(configWith([{ providerId: 'openai', modelId: 'gpt-5' }])))

    expect(byTestId(wrapper, 'entry-credential-flag').exists()).toBe(false)
  })

  it('never flags ollama, local or cloud, even though it holds no credential', async () => {
    wrapper = await mountSettings(
      createSettingsPort(
        configWith([
          { providerId: 'ollama', modelId: 'llama3', contextWindow: 8192 },
          { providerId: 'ollama', modelId: 'gpt-oss:cloud' },
        ]),
      ),
    )

    expect(allByTestId(wrapper, 'entry-credential-flag')).toHaveLength(0)
  })

  it('updates the flag when the provider is changed', async () => {
    wrapper = await mountSettings(createSettingsPort(configWith([{ providerId: 'openai', modelId: 'gpt-5' }])))

    await chooseProvider(wrapper, 0, 'anthropic')

    expect(byTestId(wrapper, 'entry-credential-flag').attributes('data-state')).toBe('absent')
  })
})

describe('model chain editor: empty state', () => {
  it('explains that the advisor answers "no model available" until a chain exists', async () => {
    wrapper = await mountSettings(createSettingsPort(EMPTY_CONFIG))

    const empty = byTestId(wrapper, 'chain-empty')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain(copy('settings.advisor.chain.empty.body'))
    expect(copy('settings.advisor.chain.empty.body').toLowerCase()).toContain('no model available')
    expect(allByTestId(wrapper, 'chain-entry')).toHaveLength(0)
  })

  it('goes away once an entry is added', async () => {
    wrapper = await mountSettings(createSettingsPort(EMPTY_CONFIG))

    await click(wrapper, 'chain-add')

    expect(byTestId(wrapper, 'chain-empty').exists()).toBe(false)
  })

  it('refuses to save an empty chain', async () => {
    const port = createSettingsPort(configWith([{ providerId: 'openai', modelId: 'gpt-5' }]))
    wrapper = await mountSettings(port)

    await click(wrapper, 'entry-remove', 0)
    await click(wrapper, 'chain-save')

    expect(port.setModelChain).not.toHaveBeenCalled()
    expect(byTestId(wrapper, 'chain-error').text()).toBe(copy('settings.advisor.chain.error.empty'))
  })
})

describe('model chain editor: save states', () => {
  it('shows saving while the request is in flight, then saved', async () => {
    const port = createSettingsPort(configWith([{ providerId: 'openai', modelId: 'gpt-5' }]))
    let release: () => void = () => undefined
    vi.mocked(port.setModelChain).mockImplementation(() => new Promise<void>((resolve) => (release = resolve)))
    wrapper = await mountSettings(port)

    await click(wrapper, 'chain-save')
    expect(byTestId(wrapper, 'chain-status').attributes('data-state')).toBe('saving')
    expect(byTestId(wrapper, 'chain-save').attributes('disabled')).toBeDefined()

    release()
    await flushPromises()
    expect(byTestId(wrapper, 'chain-status').attributes('data-state')).toBe('saved')
    expect(byTestId(wrapper, 'chain-status').text()).toBe(copy('settings.advisor.chain.saved'))
  })

  it('shows the failure inline and keeps every edit so the user can fix and resubmit', async () => {
    const port = createSettingsPort(configWith([{ providerId: 'openai', modelId: 'gpt-5' }]))
    vi.mocked(port.setModelChain).mockRejectedValueOnce(new Error('rejected'))
    wrapper = await mountSettings(port)

    await typeInto(wrapper, 'entry-model', 'gpt-5-mini')
    await click(wrapper, 'chain-save')

    expect(byTestId(wrapper, 'chain-status').attributes('data-state')).toBe('failed')
    expect(byTestId(wrapper, 'chain-status').text()).toBe(copy('settings.advisor.chain.failed'))
    expect((byTestId(wrapper, 'entry-model').element as HTMLInputElement).value).toBe('gpt-5-mini')

    await click(wrapper, 'chain-save')
    expect(port.setModelChain).toHaveBeenCalledTimes(2)
    expect(byTestId(wrapper, 'chain-status').attributes('data-state')).toBe('saved')
  })

  it('drops a stale saved or failed message as soon as the chain is edited again', async () => {
    const port = createSettingsPort(configWith([{ providerId: 'openai', modelId: 'gpt-5' }]))
    wrapper = await mountSettings(port)

    await click(wrapper, 'chain-save')
    expect(byTestId(wrapper, 'chain-status').attributes('data-state')).toBe('saved')

    await typeInto(wrapper, 'entry-model', 'gpt-5-mini')
    expect(byTestId(wrapper, 'chain-status').exists()).toBe(false)
  })
})
