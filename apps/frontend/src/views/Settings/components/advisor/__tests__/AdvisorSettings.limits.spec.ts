import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import {
  ADVISOR_TOOL_NAMES,
  defaultExecutionProfiles,
  deriveLocalRunBudget,
  deriveLocalToolBudget,
} from '@kryptofolio/shared-types'
import {
  allByTestId,
  byTestId,
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

const LIMIT_FIELDS = ['maxSteps', 'lastMessages', 'topNHoldings', 'lotsPageSize', 'rowsPageSize'] as const
const defaults = defaultExecutionProfiles()

const inputValue = (w: VueWrapper, testId: string) => (byTestId(w, testId).element as HTMLInputElement).value

describe('execution profiles editor: fields', () => {
  it('shows the stored metered limits and per-tool budgets as numeric inputs', async () => {
    wrapper = await mountSettings(createSettingsPort())

    for (const field of LIMIT_FIELDS) {
      expect(byTestId(wrapper, `limit-input-${field}`).attributes('type')).toBe('number')
      expect(inputValue(wrapper, `limit-input-${field}`)).toBe(String(defaults.metered[field]))
    }
    for (const tool of ADVISOR_TOOL_NAMES) {
      expect(inputValue(wrapper, `budget-input-${tool}`)).toBe(String(defaults.metered.toolBudgets[tool]))
    }
  })

  it('switches to the local profile, whose limits have no editable per-tool budgets', async () => {
    wrapper = await mountSettings(createSettingsPort())

    await click(wrapper, 'profile-tab-local')

    expect(byTestId(wrapper, 'profile-tab-local').attributes('aria-pressed')).toBe('true')
    for (const field of LIMIT_FIELDS) {
      expect(inputValue(wrapper, `limit-input-${field}`)).toBe(String(defaults.local[field]))
    }
    expect(allByTestId(wrapper, 'budget-input-portfolio_summary')).toHaveLength(0)
  })

  it('saves an edited value through the port with the other profile untouched', async () => {
    const port = createSettingsPort()
    wrapper = await mountSettings(port)

    await typeInto(wrapper, 'limit-input-maxSteps', '8')
    await click(wrapper, 'limits-save')

    expect(port.setExecutionProfiles).toHaveBeenCalledWith({
      ...defaults,
      metered: { ...defaults.metered, maxSteps: 8 },
    })
  })
})

describe('execution profiles editor: local budgets are derived, never edited', () => {
  it('renders read-only derived values from each local entry’s declared context window', async () => {
    wrapper = await mountSettings(
      createSettingsPort(
        configWith([
          { providerId: 'ollama', modelId: 'llama3', contextWindow: 8192 },
          { providerId: 'openai', modelId: 'gpt-5' },
        ]),
      ),
    )
    await click(wrapper, 'profile-tab-local')

    const derived = byTestId(wrapper, 'derived-budgets')
    expect(derived.exists()).toBe(true)
    expect(derived.find('input').exists()).toBe(false)
    expect(byTestId(wrapper, 'derived-tool-budget').text()).toContain(String(deriveLocalToolBudget(8192)))
    expect(byTestId(wrapper, 'derived-run-budget').text()).toContain(String(deriveLocalRunBudget(8192)))
    expect(allByTestId(wrapper, 'derived-entry')).toHaveLength(1)
  })

  it('explains where the numbers will come from when no local model is in the chain', async () => {
    wrapper = await mountSettings(createSettingsPort(configWith([{ providerId: 'openai', modelId: 'gpt-5' }])))
    await click(wrapper, 'profile-tab-local')

    expect(byTestId(wrapper, 'derived-budgets-none').text()).toBe(copy('settings.advisor.limits.local_budgets.none'))
    expect(allByTestId(wrapper, 'derived-tool-budget')).toHaveLength(0)
  })

  it('never sends a local budget in the saved settings', async () => {
    const port = createSettingsPort(configWith([{ providerId: 'ollama', modelId: 'llama3', contextWindow: 8192 }]))
    wrapper = await mountSettings(port)
    await click(wrapper, 'profile-tab-local')
    await click(wrapper, 'limits-save')

    const sent = vi.mocked(port.setExecutionProfiles).mock.calls[0][0]
    expect(Object.keys(sent.local)).not.toContain('toolBudgets')
  })
})

describe('execution profiles editor: ceilings', () => {
  it.each([
    ['maxSteps', '31', 30],
    ['lastMessages', '201', 200],
    ['lotsPageSize', '201', 200],
    ['rowsPageSize', '201', 200],
  ] as const)('rejects %s = %s client-side with the schema ceiling %i, next to the field', async (field, value, max) => {
    const port = createSettingsPort()
    wrapper = await mountSettings(port)

    await typeInto(wrapper, `limit-input-${field}`, value)
    await click(wrapper, 'limits-save')

    expect(port.setExecutionProfiles).not.toHaveBeenCalled()
    expect(byTestId(wrapper, `limit-error-${field}`).text()).toBe(
      copy('settings.advisor.limits.error.max', { max: String(max) }),
    )
    expect(byTestId(wrapper, `limit-input-${field}`).attributes('aria-invalid')).toBe('true')
  })

  it('allows the ceiling itself', async () => {
    const port = createSettingsPort()
    wrapper = await mountSettings(port)

    await typeInto(wrapper, 'limit-input-maxSteps', '30')
    await click(wrapper, 'limits-save')

    expect(port.setExecutionProfiles).toHaveBeenCalledTimes(1)
  })

  it.each(['0', '-3', '2.5', ''])('rejects %j as not a positive whole number', async (value) => {
    const port = createSettingsPort()
    wrapper = await mountSettings(port)

    await typeInto(wrapper, 'limit-input-topNHoldings', value)
    await click(wrapper, 'limits-save')

    expect(port.setExecutionProfiles).not.toHaveBeenCalled()
    expect(byTestId(wrapper, 'limit-error-topNHoldings').text()).toBe(copy('settings.advisor.limits.error.whole_number'))
  })

  it('validates a per-tool budget too', async () => {
    const port = createSettingsPort()
    wrapper = await mountSettings(port)

    await typeInto(wrapper, 'budget-input-risk_metrics', '0')
    await click(wrapper, 'limits-save')

    expect(port.setExecutionProfiles).not.toHaveBeenCalled()
    expect(byTestId(wrapper, 'budget-error-risk_metrics').text()).toBe(copy('settings.advisor.limits.error.whole_number'))
  })

  it('leaves the stored value alone and the typed value visible, never clamping it', async () => {
    const port = createSettingsPort()
    wrapper = await mountSettings(port)

    await typeInto(wrapper, 'limit-input-maxSteps', '99')
    await click(wrapper, 'limits-save')

    expect(inputValue(wrapper, 'limit-input-maxSteps')).toBe('99')
    expect(port.getExecutionProfiles).toHaveBeenCalledTimes(1)
    expect(byTestId(wrapper, 'limits-status').exists()).toBe(false)
  })

  it('jumps to the profile that holds the violation when the other one is showing', async () => {
    const port = createSettingsPort()
    wrapper = await mountSettings(port)
    await click(wrapper, 'profile-tab-local')
    await typeInto(wrapper, 'limit-input-lastMessages', '500')
    await click(wrapper, 'profile-tab-metered')

    await click(wrapper, 'limits-save')

    expect(byTestId(wrapper, 'profile-tab-local').attributes('aria-pressed')).toBe('true')
    expect(byTestId(wrapper, 'limit-error-lastMessages').exists()).toBe(true)
    expect(port.setExecutionProfiles).not.toHaveBeenCalled()
  })

  it('clears an error once the value is corrected', async () => {
    wrapper = await mountSettings(createSettingsPort())

    await typeInto(wrapper, 'limit-input-maxSteps', '99')
    await click(wrapper, 'limits-save')
    await typeInto(wrapper, 'limit-input-maxSteps', '10')

    expect(byTestId(wrapper, 'limit-error-maxSteps').exists()).toBe(false)
  })
})

describe('execution profiles editor: reset to defaults', () => {
  it('restores the code defaults for the selected profile only', async () => {
    wrapper = await mountSettings(createSettingsPort())
    await typeInto(wrapper, 'limit-input-maxSteps', '9')
    await click(wrapper, 'profile-tab-local')
    await typeInto(wrapper, 'limit-input-maxSteps', '22')

    await click(wrapper, 'limits-reset')
    expect(inputValue(wrapper, 'limit-input-maxSteps')).toBe(String(defaults.local.maxSteps))

    await click(wrapper, 'profile-tab-metered')
    expect(inputValue(wrapper, 'limit-input-maxSteps')).toBe('9')
  })

  it('restores the metered per-tool budgets and clears their errors', async () => {
    wrapper = await mountSettings(createSettingsPort())
    await typeInto(wrapper, 'budget-input-kpis', '0')
    await click(wrapper, 'limits-save')
    expect(byTestId(wrapper, 'budget-error-kpis').exists()).toBe(true)

    await click(wrapper, 'limits-reset')

    expect(inputValue(wrapper, 'budget-input-kpis')).toBe(String(defaults.metered.toolBudgets.kpis))
    expect(byTestId(wrapper, 'budget-error-kpis').exists()).toBe(false)
  })

  it('only edits the draft: nothing is sent until the user saves', async () => {
    const port = createSettingsPort()
    wrapper = await mountSettings(port)

    await click(wrapper, 'limits-reset')

    expect(port.setExecutionProfiles).not.toHaveBeenCalled()
  })
})

describe('execution profiles editor: save states', () => {
  it('shows saving, then saved', async () => {
    const port = createSettingsPort()
    let release: () => void = () => undefined
    vi.mocked(port.setExecutionProfiles).mockImplementation(
      (next) => new Promise((resolve) => (release = () => resolve(next))),
    )
    wrapper = await mountSettings(port)

    await click(wrapper, 'limits-save')
    expect(byTestId(wrapper, 'limits-status').attributes('data-state')).toBe('saving')
    expect(byTestId(wrapper, 'limits-save').attributes('disabled')).toBeDefined()

    release()
    await flushPromises()
    expect(byTestId(wrapper, 'limits-status').attributes('data-state')).toBe('saved')
  })

  it('shows the failure inline and keeps the edits', async () => {
    const port = createSettingsPort()
    vi.mocked(port.setExecutionProfiles).mockRejectedValueOnce(new Error('rejected'))
    wrapper = await mountSettings(port)

    await typeInto(wrapper, 'limit-input-maxSteps', '7')
    await click(wrapper, 'limits-save')

    expect(byTestId(wrapper, 'limits-status').attributes('data-state')).toBe('failed')
    expect(byTestId(wrapper, 'limits-status').text()).toBe(copy('settings.advisor.limits.failed'))
    expect(inputValue(wrapper, 'limit-input-maxSteps')).toBe('7')
  })
})
