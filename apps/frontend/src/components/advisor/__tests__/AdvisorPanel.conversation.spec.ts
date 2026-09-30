import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createControlledPort, done, mountPanel, resetPanel, send, token } from './advisorTestKit'

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

describe('new conversation', () => {
  it('clears the thread and shows the empty state', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'first question')
    harness.lastRun.push(token('first answer'))
    harness.lastRun.push(done())
    await flushPromises()
    expect(wrapper.findAll('[data-testid="advisor-turn"]')).toHaveLength(1)

    await wrapper.find('[data-testid="advisor-new-conversation"]').trigger('click')

    expect(wrapper.findAll('[data-testid="advisor-turn"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="advisor-empty"]').exists()).toBe(true)
  })

  it('starts the next message on a fresh server thread', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'first question')
    harness.lastRun.push(done())
    await flushPromises()
    await send(wrapper, 'follow-up')
    expect(harness.lastRun.request.threadId).toBe('thread-1')
    harness.lastRun.push(done())
    await flushPromises()

    await wrapper.find('[data-testid="advisor-new-conversation"]').trigger('click')
    await send(wrapper, 'unrelated')

    expect(harness.lastRun.request.threadId).toBeUndefined()
  })

  it('stops an in-flight run instead of leaving it streaming into an empty thread', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'first question')

    await wrapper.find('[data-testid="advisor-new-conversation"]').trigger('click')

    expect(harness.lastRun.signal.aborted).toBe(true)
    expect(wrapper.find('[data-testid="advisor-empty"]').exists()).toBe(true)
  })
})
