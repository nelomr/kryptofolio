import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import AppHeader from '@/components/layout/AppHeader.vue'
import appSource from '@/App.vue?raw'
import advisorPanelSource from '../AdvisorPanel.vue?raw'
import sheetContentSource from '@/components/ui/sheet/SheetContent.vue?raw'
import AdvisorPanel from '../AdvisorPanel.vue'
import { useAdvisorPanel } from '@/composables/useAdvisorPanel'
import {
  createControlledPort,
  done,
  mountPanel,
  nextFrame,
  resetPanel,
  send,
  token,
} from './advisorTestKit'

vi.mock('@/composables/useI18n', async () => {
  const { translateEnglish } = await import('./i18nMock')
  return { useI18n: () => ({ t: translateEnglish }) }
})

const Host = {
  components: { AppHeader, AdvisorPanel },
  template: '<div><AppHeader /><AdvisorPanel /></div>',
}

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  resetPanel()
})

function press(target: Element, init: KeyboardEventInit): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
}

describe('mounting and opening', () => {
  it('is mounted exactly once, in App.vue', () => {
    expect(appSource.match(/<AdvisorPanel\b/g)).toHaveLength(1)
    expect(appSource).toContain("import AdvisorPanel from")
  })

  it('is not embedded in any view', async () => {
    const views = import.meta.glob<string>('@/views/**/*.vue', { query: '?raw', import: 'default', eager: true })
    const embedding = Object.entries(views).filter(([, source]) => source.includes('AdvisorPanel'))
    expect(embedding).toEqual([])
  })

  it('opens from the header button without navigating', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port, { open: false, root: Host })
    expect(useAdvisorPanel().isOpen.value).toBe(false)

    await wrapper.find('[data-testid="advisor-trigger"]').trigger('click')

    expect(useAdvisorPanel().isOpen.value).toBe(true)
    expect(wrapper.vm.$router.currentRoute.value.path).toBe('/')
  })

  it('toggles from the keyboard shortcut', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port, { open: false, root: Host })

    press(document.body, { key: '/', metaKey: true })
    await flushPromises()
    expect(useAdvisorPanel().isOpen.value).toBe(true)

    press(document.body, { key: '/', ctrlKey: true })
    await flushPromises()
    expect(useAdvisorPanel().isOpen.value).toBe(false)
  })
})

describe('keyboard and focus', () => {
  it('Escape closes the panel and returns focus to the header button', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port, { open: false, root: Host })
    const trigger = wrapper.find('[data-testid="advisor-trigger"]')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('click')
    await flushPromises()

    press(wrapper.find('textarea').element, { key: 'Escape' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    await flushPromises()

    expect(useAdvisorPanel().isOpen.value).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
  })

  it('returns focus to the header button even when the button never received focus on click', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port, { open: false, root: Host })
    const trigger = wrapper.find('[data-testid="advisor-trigger"]')
    await trigger.trigger('click')
    await flushPromises()

    press(wrapper.find('textarea').element, { key: 'Escape' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    await flushPromises()

    expect(document.activeElement).toBe(trigger.element)
  })

  it('Enter sends the message', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await wrapper.find('textarea').setValue('what should I review first?')

    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(harness.ask).toHaveBeenCalledTimes(1)
    expect(harness.lastRun.request.message).toBe('what should I review first?')
  })

  it('Shift+Enter inserts a newline instead of sending', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await wrapper.find('textarea').setValue('line one')

    await wrapper.find('textarea').trigger('keydown', { key: 'Enter', shiftKey: true })
    await flushPromises()

    expect(harness.ask).not.toHaveBeenCalled()
  })

  it('Enter during IME composition does not send', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await wrapper.find('textarea').setValue('nihon')

    await wrapper.find('textarea').trigger('keydown', { key: 'Enter', isComposing: true })
    await flushPromises()

    expect(harness.ask).not.toHaveBeenCalled()
  })

  it('does not send an empty message', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await wrapper.find('textarea').setValue('   ')

    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })

    expect(harness.ask).not.toHaveBeenCalled()
  })
})

describe('autoscroll', () => {
  function viewportOf(): HTMLElement {
    const viewport = document.querySelector<HTMLElement>('[data-reka-scroll-area-viewport]')
    if (viewport === null) throw new Error('scroll viewport not found')
    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, get: () => 1000 })
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, get: () => 400 })
    return viewport
  }

  async function streamingPanel() {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    const viewport = viewportOf()
    await send(wrapper, 'hello')
    return { harness, viewport }
  }

  it('follows the stream while the reader is at the bottom', async () => {
    const { harness, viewport } = await streamingPanel()
    harness.lastRun.push(token('first'))
    await nextFrame()

    expect(viewport.scrollTop).toBe(1000)
  })

  it('stops following once the reader scrolls up', async () => {
    const { harness, viewport } = await streamingPanel()
    harness.lastRun.push(token('first'))
    await nextFrame()

    viewport.scrollTop = 100
    viewport.dispatchEvent(new Event('scroll'))
    harness.lastRun.push(token(' second'))
    await nextFrame()

    expect(viewport.scrollTop).toBe(100)
  })

  it('resumes following when the reader returns to the bottom', async () => {
    const { harness, viewport } = await streamingPanel()
    viewport.scrollTop = 100
    viewport.dispatchEvent(new Event('scroll'))
    harness.lastRun.push(token('first'))
    await nextFrame()
    expect(viewport.scrollTop).toBe(100)

    viewport.scrollTop = 600
    viewport.dispatchEvent(new Event('scroll'))
    harness.lastRun.push(token(' second'))
    await nextFrame()

    expect(viewport.scrollTop).toBe(1000)
  })

  it('does not pull the reader down when a run ends while they are scrolled up', async () => {
    const { harness, viewport } = await streamingPanel()
    viewport.scrollTop = 100
    viewport.dispatchEvent(new Event('scroll'))
    harness.lastRun.push(done())
    await nextFrame()

    expect(viewport.scrollTop).toBe(100)
  })
})

describe('reduced motion', () => {
  it('disables the slide animation and transition for users who ask for less motion', () => {
    expect(advisorPanelSource).toContain('motion-reduce:data-[state=open]:animate-none')
    expect(advisorPanelSource).toContain('motion-reduce:data-[state=closed]:animate-none')
    expect(advisorPanelSource).toContain('motion-reduce:transition-none')
    expect(sheetContentSource).not.toContain('motion-reduce:animate-pulse')
  })

  it('only blinks the caret when motion is allowed', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'hello')

    const caret = wrapper.find('[data-testid="advisor-caret"]')
    expect(caret.classes()).toContain('motion-safe:animate-pulse')
    expect(caret.classes()).not.toContain('animate-pulse')
  })
})

describe('accessibility', () => {
  it('announces the message list politely', async () => {
    wrapper = await mountPanel(createControlledPort().port)
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(true)
  })
})
