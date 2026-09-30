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

const BADGE = '[data-testid="advisor-incomplete"]'

async function answered(figuresIncomplete: boolean): Promise<VueWrapper> {
  const harness = createControlledPort()
  const mounted = await mountPanel(harness.port)
  await send(mounted, 'What is my total?')
  harness.lastRun.push(token('Your total is `100.00`.'))
  harness.lastRun.push(done({ figuresIncomplete }))
  await flushPromises()
  return mounted
}

describe('incomplete-figures badge', () => {
  it('shows a warning badge with its i18n label when a tool result reported incomplete figures', async () => {
    wrapper = await answered(true)

    const badge = wrapper.find(BADGE)
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe(copy('advisor.figures_incomplete.label'))
    expect(badge.classes()).toEqual(expect.arrayContaining(['bg-warning-soft', 'text-warning']))
    expect(badge.attributes('title')).toBe(copy('advisor.figures_incomplete.hint'))
  })

  it('sits inline with the answer, outside any Alert', async () => {
    wrapper = await answered(true)

    const badge = wrapper.find(BADGE).element
    expect(badge.closest('[role="alert"]')).toBeNull()
    const answer = wrapper.find('[data-testid="advisor-answer"]').element
    expect(answer.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('is absent when every figure was complete', async () => {
    wrapper = await answered(false)

    expect(wrapper.find(BADGE).exists()).toBe(false)
  })

  it('is absent while the run is streaming', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'hello')
    harness.lastRun.push(token('partial'))
    await nextFrame()

    expect(wrapper.find(BADGE).exists()).toBe(false)
  })

  it.each([
    ['refused', () => refused('reason')],
    ['failed', () => failed('INTERNAL_ERROR')],
  ] as const)('is absent for a %s run', async (_kind, frame) => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'hello')
    harness.lastRun.push(frame())
    await flushPromises()

    expect(wrapper.find(BADGE).exists()).toBe(false)
  })

  it('never colours with profit or loss', async () => {
    wrapper = await answered(true)

    const classes = wrapper.find(BADGE).classes().join(' ')
    expect(classes).not.toMatch(/profit|loss/)
  })
})
