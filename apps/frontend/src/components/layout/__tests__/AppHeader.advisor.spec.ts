import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AppHeader from '../AppHeader.vue'
import { en } from '@/i18n/dictionaries/en'
import { useAdvisorPanel } from '@/composables/useAdvisorPanel'

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => en[key] ?? key }),
}))

afterEach(() => useAdvisorPanel().close())

describe('AppHeader advisor trigger', () => {
  function mountHeader() {
    return mount(AppHeader, {
      global: {
        stubs: {
          RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
        },
      },
    })
  }

  it('renders a labelled button in the utility zone', () => {
    const trigger = mountHeader().find('[data-testid="advisor-trigger"]')
    expect(trigger.element.tagName).toBe('BUTTON')
    expect(trigger.attributes('aria-label')).toBe(en['advisor.open'])
  })

  it('opens the panel when clicked', async () => {
    await mountHeader().find('[data-testid="advisor-trigger"]').trigger('click')
    expect(useAdvisorPanel().isOpen.value).toBe(true)
  })

  it('reflects the open state for assistive technology', async () => {
    const wrapper = mountHeader()
    const trigger = wrapper.find('[data-testid="advisor-trigger"]')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
  })
})
