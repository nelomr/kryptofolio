import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createControlledPort, done, mountPanel, resetPanel, send, toolResult, toolStart } from './advisorTestKit'
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

async function startedRun() {
  const harness = createControlledPort()
  wrapper = await mountPanel(harness.port)
  await send(wrapper, 'hello')
  return { panel: wrapper, run: harness.lastRun }
}

describe('tool activity', () => {
  it('shows a tool as running after tool-start, with its translated name', async () => {
    const { panel, run } = await startedRun()
    run.push(toolStart('call-1', 'portfolio_summary'))
    await flushPromises()

    const row = panel.find('[data-testid="advisor-tool-call-1"]')
    expect(row.attributes('data-state')).toBe('running')
    expect(row.text()).toContain(copy('advisor.tool.portfolio_summary'))
  })

  it('shows the same callId as finished after tool-result, in place', async () => {
    const { panel, run } = await startedRun()
    run.push(toolStart('call-1', 'portfolio_summary'))
    run.push(toolResult('call-1', 'portfolio_summary'))
    await flushPromises()

    expect(panel.findAll('[data-testid^="advisor-tool-"]')).toHaveLength(1)
    expect(panel.find('[data-testid="advisor-tool-call-1"]').attributes('data-state')).toBe('finished')
  })

  it('keeps concurrent calls apart by callId, even for the same tool', async () => {
    const { panel, run } = await startedRun()
    run.push(toolStart('call-1', 'token_history'))
    run.push(toolStart('call-2', 'token_history'))
    run.push(toolResult('call-2', 'token_history'))
    await flushPromises()

    expect(panel.find('[data-testid="advisor-tool-call-1"]').attributes('data-state')).toBe('running')
    expect(panel.find('[data-testid="advisor-tool-call-2"]').attributes('data-state')).toBe('finished')
  })

  it('shows a tool-error as failed, not finished', async () => {
    const { panel, run } = await startedRun()
    run.push(toolStart('call-1', 'kpis'))
    run.push({ kind: 'tool-error', runId: 'run-1', callId: 'call-1', tool: 'kpis', code: 'USE_CASE_FAILED' })
    await flushPromises()

    expect(panel.find('[data-testid="advisor-tool-call-1"]').attributes('data-state')).toBe('failed')
  })

  it('does not keep a tool shimmering after the run was stopped', async () => {
    const { panel, run } = await startedRun()
    run.push(toolStart('call-1', 'portfolio_summary'))
    await flushPromises()
    await panel.find('[data-testid="advisor-stop"]').trigger('click')
    await flushPromises()

    const row = panel.find('[data-testid="advisor-tool-call-1"]')
    expect(row.attributes('data-state')).toBe('interrupted')
    expect(row.find('.animate-pulse').exists()).toBe(false)
  })

  it('does not keep a tool shimmering after the connection dropped', async () => {
    const { panel, run } = await startedRun()
    run.push(toolStart('call-1', 'portfolio_summary'))
    run.end()
    await flushPromises()

    expect(panel.find('[data-testid="advisor-tool-call-1"]').attributes('data-state')).toBe('interrupted')
  })

  it('leaves a finished tool finished after the run ends', async () => {
    const { panel, run } = await startedRun()
    run.push(toolStart('call-1', 'portfolio_summary'))
    run.push(toolResult('call-1', 'portfolio_summary'))
    run.push(done())
    await flushPromises()

    expect(panel.find('[data-testid="advisor-tool-call-1"]').attributes('data-state')).toBe('finished')
  })
})
