import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createControlledPort, mountPanel, resetPanel } from './advisorTestKit'
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

describe('empty state suggestions', () => {
  it('renders two groups, Taxes and Your portfolio', async () => {
    wrapper = await mountPanel(createControlledPort().port)
    const groups = wrapper.findAll('[data-testid^="advisor-suggestions-"]')

    expect(groups.map((group) => group.find('h4').text())).toEqual([
      copy('advisor.empty.group.taxes'),
      copy('advisor.empty.group.portfolio'),
    ])
    expect(copy('advisor.empty.group.taxes')).toBe('Taxes')
    expect(copy('advisor.empty.group.portfolio')).toBe('Your portfolio')
  })

  it('puts at least one question in each group', async () => {
    wrapper = await mountPanel(createControlledPort().port)
    for (const group of wrapper.findAll('[data-testid^="advisor-suggestions-"]')) {
      expect(group.findAll('[data-testid="advisor-suggestion"]').length).toBeGreaterThan(0)
    }
  })

  it('sends the clicked question as the first message', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    const first = wrapper.find('[data-testid="advisor-suggestions-taxes"] [data-testid="advisor-suggestion"]')
    const question = first.text()

    await first.trigger('click')
    await flushPromises()

    expect(harness.lastRun.request.message).toBe(question)
    expect(wrapper.find('[data-testid="advisor-empty"]').exists()).toBe(false)
  })
})
