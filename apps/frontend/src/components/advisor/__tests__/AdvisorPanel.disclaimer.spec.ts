import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import {
  createControlledPort,
  done,
  failed,
  mountPanel,
  nextFrame,
  refused,
  resetPanel,
  send,
  token,
} from './advisorTestKit'
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

const DISCLAIMER = '[data-testid="advisor-disclaimer"]'
const ANSWER = '[data-testid="advisor-answer"]'

async function answered(disclaimer: boolean): Promise<VueWrapper> {
  const harness = createControlledPort()
  const mounted = await mountPanel(harness.port)
  await send(mounted, 'How should I rebalance?')
  harness.lastRun.push(token('A balanced allocation could look like this.'))
  harness.lastRun.push(done({ disclaimer }))
  await flushPromises()
  return mounted
}

describe('disclaimer footer', () => {
  it('renders the i18n disclaimer as a muted text-xs footer when the answer carries one', async () => {
    wrapper = await answered(true)

    const footer = wrapper.find(DISCLAIMER)
    expect(footer.exists()).toBe(true)
    expect(footer.text()).toBe(copy('advisor.disclaimer'))
    expect(footer.classes()).toEqual(expect.arrayContaining(['text-xs', 'text-muted']))
  })

  it('is distinct from the answer body and from any Alert', async () => {
    wrapper = await answered(true)

    const footer = wrapper.find(DISCLAIMER)
    expect(footer.element.closest(ANSWER)).toBeNull()
    expect(footer.element.closest('[role="alert"]')).toBeNull()
    expect(wrapper.find(ANSWER).text()).not.toContain(copy('advisor.disclaimer'))
  })

  it('comes after the answer body in reading order', async () => {
    wrapper = await answered(true)

    const answer = wrapper.find(ANSWER).element
    const footer = wrapper.find(DISCLAIMER).element
    expect(answer.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders no footer for an answer with no investment content', async () => {
    wrapper = await answered(false)

    expect(wrapper.find(DISCLAIMER).exists()).toBe(false)
  })

  it('renders no footer while the run is still streaming', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'hello')
    harness.lastRun.push(token('A balanced allocation'))
    await nextFrame()

    expect(wrapper.find(DISCLAIMER).exists()).toBe(false)
  })

  it.each([
    ['refused', () => refused('reason')],
    ['failed', () => failed('INTERNAL_ERROR')],
  ] as const)('renders no footer for a %s run, which has no answer to disclaim', async (_kind, frame) => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'hello')
    harness.lastRun.push(frame())
    await flushPromises()

    expect(wrapper.find(DISCLAIMER).exists()).toBe(false)
  })

  it('keeps each finished turn its own disclaimer', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'first')
    harness.lastRun.push(done({ disclaimer: true }))
    await flushPromises()
    await send(wrapper, 'second')
    harness.lastRun.push(done({ disclaimer: false }))
    await flushPromises()

    expect(wrapper.findAll(DISCLAIMER)).toHaveLength(1)
  })
})
