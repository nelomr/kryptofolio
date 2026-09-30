import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import appSource from '@/App.vue?raw'
import AppToaster from '@/components/layout/AppToaster.vue'
import { useAdvisorPanel } from '@/composables/useAdvisorPanel'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  useAdvisorPanel().close()
  document.body.innerHTML = ''
})

function offsetTop(): string {
  const region = document.querySelector<HTMLElement>('[data-sonner-toaster]')
  if (region === null) throw new Error('the toast region is not rendered')
  return region.style.getPropertyValue('--offset-top')
}

const HEADER_STRIP_PX = 56

function pixels(value: string): number {
  const rem = /^([\d.]+)rem$/.exec(value)
  if (rem !== null) return Number(rem[1]) * 16
  const px = /^([\d.]+)px$/.exec(value)
  if (px !== null) return Number(px[1])
  throw new Error(`unexpected offset "${value}"`)
}

describe('AppToaster', () => {
  it('keeps the toast region at the default top offset while the advisor panel is closed', async () => {
    wrapper = mount(AppToaster, { attachTo: document.body })
    await flushPromises()

    expect(pixels(offsetTop())).toBeLessThan(HEADER_STRIP_PX)
  })

  it('moves the toast region below the panel header strip while the panel is open, so its controls stay reachable', async () => {
    const panel = useAdvisorPanel()
    wrapper = mount(AppToaster, { attachTo: document.body })
    await flushPromises()

    panel.open()
    await nextTick()
    await flushPromises()

    expect(pixels(offsetTop())).toBeGreaterThanOrEqual(HEADER_STRIP_PX)
  })

  it('returns to the default offset once the panel closes', async () => {
    const panel = useAdvisorPanel()
    wrapper = mount(AppToaster, { attachTo: document.body })
    panel.open()
    await nextTick()
    const whileOpen = pixels(offsetTop())

    panel.close()
    await nextTick()
    await flushPromises()

    expect(pixels(offsetTop())).toBeLessThan(whileOpen)
  })

  it('is what App.vue mounts, instead of a bare Toaster', () => {
    expect(appSource).toContain('<AppToaster')
    expect(appSource).not.toContain('<Toaster')
  })
})
