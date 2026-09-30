import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createControlledPort, failed, mountPanel, refused, resetPanel, send } from './advisorTestKit'
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

const QUESTION = 'will bitcoin hit 1m?'

async function refusedPanel() {
  const harness = createControlledPort()
  wrapper = await mountPanel(harness.port)
  await send(wrapper, QUESTION)
  harness.lastRun.push(refused('forecast is not grounded'))
  await flushPromises()
  return { panel: wrapper, harness }
}

describe('refusal reformulation chip', () => {
  it('is offered once, inside the refusal presentation', async () => {
    const { panel } = await refusedPanel()
    const chips = panel.findAll('[data-testid="advisor-rephrase"]')

    expect(chips).toHaveLength(1)
    expect(panel.find('[data-testid="advisor-refused"]').find('[data-testid="advisor-rephrase"]').exists()).toBe(true)
  })

  it('sends a rephrased question that still carries the original one', async () => {
    const { panel, harness } = await refusedPanel()

    await panel.find('[data-testid="advisor-rephrase"]').trigger('click')
    await flushPromises()

    expect(harness.ask).toHaveBeenCalledTimes(2)
    expect(harness.lastRun.request.message).toBe(copy('advisor.refused.rephrase.message', { question: QUESTION }))
    expect(harness.lastRun.request.message).not.toBe(QUESTION)
  })

  it('continues the same thread as the refused run', async () => {
    const { panel, harness } = await refusedPanel()

    await panel.find('[data-testid="advisor-rephrase"]').trigger('click')
    await flushPromises()

    expect(harness.lastRun.request.threadId).toBe('thread-1')
  })

  it('is not the withheld answer: the refused turn has no answer body and keeps its reason', async () => {
    const { panel } = await refusedPanel()

    expect(panel.find('[data-testid="advisor-answer"]').exists()).toBe(false)
    expect(panel.find('[data-testid="advisor-answer"] [data-testid="advisor-rephrase"]').exists()).toBe(false)

    await panel.find('[data-testid="advisor-rephrase"]').trigger('click')
    await flushPromises()

    const turns = panel.findAll('[data-testid="advisor-turn"]')
    expect(turns).toHaveLength(2)
    expect(turns[0].find('[data-testid="advisor-refused"]').text()).toContain('forecast is not grounded')
  })

  it('is offered only on the latest turn', async () => {
    const { panel, harness } = await refusedPanel()
    await panel.find('[data-testid="advisor-rephrase"]').trigger('click')
    await flushPromises()
    harness.lastRun.push(refused('still not grounded'))
    await flushPromises()

    expect(panel.findAll('[data-testid="advisor-refused"]')).toHaveLength(2)
    expect(panel.findAll('[data-testid="advisor-rephrase"]')).toHaveLength(1)
  })

  it('is not offered for a failed run', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, QUESTION)
    harness.lastRun.push(failed('INTERNAL_ERROR'))
    await flushPromises()

    expect(wrapper.find('[data-testid="advisor-rephrase"]').exists()).toBe(false)
  })
})
