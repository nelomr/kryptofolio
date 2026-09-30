import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createControlledPort, done, failed, mountPanel, nextFrame, refused, resetPanel, send, token } from './advisorTestKit'

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

const STEPS = '[data-testid="advisor-steps"]'

describe('steps-used footer', () => {
  it('shows stepsUsed / maxSteps as a muted mono text-xs footer once the receipt exists', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'hello')
    harness.lastRun.push(token('answer'))
    harness.lastRun.push(done({ stepsUsed: 3, maxSteps: 10 }))
    await flushPromises()

    const footer = wrapper.find(STEPS)
    expect(footer.text()).toBe('3 / 10')
    expect(footer.classes()).toEqual(expect.arrayContaining(['text-xs', 'font-mono', 'text-muted']))
  })

  it('does not render while the run is streaming', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'hello')
    harness.lastRun.push(token('answer so far'))
    await nextFrame()

    expect(wrapper.find(STEPS).exists()).toBe(false)
  })

  it('does not render before any run', async () => {
    wrapper = await mountPanel(createControlledPort().port)
    expect(wrapper.find(STEPS).exists()).toBe(false)
  })

  it.each([
    ['refused', () => refused('reason')],
    ['failed', () => failed('INTERNAL_ERROR')],
  ] as const)('does not render for a %s run, which carries no receipt', async (_kind, frame) => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'hello')
    harness.lastRun.push(frame())
    await flushPromises()

    expect(wrapper.find(STEPS).exists()).toBe(false)
  })

  it('keeps each finished turn\'s own number and leaves the streaming turn without one', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'first')
    harness.lastRun.push(done({ stepsUsed: 2, maxSteps: 10 }))
    await flushPromises()
    await send(wrapper, 'second')
    harness.lastRun.push(token('working'))
    await nextFrame()

    expect(wrapper.findAll(STEPS).map((footer) => footer.text())).toEqual(['2 / 10'])
  })
})
