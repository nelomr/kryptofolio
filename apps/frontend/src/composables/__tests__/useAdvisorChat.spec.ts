import { describe, it, expect, vi, afterEach } from 'vitest'
import type { AdvisorProviderFailureKind, AdvisorStreamEvent } from '@kryptofolio/shared-types'
import { defaultExecutionProfiles } from '@kryptofolio/shared-types'
import type { IAdvisorPort } from '@/core/domain/ports/IAdvisorPort'
import type { AdvisorAskRequest } from '@/core/domain/models/AdvisorEntities'
import { AdvisorStreamError, type AdvisorTransportCause } from '@/core/domain/models/AdvisorEntities'
import { isRetryableOutcome, useAdvisorChat, type AdvisorTurnOutcome } from '../useAdvisorChat'
import composableSource from '../useAdvisorChat.ts?raw'

type Run = (signal: AbortSignal) => AsyncIterable<AdvisorStreamEvent>

interface ScriptedPort extends IAdvisorPort {
  readonly requests: AdvisorAskRequest[]
  readonly signals: AbortSignal[]
}

function scriptedPort(...runs: Run[]): ScriptedPort {
  const requests: AdvisorAskRequest[] = []
  const signals: AbortSignal[] = []
  return {
    requests,
    signals,
    ask(request, signal) {
      requests.push(request)
      signals.push(signal)
      const run = runs[requests.length - 1]
      if (run === undefined) throw new Error('no scripted run left')
      return run(signal)
    },
    async getConfig() {
      return { chain: [], providers: [] }
    },
    async setModelChain() {},
    async getExecutionProfiles() {
      return defaultExecutionProfiles()
    },
    async setExecutionProfiles(profiles) {
      return profiles
    },
  }
}

function emitting(...events: AdvisorStreamEvent[]): Run {
  return async function* () {
    for (const event of events) yield event
  }
}

function emittingThenHolding(...events: AdvisorStreamEvent[]): Run {
  return async function* (signal) {
    for (const event of events) yield event
    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
  }
}

const token = (text: string): AdvisorStreamEvent => ({ kind: 'token', runId: 'run-1', text })

const done = (
  threadId: string,
  flags: { disclaimer: boolean; figuresIncomplete: boolean } = { disclaimer: false, figuresIncomplete: false },
): AdvisorStreamEvent => ({
  kind: 'done',
  runId: 'run-1',
  threadId,
  providerId: 'ollama',
  modelId: 'llama3',
  usage: { inputTokens: 3, outputTokens: 4 },
  toolsCalled: [],
  executionProfile: 'local',
  stepsUsed: 2,
  maxSteps: 15,
  ...flags,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAdvisorChat transport-freedom', () => {
  it('never calls fetch while running against a port', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const chat = useAdvisorChat(scriptedPort(emitting(token('a'), done('t1'))))

    await chat.send('hi')

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(chat.state.value.kind).toBe('done')
  })

  it('contains no transport or wire-parsing code in its source', () => {
    for (const forbidden of [/fetch\s*\(/, /getReader/, /ReadableStream/, /EventSource/, /TextDecoder/, /JSON\.parse/]) {
      expect(composableSource).not.toMatch(forbidden)
    }
  })
})

describe('useAdvisorChat streaming state', () => {
  it('accumulates tokens and finishes as done with the receipt fields', async () => {
    const chat = useAdvisorChat(scriptedPort(emitting(token('Hel'), token('lo'), done('t1'))))

    await chat.send('hi')

    expect(chat.turns.value).toHaveLength(1)
    expect(chat.turns.value[0].message).toBe('hi')
    expect(chat.turns.value[0].answer).toBe('Hello')
    expect(chat.state.value).toEqual({
      kind: 'done',
      threadId: 't1',
      providerId: 'ollama',
      modelId: 'llama3',
      executionProfile: 'local',
      stepsUsed: 2,
      maxSteps: 15,
      disclaimer: false,
      figuresIncomplete: false,
    })
  })

  it('keeps the disclaimer and incomplete-figures flags of the done frame on the turn outcome', async () => {
    const chat = useAdvisorChat(
      scriptedPort(emitting(token('Hello'), done('t1', { disclaimer: true, figuresIncomplete: true }))),
    )

    await chat.send('hi')

    expect(chat.state.value).toMatchObject({ kind: 'done', disclaimer: true, figuresIncomplete: true })
  })

  it('tracks tool activity per callId through start, result and error', async () => {
    const chat = useAdvisorChat(
      scriptedPort(
        emitting(
          { kind: 'tool-start', runId: 'run-1', callId: 'c1', tool: 'kpis' },
          { kind: 'tool-start', runId: 'run-1', callId: 'c2', tool: 'live_prices' },
          { kind: 'tool-result', runId: 'run-1', callId: 'c1', tool: 'kpis' },
          { kind: 'tool-error', runId: 'run-1', callId: 'c2', tool: 'live_prices', code: 'USE_CASE_FAILED' },
          done('t1'),
        ),
      ),
    )

    await chat.send('hi')

    expect(chat.turns.value[0].tools).toEqual([
      { callId: 'c1', tool: 'kpis', status: { kind: 'finished' } },
      { callId: 'c2', tool: 'live_prices', status: { kind: 'failed', code: 'USE_CASE_FAILED' } },
    ])
  })

  it('reports streaming while a run is in flight', async () => {
    const chat = useAdvisorChat(scriptedPort(emittingThenHolding(token('a'))))

    const pending = chat.send('hi')
    await vi.waitFor(() => expect(chat.turns.value[0]?.answer).toBe('a'))
    expect(chat.state.value).toEqual({ kind: 'streaming' })

    chat.abort()
    await pending
  })

  it('maps a refused terminal frame to a refused state carrying the reason', async () => {
    const chat = useAdvisorChat(
      scriptedPort(emitting({ kind: 'refused', runId: 'run-1', threadId: 't1', reason: 'off topic', processorId: 'scope' })),
    )

    await chat.send('hi')

    expect(chat.state.value).toEqual({ kind: 'refused', threadId: 't1', reason: 'off topic', processorId: 'scope' })
  })

  it('maps a failed terminal frame to a failed state carrying the code', async () => {
    const chat = useAdvisorChat(
      scriptedPort(emitting({ kind: 'failed', runId: 'run-1', threadId: 't1', code: 'VAULT_LOCKED' })),
    )

    await chat.send('hi')

    expect(chat.state.value).toEqual({ kind: 'failed', code: 'VAULT_LOCKED' })
  })

  it('maps an ALL_PROVIDERS_FAILED frame to a failed state carrying its cause', async () => {
    const cause = { kind: 'auth-rejected', providerId: 'ollama-cloud', modelId: 'gpt-oss:120b' } as const
    const chat = useAdvisorChat(
      scriptedPort(emitting({ kind: 'failed', runId: 'run-1', threadId: 't1', code: 'ALL_PROVIDERS_FAILED', cause })),
    )

    await chat.send('hi')

    expect(chat.state.value).toEqual({ kind: 'failed', code: 'ALL_PROVIDERS_FAILED', cause })
  })

  it('ignores a second send while a run is in flight', async () => {
    const port = scriptedPort(emittingThenHolding(token('a')), emitting(done('t2')))
    const chat = useAdvisorChat(port)

    const first = chat.send('one')
    await vi.waitFor(() => expect(chat.turns.value[0]?.answer).toBe('a'))
    await chat.send('two')

    expect(port.requests).toHaveLength(1)
    chat.abort()
    await first
  })
})

describe('useAdvisorChat transport loss', () => {
  it('synthesizes transport-lost, not success, when the iteration ends after tokens with no terminal frame', async () => {
    const port = scriptedPort(emitting(token('partial '), token('answer')))
    const chat = useAdvisorChat(port)

    await chat.send('hi')

    expect(chat.state.value).toEqual({ kind: 'transport-lost', cause: { kind: 'stream-ended' } })
    expect(chat.state.value.kind).not.toBe('done')
    expect(chat.turns.value[0].answer).toBe('partial answer')
  })

  it('treats an unrecognised thrown error as a network cause', async () => {
    const chat = useAdvisorChat(
      scriptedPort(async function* () {
        yield token('partial')
        throw new Error('connection reset')
      }),
    )

    await chat.send('hi')

    expect(chat.state.value).toEqual({ kind: 'transport-lost', cause: { kind: 'network' } })
  })

  it('carries the cause of a stream error thrown by the adapter', async () => {
    const cause: AdvisorTransportCause = { kind: 'http', status: 502 }
    const chat = useAdvisorChat(
      scriptedPort(async function* () {
        yield token('partial')
        throw new AdvisorStreamError('bad gateway', cause)
      }),
    )

    await chat.send('hi')

    expect(chat.state.value).toEqual({ kind: 'transport-lost', cause })
  })

  it('never re-runs on its own and only retries when asked', async () => {
    const port = scriptedPort(emitting(token('partial')), emitting(token('full'), done('t1')))
    const chat = useAdvisorChat(port)

    await chat.send('hi')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(port.requests).toHaveLength(1)

    await chat.retry()

    expect(port.requests).toHaveLength(2)
    expect(port.requests[1].message).toBe('hi')
    expect(chat.turns.value).toHaveLength(1)
    expect(chat.turns.value[0].answer).toBe('full')
    expect(chat.state.value.kind).toBe('done')
  })
})

describe('useAdvisorChat cancellation', () => {
  it('passes its own signal to the port and ends the run as user-aborted when abort() is called', async () => {
    const port = scriptedPort(emittingThenHolding(token('par')))
    const chat = useAdvisorChat(port)

    const pending = chat.send('hi')
    await vi.waitFor(() => expect(chat.turns.value[0]?.answer).toBe('par'))
    expect(port.signals[0].aborted).toBe(false)

    chat.abort()
    await pending

    expect(port.signals[0].aborted).toBe(true)
    expect(chat.state.value).toEqual({ kind: 'user-aborted' })
    expect(chat.turns.value[0].answer).toBe('par')
  })

  it('does not reconnect or re-run after an abort', async () => {
    const port = scriptedPort(emittingThenHolding(token('par')), emitting(done('t2')))
    const chat = useAdvisorChat(port)

    const pending = chat.send('hi')
    await vi.waitFor(() => expect(chat.turns.value[0]?.answer).toBe('par'))
    chat.abort()
    await pending
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(port.requests).toHaveLength(1)
    expect(chat.state.value.kind).toBe('user-aborted')
  })

  it('keeps a terminal outcome that arrived before the abort', async () => {
    const chat = useAdvisorChat(scriptedPort(emitting(token('a'), done('t1'))))

    await chat.send('hi')
    chat.abort()

    expect(chat.state.value.kind).toBe('done')
  })

  it('does nothing when aborted while idle', () => {
    const chat = useAdvisorChat(scriptedPort())

    chat.abort()

    expect(chat.state.value).toEqual({ kind: 'idle' })
  })
})

describe('useAdvisorChat thread continuity', () => {
  it('sends the thread id reported by the previous terminal frame on a follow-up', async () => {
    const port = scriptedPort(emitting(done('t1')), emitting(done('t1')))
    const chat = useAdvisorChat(port)

    await chat.send('first')
    await chat.send('second')

    expect(port.requests[0]).toEqual({ message: 'first' })
    expect(port.requests[1]).toEqual({ message: 'second', threadId: 't1' })
    expect(chat.threadId.value).toBe('t1')
  })

  it('continues the thread after a refusal or a failure that reports one', async () => {
    const port = scriptedPort(
      emitting({ kind: 'refused', runId: 'r', threadId: 't1', reason: 'x', processorId: 'p' }),
      emitting({
        kind: 'failed',
        runId: 'r',
        threadId: 't1',
        code: 'ALL_PROVIDERS_FAILED',
        cause: { kind: 'network', providerId: 'ollama', modelId: 'm' },
      }),
      emitting(done('t1')),
    )
    const chat = useAdvisorChat(port)

    await chat.send('a')
    await chat.send('b')
    await chat.send('c')

    expect(port.requests.map((request) => request.threadId)).toEqual([undefined, 't1', 't1'])
  })

  it('omits the thread id after a new conversation is started', async () => {
    const port = scriptedPort(emitting(done('t1')), emitting(done('t2')))
    const chat = useAdvisorChat(port)

    await chat.send('first')
    chat.newConversation()
    await chat.send('fresh')

    expect(port.requests[1]).toEqual({ message: 'fresh' })
    expect(chat.turns.value).toHaveLength(1)
    expect(chat.threadId.value).toBe('t2')
  })

  it('leaves the thread unset when the first turn ends with no terminal frame', async () => {
    const port = scriptedPort(emitting(token('partial')), emitting(done('t9')))
    const chat = useAdvisorChat(port)

    await chat.send('first')
    expect(chat.threadId.value).toBeUndefined()
    await chat.send('second')

    expect(port.requests[1]).toEqual({ message: 'second' })
  })

  it('leaves the thread unset when the first turn is aborted', async () => {
    const port = scriptedPort(emittingThenHolding(token('par')), emitting(done('t9')))
    const chat = useAdvisorChat(port)

    const pending = chat.send('first')
    await vi.waitFor(() => expect(chat.turns.value[0]?.answer).toBe('par'))
    chat.abort()
    await pending
    await chat.send('second')

    expect(port.requests[1]).toEqual({ message: 'second' })
  })

  it('leaves the thread unset when the first turn fails without a thread id', async () => {
    const port = scriptedPort(
      emitting({ kind: 'failed', runId: 'unknown', code: 'INTERNAL_ERROR' }),
      emitting(done('t9')),
    )
    const chat = useAdvisorChat(port)

    await chat.send('first')
    await chat.send('second')

    expect(chat.state.value.kind).toBe('done')
    expect(port.requests[1]).toEqual({ message: 'second' })
  })

  it('keeps an already-known thread when a later turn ends without a terminal frame', async () => {
    const port = scriptedPort(emitting(done('t1')), emitting(token('partial')), emitting(done('t1')))
    const chat = useAdvisorChat(port)

    await chat.send('one')
    await chat.send('two')
    await chat.send('three')

    expect(port.requests.map((request) => request.threadId)).toEqual([undefined, 't1', 't1'])
  })
})

describe('isRetryableOutcome', () => {
  const lost = (cause: AdvisorTransportCause): AdvisorTurnOutcome => ({ kind: 'transport-lost', cause })
  const providersFailedOutcome = (kind: AdvisorProviderFailureKind): AdvisorTurnOutcome => ({
    kind: 'failed',
    code: 'ALL_PROVIDERS_FAILED',
    cause: { kind, providerId: 'ollama-cloud', modelId: 'gpt-oss:120b' },
  })
  const table: ReadonlyArray<readonly [string, AdvisorTurnOutcome, boolean]> = [
    ['network', lost({ kind: 'network' }), true],
    ['stream-ended', lost({ kind: 'stream-ended' }), true],
    ['http 500', lost({ kind: 'http', status: 500 }), true],
    ['http 503', lost({ kind: 'http', status: 503 }), true],
    ['http 429', lost({ kind: 'http', status: 429 }), true],
    ['http 400', lost({ kind: 'http', status: 400 }), false],
    ['http 404', lost({ kind: 'http', status: 404 }), false],
    ['invalid-frame', lost({ kind: 'invalid-frame' }), false],
    ['no-body', lost({ kind: 'no-body' }), false],
    ['failed without a provider involved', { kind: 'failed', code: 'VAULT_LOCKED' }, true],
    ['providers failed: auth rejected', providersFailedOutcome('auth-rejected'), false],
    ['providers failed: model not found', providersFailedOutcome('model-not-found'), false],
    ['providers failed: rate limited', providersFailedOutcome('rate-limited'), true],
    ['providers failed: provider unavailable', providersFailedOutcome('provider-unavailable'), true],
    ['providers failed: network', providersFailedOutcome('network'), true],
    ['providers failed: unknown', providersFailedOutcome('unknown'), true],
    ['user-aborted', { kind: 'user-aborted' }, true],
    ['streaming', { kind: 'streaming' }, false],
    [
      'done',
      {
        kind: 'done',
        threadId: 't',
        providerId: 'ollama',
        modelId: 'm',
        executionProfile: 'local',
        stepsUsed: 1,
        maxSteps: 2,
        disclaimer: false,
        figuresIncomplete: false,
      },
      false,
    ],
    ['refused', { kind: 'refused', threadId: 't', reason: 'r', processorId: 'p' }, false],
  ]

  it.each(table)('%s', (_name, outcome, expected) => {
    expect(isRetryableOutcome(outcome)).toBe(expected)
  })
})

describe('useAdvisorChat retry policy', () => {
  it('refuses to retry a non-retryable cause', async () => {
    const port = scriptedPort(
      async function* () {
        throw new AdvisorStreamError('no body', { kind: 'no-body' })
      },
      emitting(done('t1')),
    )
    const chat = useAdvisorChat(port)

    await chat.send('hi')
    await chat.retry()

    expect(port.requests).toHaveLength(1)
    expect(chat.turns.value).toHaveLength(1)
    expect(chat.state.value).toEqual({ kind: 'transport-lost', cause: { kind: 'no-body' } })
  })
})
