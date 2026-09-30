import { vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import type { App, Component } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type {
  AdvisorCauselessFailureCode,
  AdvisorProviderFailureKind,
  AdvisorStreamEvent,
  AdvisorToolName,
  AiProviderId,
  RunExecutionProfile,
} from '@kryptofolio/shared-types'
import { ADVISOR_PORT_KEY } from '@/core/injectionKeys'
import type { IAdvisorPort } from '@/core/domain/ports/IAdvisorPort'
import type { AdvisorAskRequest, AdvisorConfig } from '@/core/domain/models/AdvisorEntities'
import { useAdvisorPanel } from '@/composables/useAdvisorPanel'
import AdvisorPanel from '../AdvisorPanel.vue'

type Item =
  | { readonly kind: 'event'; readonly event: AdvisorStreamEvent }
  | { readonly kind: 'end' }
  | { readonly kind: 'error'; readonly error: Error }

/** One scripted run: the test decides when each frame arrives and how the stream ends. */
export interface RunChannel {
  readonly request: AdvisorAskRequest
  readonly signal: AbortSignal
  push(event: AdvisorStreamEvent): void
  end(): void
  fail(error: Error): void
}

export function createControlledPort(config: AdvisorConfig = { chain: [], providers: [] }) {
  const runs: RunChannel[] = []

  const ask = vi.fn<IAdvisorPort['ask']>((request, signal) => {
    const items: Item[] = []
    let wake: (() => void) | undefined
    const enqueue = (item: Item) => {
      items.push(item)
      wake?.()
    }
    runs.push({
      request,
      signal,
      push: (event) => enqueue({ kind: 'event', event }),
      end: () => enqueue({ kind: 'end' }),
      fail: (error) => enqueue({ kind: 'error', error }),
    })

    async function* iterate(): AsyncGenerator<AdvisorStreamEvent> {
      for (;;) {
        const item = items.shift()
        if (item === undefined) {
          await new Promise<void>((resolve) => {
            wake = resolve
            signal.addEventListener('abort', () => resolve(), { once: true })
          })
          if (signal.aborted) return
          continue
        }
        if (item.kind === 'event') yield item.event
        else if (item.kind === 'end') return
        else throw item.error
      }
    }
    return iterate()
  })

  const port: IAdvisorPort = {
    ask,
    getConfig: vi.fn<IAdvisorPort['getConfig']>().mockResolvedValue(config),
    getExecutionProfiles: vi.fn<IAdvisorPort['getExecutionProfiles']>(),
    setModelChain: vi.fn<IAdvisorPort['setModelChain']>(),
    setExecutionProfiles: vi.fn<IAdvisorPort['setExecutionProfiles']>(),
  }

  return {
    port,
    ask,
    get lastRun(): RunChannel {
      const run = runs.at(-1)
      if (run === undefined) throw new Error('no run has been started')
      return run
    },
  }
}

export const token = (text: string): AdvisorStreamEvent => ({ kind: 'token', runId: 'run-1', text })

export const toolStart = (callId: string, tool: AdvisorToolName): AdvisorStreamEvent => ({
  kind: 'tool-start',
  runId: 'run-1',
  callId,
  tool,
})

export const toolResult = (callId: string, tool: AdvisorToolName): AdvisorStreamEvent => ({
  kind: 'tool-result',
  runId: 'run-1',
  callId,
  tool,
})

export const refused = (reason: string): AdvisorStreamEvent => ({
  kind: 'refused',
  runId: 'run-1',
  threadId: 'thread-1',
  reason,
  processorId: 'grounding-detector',
})

export const failed = (code: AdvisorCauselessFailureCode): AdvisorStreamEvent => ({
  kind: 'failed',
  runId: 'run-1',
  code,
})

export const providersFailed = (
  kind: AdvisorProviderFailureKind,
  providerId: AiProviderId = 'ollama-cloud',
  modelId = 'gpt-oss:120b',
): AdvisorStreamEvent => ({
  kind: 'failed',
  runId: 'run-1',
  code: 'ALL_PROVIDERS_FAILED',
  cause: { kind, providerId, modelId },
})

export function done(
  overrides: Partial<{
    providerId: AiProviderId
    modelId: string
    executionProfile: RunExecutionProfile
    stepsUsed: number
    maxSteps: number
    disclaimer: boolean
    figuresIncomplete: boolean
  }> = {},
): AdvisorStreamEvent {
  return {
    kind: 'done',
    runId: 'run-1',
    threadId: 'thread-1',
    providerId: overrides.providerId ?? 'ollama',
    modelId: overrides.modelId ?? 'llama3',
    usage: { inputTokens: 10, outputTokens: 20 },
    toolsCalled: [],
    executionProfile: overrides.executionProfile ?? 'local',
    stepsUsed: overrides.stepsUsed ?? 3,
    maxSteps: overrides.maxSteps ?? 10,
    disclaimer: overrides.disclaimer ?? false,
    figuresIncomplete: overrides.figuresIncomplete ?? false,
  }
}

const Blank = { template: '<div />' }

export function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: ['/', '/tax', '/settings'].map((path) => ({ path, component: Blank })),
  })
}

export async function mountPanel(
  port: IAdvisorPort,
  options: { open?: boolean; root?: Component } = {},
): Promise<VueWrapper> {
  const panel = useAdvisorPanel()
  if (options.open ?? true) panel.open()
  const wrapper = mount(options.root ?? AdvisorPanel, {
    attachTo: document.body,
    global: {
      plugins: [
        createPinia(),
        PiniaColada,
        createTestRouter(),
        (app: App) => app.provide(ADVISOR_PORT_KEY, port),
      ],
      stubs: { Teleport: { template: '<div><slot /></div>' } },
    },
  })
  await flushPromises()
  return wrapper
}

export async function send(wrapper: VueWrapper, message: string): Promise<void> {
  await wrapper.find('textarea').setValue(message)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

export function resetPanel(): void {
  useAdvisorPanel().close()
  document.body.innerHTML = ''
}

/** Streaming text is painted once per animation frame, so a test that reads it mid-stream waits one. */
export async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await flushPromises()
}
