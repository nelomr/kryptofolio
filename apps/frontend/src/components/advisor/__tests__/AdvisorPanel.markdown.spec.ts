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

async function answered(text: string) {
  const harness = createControlledPort()
  wrapper = await mountPanel(harness.port)
  await send(wrapper, 'hello')
  harness.lastRun.push(token(text))
  harness.lastRun.push(done())
  await flushPromises()
  return wrapper
}

describe('panel answer rendering', () => {
  it('renders the answer as markdown with figures in mono', async () => {
    const panel = await answered('Holding `0.5` BTC.')
    expect(panel.find('[data-testid="advisor-answer"] code').classes()).toContain('font-mono')
  })

  it('never lets model output add live markup to the panel', async () => {
    const panel = await answered('<script>1</script><img src=x onerror=alert(1)> [x](javascript:alert(1))')
    const answer = panel.find('[data-testid="advisor-answer"]').element
    expect(answer.querySelectorAll('script, img, a')).toHaveLength(0)
  })

  it('navigates in-app when an answer link is clicked', async () => {
    const panel = await answered('See the [tax report](/tax).')
    await panel.find('[data-testid="advisor-answer"] a').trigger('click')
    await flushPromises()
    expect(panel.vm.$router.currentRoute.value.path).toBe('/tax')
  })
})
