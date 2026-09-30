import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import type { AdvisorTransportCause } from '@/core/domain/models/AdvisorEntities'
import { AdvisorStreamError } from '@/core/domain/models/AdvisorEntities'
import { isRetryableOutcome } from '@/composables/useAdvisorChat'
import { useAdvisorPanel } from '@/composables/useAdvisorPanel'
import {
  createControlledPort,
  done,
  failed,
  mountPanel,
  providersFailed,
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

describe('empty conversation', () => {
  it('renders the first-question prompt', async () => {
    wrapper = await mountPanel(createControlledPort().port)
    expect(wrapper.find('[data-testid="advisor-empty"]').text()).toContain(copy('advisor.empty.title'))
  })

  it('shows no error', async () => {
    wrapper = await mountPanel(createControlledPort().port)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows no spinner or caret', async () => {
    wrapper = await mountPanel(createControlledPort().port)
    expect(wrapper.find('[data-testid="advisor-caret"]').exists()).toBe(false)
  })
})

describe('streaming in progress', () => {
  it('shows a caret after the streamed text and keeps the partial answer visible', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'hello')
    harness.lastRun.push(token('Your portfolio'))
    await nextFrame()

    expect(wrapper.find('[data-testid="advisor-answer"]').text()).toContain('Your portfolio')
    expect(wrapper.find('[data-testid="advisor-caret"]').exists()).toBe(true)
  })

  it('removes the caret once the run ends', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'hello')
    harness.lastRun.push(token('Done.'))
    harness.lastRun.push(done())
    await flushPromises()

    expect(wrapper.find('[data-testid="advisor-caret"]').exists()).toBe(false)
  })
})

describe('refused', () => {
  async function refusedPanel() {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'will bitcoin hit 1m?')
    harness.lastRun.push(refused('forecast is not grounded in a tool result'))
    await flushPromises()
    return wrapper
  }

  it('presents the withheld answer with its reason', async () => {
    const panel = await refusedPanel()
    const block = panel.find('[data-testid="advisor-refused"]')
    expect(block.text()).toContain(copy('advisor.refused.title'))
    expect(block.text()).toContain('forecast is not grounded in a tool result')
  })

  it('is not presented as a failure', async () => {
    const panel = await refusedPanel()
    expect(panel.find('[data-testid="advisor-failed"]').exists()).toBe(false)
  })

  it('uses the info surface, not the failure surfaces', async () => {
    const panel = await refusedPanel()
    const classes = panel.find('[data-testid="advisor-refused"]').classes()
    expect(classes).toContain('bg-info-soft')
    expect(classes).not.toContain('bg-loss-soft')
    expect(classes).not.toContain('bg-warning-soft')
  })
})

describe('failed', () => {
  async function panelWith(event: ReturnType<typeof failed>) {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'hello')
    harness.lastRun.push(event)
    await flushPromises()
    return wrapper
  }

  const failedPanel = (code: Parameters<typeof failed>[0]) => panelWith(failed(code))

  it('NO_MODEL_AVAILABLE links to the credential settings rather than showing a generic error', async () => {
    const panel = await failedPanel('NO_MODEL_AVAILABLE')
    const block = panel.find('[data-testid="advisor-failed"]')
    expect(block.text()).toContain(copy('advisor.failed.NO_MODEL_AVAILABLE.title'))
    expect(block.find('a[href="/settings"]').text()).toContain(copy('advisor.failed.settings_cta'))
  })

  it('following the settings link closes the panel so the page is reachable', async () => {
    const panel = await failedPanel('NO_MODEL_AVAILABLE')
    await panel.find('a[href="/settings"]').trigger('click')
    expect(useAdvisorPanel().isOpen.value).toBe(false)
  })

  it('VAULT_LOCKED has its own text and also points at the settings', async () => {
    const panel = await failedPanel('VAULT_LOCKED')
    const block = panel.find('[data-testid="advisor-failed"]')
    expect(block.text()).toContain(copy('advisor.failed.VAULT_LOCKED.title'))
    expect(block.find('a[href="/settings"]').exists()).toBe(true)
  })

  it.each(['NO_MODEL_AVAILABLE', 'VAULT_LOCKED'] as const)('%s uses the warning surface', async (code) => {
    const panel = await failedPanel(code)
    expect(panel.find('[data-testid="advisor-failed"]').classes()).toContain('bg-warning-soft')
  })

  it('INTERNAL_ERROR has its own text, the loss surface and a retry', async () => {
    const panel = await failedPanel('INTERNAL_ERROR')
    const block = panel.find('[data-testid="advisor-failed"]')
    expect(block.text()).toContain(copy('advisor.failed.INTERNAL_ERROR.title'))
    expect(block.classes()).toContain('bg-loss-soft')
    expect(panel.find('[data-testid="advisor-retry"]').exists()).toBe(true)
  })
})

describe('failed after every provider was tried', () => {
  const provider = 'Ollama Cloud'
  const model = 'gpt-oss:120b'
  const params = { provider, model }

  async function causePanel(kind: Parameters<typeof providersFailed>[0]) {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'hello')
    harness.lastRun.push(providersFailed(kind))
    await flushPromises()
    return wrapper
  }

  it('a rejected key says so, names the provider and model and points at the credentials', async () => {
    const panel = await causePanel('auth-rejected')
    const block = panel.find('[data-testid="advisor-failed"]')
    expect(block.text()).toContain(copy('advisor.failed.ALL_PROVIDERS_FAILED.auth-rejected.title', params))
    expect(block.text()).toContain(copy('advisor.failed.ALL_PROVIDERS_FAILED.auth-rejected.body', params))
    expect(block.text()).toContain(provider)
    expect(block.text()).toContain(model)
    expect(block.find('a[href="/settings"]').text()).toContain(copy('advisor.failed.settings_cta'))
    expect(panel.find('[data-testid="advisor-retry"]').exists()).toBe(false)
  })

  it('an unknown model points at the advisor settings and offers no retry', async () => {
    const panel = await causePanel('model-not-found')
    const block = panel.find('[data-testid="advisor-failed"]')
    expect(block.text()).toContain(copy('advisor.failed.ALL_PROVIDERS_FAILED.model-not-found.title', params))
    expect(block.text()).toContain(copy('advisor.failed.ALL_PROVIDERS_FAILED.model-not-found.body', params))
    expect(block.find('a[href="/settings"]').text()).toContain(copy('advisor.failed.advisor_settings_cta'))
    expect(panel.find('[data-testid="advisor-retry"]').exists()).toBe(false)
  })

  it.each(['rate-limited', 'provider-unavailable', 'network'] as const)(
    '%s has its own text, no settings link and a retry',
    async (kind) => {
      const panel = await causePanel(kind)
      const block = panel.find('[data-testid="advisor-failed"]')
      expect(block.text()).toContain(copy(`advisor.failed.ALL_PROVIDERS_FAILED.${kind}.title`, params))
      expect(block.text()).toContain(copy(`advisor.failed.ALL_PROVIDERS_FAILED.${kind}.body`, params))
      expect(block.find('a[href="/settings"]').exists()).toBe(false)
      expect(panel.find('[data-testid="advisor-retry"]').exists()).toBe(true)
    },
  )

  it('an unclassified cause keeps the generic text, the loss surface and a retry', async () => {
    const panel = await causePanel('unknown')
    const block = panel.find('[data-testid="advisor-failed"]')
    expect(block.text()).toContain(copy('advisor.failed.ALL_PROVIDERS_FAILED.title'))
    expect(block.text()).toContain(copy('advisor.failed.ALL_PROVIDERS_FAILED.body'))
    expect(block.classes()).toContain('bg-loss-soft')
    expect(panel.find('[data-testid="advisor-retry"]').exists()).toBe(true)
  })
})

describe('transport-lost', () => {
  async function lostPanel(cause: AdvisorTransportCause | 'stream-ended') {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'hello')
    harness.lastRun.push(token('partial answer'))
    if (cause === 'stream-ended') harness.lastRun.end()
    else harness.lastRun.fail(new AdvisorStreamError('lost', cause))
    await flushPromises()
    return { panel: wrapper, harness }
  }

  it('renders inline under the partial answer with a retry', async () => {
    const { panel } = await lostPanel({ kind: 'network' })
    expect(panel.find('[data-testid="advisor-answer"]').text()).toContain('partial answer')
    expect(panel.find('[data-testid="advisor-transport"]').text()).toContain(copy('advisor.transport.network'))
    expect(panel.find('[data-testid="advisor-retry"]').exists()).toBe(true)
  })

  it('retry sends the same message again', async () => {
    const { panel, harness } = await lostPanel({ kind: 'network' })
    await panel.find('[data-testid="advisor-retry"]').trigger('click')
    await flushPromises()
    expect(harness.ask).toHaveBeenCalledTimes(2)
    expect(harness.lastRun.request.message).toBe('hello')
  })

  it('uses the loss surface', async () => {
    const { panel } = await lostPanel({ kind: 'network' })
    expect(panel.find('[data-testid="advisor-transport"]').classes()).toContain('bg-loss-soft')
  })

  const causes: ReadonlyArray<readonly [string, AdvisorTransportCause | 'stream-ended', string]> = [
    ['network', { kind: 'network' }, 'advisor.transport.network'],
    ['http 503 (temporary)', { kind: 'http', status: 503 }, 'advisor.transport.http_temporary'],
    ['http 429 (temporary)', { kind: 'http', status: 429 }, 'advisor.transport.http_temporary'],
    ['http 422 (rejected)', { kind: 'http', status: 422 }, 'advisor.transport.http_rejected'],
    ['http 400 (rejected)', { kind: 'http', status: 400 }, 'advisor.transport.http_rejected'],
    ['no-body', { kind: 'no-body' }, 'advisor.transport.no_body'],
    ['invalid-frame', { kind: 'invalid-frame' }, 'advisor.transport.invalid_frame'],
    ['stream-ended', 'stream-ended', 'advisor.transport.stream_ended'],
  ]

  it.each(causes)('%s renders its own text and no other cause\'s', async (_label, cause, key) => {
    const { panel } = await lostPanel(cause)
    const text = panel.find('[data-testid="advisor-transport"]').text()
    expect(text).toContain(copy(key))
    const others = [...new Set(causes.map(([, , other]) => other))].filter((other) => other !== key)
    for (const other of others) expect(text).not.toContain(copy(other))
  })

  it.each(causes)('%s shows Retry exactly when the composable says it is retryable', async (_label, cause) => {
    const { panel } = await lostPanel(cause)
    const outcome: Parameters<typeof isRetryableOutcome>[0] = {
      kind: 'transport-lost',
      cause: cause === 'stream-ended' ? { kind: 'stream-ended' } : cause,
    }
    expect(panel.find('[data-testid="advisor-retry"]').exists()).toBe(isRetryableOutcome(outcome))
  })

  it('does not offer Retry for a malformed frame, which would fail identically', async () => {
    const { panel } = await lostPanel({ kind: 'invalid-frame' })
    expect(panel.find('[data-testid="advisor-retry"]').exists()).toBe(false)
  })
})

describe('user-aborted', () => {
  async function abortedPanel() {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'hello')
    harness.lastRun.push(token('half an answ'))
    await flushPromises()
    await wrapper.find('[data-testid="advisor-stop"]').trigger('click')
    await flushPromises()
    return wrapper
  }

  it('keeps the partial answer visible', async () => {
    const panel = await abortedPanel()
    expect(panel.find('[data-testid="advisor-answer"]').text()).toContain('half an answ')
  })

  it('marks the answer as stopped by the user', async () => {
    const panel = await abortedPanel()
    const label = panel.find('[data-testid="advisor-stopped"]')
    expect(label.text()).toContain(copy('advisor.stopped'))
    expect(label.classes()).toContain('text-muted')
  })

  it('has no error state', async () => {
    const panel = await abortedPanel()
    expect(panel.find('[role="alert"]').exists()).toBe(false)
    expect(panel.find('[data-testid="advisor-failed"]').exists()).toBe(false)
    expect(panel.find('[data-testid="advisor-transport"]').exists()).toBe(false)
  })

  it('offers Retry because nothing about the request was wrong', async () => {
    const panel = await abortedPanel()
    expect(panel.find('[data-testid="advisor-retry"]').exists()).toBe(true)
  })
})

describe('composer while a run is in flight', () => {
  it('disables the input and offers Stop instead of Send', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'hello')

    expect(wrapper.find('textarea').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="advisor-stop"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="advisor-send"]').exists()).toBe(false)
  })

  it('Stop aborts the run', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'hello')
    await wrapper.find('[data-testid="advisor-stop"]').trigger('click')

    expect(harness.lastRun.signal.aborted).toBe(true)
  })

  it('re-enables the input after the run ends', async () => {
    const harness = createControlledPort()
    wrapper = await mountPanel(harness.port)
    await send(wrapper, 'hello')
    harness.lastRun.push(done())
    await flushPromises()

    expect(wrapper.find('textarea').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="advisor-send"]').exists()).toBe(true)
  })
})
