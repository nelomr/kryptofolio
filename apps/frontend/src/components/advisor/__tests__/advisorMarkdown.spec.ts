import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { renderAdvisorMarkdown } from '../advisorMarkdown'
import AdvisorMarkdown from '../AdvisorMarkdown.vue'

function render(source: string) {
  return mount(AdvisorMarkdown, { props: { source } })
}

describe('advisor markdown renderer', () => {
  it('escapes raw HTML instead of injecting it', () => {
    const html = renderAdvisorMarkdown('before <b>bold</b> after')
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;')
    expect(html).not.toContain('<b>')
  })

  it('renders inline code as mono tabular figures with no background', () => {
    const wrapper = render('You hold `1234.56` EUR.')
    const code = wrapper.find('code')
    expect(code.classes()).toEqual(expect.arrayContaining(['font-mono', 'tabular-nums']))
    expect(code.classes().some((cls) => cls.startsWith('bg-'))).toBe(false)
  })

  it('renders basic markdown structure', () => {
    const wrapper = render('**Summary**\n\n- one\n- two')
    expect(wrapper.find('strong').text()).toBe('Summary')
    expect(wrapper.findAll('li')).toHaveLength(2)
  })
})

describe('advisor markdown safety', () => {
  const attackers: ReadonlyArray<readonly [string, string]> = [
    ['script tag', '<script>window.__pwned = 1</script>'],
    ['img onerror', '<img src="x" onerror="window.__pwned = 1">'],
    ['svg onload', '<svg onload="window.__pwned = 1"></svg>'],
    ['iframe', '<iframe src="https://evil.example"></iframe>'],
    ['html anchor with javascript url', '<a href="javascript:alert(1)">x</a>'],
  ]

  it.each(attackers)('%s never reaches the DOM as a live element', (_label, payload) => {
    const wrapper = render(`answer ${payload} end`)
    const root: Element = wrapper.element
    const live = root.querySelectorAll('script, img, svg, iframe, a')
    expect(live).toHaveLength(0)
    expect(wrapper.text()).toContain('answer')
  })

  it('never produces an event-handler attribute on any element', () => {
    const wrapper = render('<img src=x onerror=alert(1)>\n\n[x](https://a.example "t\\" onmouseover=\\"1")')
    const root: Element = wrapper.element
    const withHandler = Array.from(root.querySelectorAll('*')).filter((el) =>
      el.getAttributeNames().some((name) => name.startsWith('on')),
    )
    expect(withHandler).toHaveLength(0)
  })

  const blockedLinks: ReadonlyArray<readonly [string, string]> = [
    ['javascript:', '[click](javascript:alert(1))'],
    ['mixed-case javascript:', '[click](JaVaScRiPt:alert(1))'],
    ['entity-encoded javascript:', '[click](&#106;avascript:alert(1))'],
    ['data:', '[click](data:text/html;base64,PHNjcmlwdD4=)'],
    ['vbscript:', '[click](vbscript:msgbox(1))'],
    ['external https', '[click](https://evil.example/phish)'],
    ['protocol-relative', '[click](//evil.example/phish)'],
  ]

  it.each(blockedLinks)('%s link is neutralized to plain text', (_label, markdown) => {
    const wrapper = render(markdown)
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.text()).toContain('click')
  })

  it('does not load remote images', () => {
    const wrapper = render('![tracker](https://evil.example/pixel.png)')
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('does not auto-link bare URLs', () => {
    expect(render('see https://evil.example now').find('a').exists()).toBe(false)
  })

  it('never leaves a backslash in a kept href, which some browsers read as a host separator', () => {
    const link = render('[click](/\\evil.example)').find('a')
    expect(link.attributes('href') ?? '').not.toContain('\\')
  })

  it('keeps an in-app route as a real link', () => {
    const link = render('[tax report](/tax)').find('a')
    expect(link.attributes('href')).toBe('/tax')
    expect(link.text()).toBe('tax report')
  })

  it('reports an in-app link click as navigation instead of reloading the page', async () => {
    const wrapper = render('[tax report](/tax)')
    await wrapper.find('a').trigger('click')
    expect(wrapper.emitted('navigate')).toEqual([['/tax']])
  })
})

describe('advisor markdown throttling', () => {
  it('renders streaming updates at most once per animation frame', async () => {
    const frames: FrameRequestCallback[] = []
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    const wrapper = mount(AdvisorMarkdown, { props: { source: '', streaming: true } })

    for (const source of ['a', 'ab', 'abc', 'abcd']) await wrapper.setProps({ source })

    expect(raf).toHaveBeenCalledTimes(1)
    frames[0](0)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toBe('abcd')
    raf.mockRestore()
  })

  it('renders immediately once streaming stops', async () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
    const wrapper = mount(AdvisorMarkdown, { props: { source: 'partial', streaming: true } })
    await wrapper.setProps({ source: 'partial and final', streaming: false })

    expect(wrapper.text()).toBe('partial and final')
    raf.mockRestore()
  })
})
