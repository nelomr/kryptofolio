import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AdvisorStreamEvent } from '@kryptofolio/shared-types'
import { RestAdvisorAdapter } from '../RestAdvisorAdapter'
import adapterSource from '../RestAdvisorAdapter.ts?raw'
import { errorBus } from '@/core/infrastructure/errors/errorBus'

vi.mock('@/core/infrastructure/errors/errorBus', () => ({
  errorBus: { emit: vi.fn() },
}))

const BASE_URL = 'http://backend.test'

function sseResponse(chunks: readonly string[], init: ResponseInit = { status: 200 }): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, { ...init, headers: { 'content-type': 'text/event-stream' } })
}

function frame(event: unknown): string {
  const kind = (event as { kind: string }).kind
  return `event: ${kind}\ndata: ${JSON.stringify(event)}\n\n`
}

const token = (text: string): AdvisorStreamEvent => ({ kind: 'token', runId: 'run-1', text })
const done: AdvisorStreamEvent = {
  kind: 'done',
  runId: 'run-1',
  threadId: 'thread-1',
  providerId: 'ollama',
  modelId: 'llama3',
  usage: { inputTokens: 1, outputTokens: 2 },
  toolsCalled: [],
  executionProfile: 'local',
  stepsUsed: 1,
  maxSteps: 15,
  disclaimer: true,
  figuresIncomplete: true,
}

async function collect(iterable: AsyncIterable<AdvisorStreamEvent>): Promise<AdvisorStreamEvent[]> {
  const events: AdvisorStreamEvent[] = []
  for await (const event of iterable) events.push(event)
  return events
}

describe('RestAdvisorAdapter.ask', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(errorBus.emit).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs the request as JSON to the stream endpoint with the caller abort signal', async () => {
    fetchMock.mockResolvedValue(sseResponse([frame(done)]))
    const controller = new AbortController()

    await collect(
      new RestAdvisorAdapter(BASE_URL).ask({ message: 'hello', threadId: 'thread-1' }, controller.signal),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BASE_URL}/api/advisor/stream`)
    expect(init?.method).toBe('POST')
    expect(init?.signal).toBe(controller.signal)
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
    expect(JSON.parse(init?.body as string)).toEqual({ message: 'hello', threadId: 'thread-1' })
  })

  it('omits threadId from the body when the request has none', async () => {
    fetchMock.mockResolvedValue(sseResponse([frame(done)]))

    await collect(new RestAdvisorAdapter(BASE_URL).ask({ message: 'hello' }, new AbortController().signal))

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ message: 'hello' })
  })

  it('yields validated events in order', async () => {
    fetchMock.mockResolvedValue(sseResponse([frame(token('a')), frame(token('b')), frame(done)]))

    const events = await collect(
      new RestAdvisorAdapter(BASE_URL).ask({ message: 'hi' }, new AbortController().signal),
    )

    expect(events).toEqual([token('a'), token('b'), done])
  })

  it('reassembles a frame split across network chunks, including inside a multi-byte character', async () => {
    const whole = frame(token('héllo'))
    const bytes = new TextEncoder().encode(whole)
    const cut = bytes.indexOf(0xc3) + 1
    const encoder = new TextEncoder()
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes.slice(0, cut))
            controller.enqueue(bytes.slice(cut))
            controller.enqueue(encoder.encode(frame(done)))
            controller.close()
          },
        }),
        { status: 200 },
      ),
    )

    const events = await collect(
      new RestAdvisorAdapter(BASE_URL).ask({ message: 'hi' }, new AbortController().signal),
    )

    expect(events).toEqual([token('héllo'), done])
  })

  it('accepts CRLF line endings', async () => {
    const crlf = frame(token('a')).replaceAll('\n', '\r\n')
    fetchMock.mockResolvedValue(sseResponse([crlf, frame(done).replaceAll('\n', '\r\n')]))

    const events = await collect(
      new RestAdvisorAdapter(BASE_URL).ask({ message: 'hi' }, new AbortController().signal),
    )

    expect(events).toEqual([token('a'), done])
  })

  it('ignores comment lines, whether between frames or inside one', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        ': keep-alive\n\n',
        `: note\nevent: token\n: another\ndata: ${JSON.stringify(token('a'))}\n\n`,
        ': keep-alive\n\n',
        frame(done),
      ]),
    )

    const events = await collect(
      new RestAdvisorAdapter(BASE_URL).ask({ message: 'hi' }, new AbortController().signal),
    )

    expect(events).toEqual([token('a'), done])
  })

  it('ends quietly when the stream closes without a terminal frame, leaving the detection to the consumer', async () => {
    fetchMock.mockResolvedValue(sseResponse([frame(token('a')), frame(token('b'))]))

    const events = await collect(
      new RestAdvisorAdapter(BASE_URL).ask({ message: 'hi' }, new AbortController().signal),
    )

    expect(events).toEqual([token('a'), token('b')])
  })

  it('discards a trailing frame that never received its blank-line terminator', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([frame(token('a')), `data: ${JSON.stringify(token('cut off'))}`]),
    )

    const events = await collect(
      new RestAdvisorAdapter(BASE_URL).ask({ message: 'hi' }, new AbortController().signal),
    )

    expect(events).toEqual([token('a')])
  })

  it('rejects when the endpoint answers with an error status', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"bad"}', { status: 400 }))

    await expect(
      collect(new RestAdvisorAdapter(BASE_URL).ask({ message: 'hi' }, new AbortController().signal)),
    ).rejects.toThrow(/400/)
  })

  it('ends without throwing when the caller aborts the request', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    })

    const pending = collect(new RestAdvisorAdapter(BASE_URL).ask({ message: 'hi' }, controller.signal))
    controller.abort()

    await expect(pending).resolves.toEqual([])
  })
})

describe('RestAdvisorAdapter.ask frame validation', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(errorBus.emit).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports a frame that fails schema validation to the errorBus and rejects instead of yielding it', async () => {
    const malformed = { kind: 'token', runId: 'run-1' }
    fetchMock.mockResolvedValue(sseResponse([frame(token('a')), frame(malformed), frame(token('never'))]))

    const seen: AdvisorStreamEvent[] = []
    const run = async () => {
      for await (const event of new RestAdvisorAdapter(BASE_URL).ask(
        { message: 'hi' },
        new AbortController().signal,
      )) {
        seen.push(event)
      }
    }

    await expect(run()).rejects.toThrow()
    expect(seen).toEqual([token('a')])
    expect(errorBus.emit).toHaveBeenCalledTimes(1)
    expect(errorBus.emit).toHaveBeenCalledWith(
      'validation-error',
      expect.objectContaining({
        message: 'errors.advisor.invalid_stream_frame',
        context: 'RestAdvisorAdapter.ask',
      }),
    )
  })

  it('reports a frame whose data is not JSON the same way', async () => {
    fetchMock.mockResolvedValue(sseResponse(['data: {not json\n\n']))

    await expect(
      collect(new RestAdvisorAdapter(BASE_URL).ask({ message: 'hi' }, new AbortController().signal)),
    ).rejects.toThrow()
    expect(errorBus.emit).toHaveBeenCalledWith(
      'validation-error',
      expect.objectContaining({ message: 'errors.advisor.invalid_stream_frame' }),
    )
  })

  it('never surfaces a wire kind outside the schema, such as a synthesized transport-lost frame', async () => {
    fetchMock.mockResolvedValue(sseResponse([frame({ kind: 'transport-lost', runId: 'run-1' })]))

    await expect(
      collect(new RestAdvisorAdapter(BASE_URL).ask({ message: 'hi' }, new AbortController().signal)),
    ).rejects.toThrow()
    expect(errorBus.emit).toHaveBeenCalledTimes(1)
  })
})

describe('RestAdvisorAdapter.ask failure causes', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(errorBus.emit).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function run(signal: AbortSignal = new AbortController().signal) {
    return collect(new RestAdvisorAdapter(BASE_URL).ask({ message: 'hi' }, signal))
  }

  it('maps a fetch rejection to a network cause and reports it once', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(run()).rejects.toMatchObject({ transportCause: { kind: 'network' } })
    expect(errorBus.emit).toHaveBeenCalledTimes(1)
    expect(errorBus.emit).toHaveBeenCalledWith(
      'operation-error',
      expect.objectContaining({ code: 'ADVISOR_STREAM_NETWORK', message: 'errors.advisor.stream_network' }),
    )
  })

  it('maps an error status to an http cause carrying the status and reports it once', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"bad"}', { status: 503 }))

    await expect(run()).rejects.toMatchObject({ transportCause: { kind: 'http', status: 503 } })
    expect(errorBus.emit).toHaveBeenCalledTimes(1)
    expect(errorBus.emit).toHaveBeenCalledWith(
      'operation-error',
      expect.objectContaining({ code: 'ADVISOR_STREAM_HTTP', message: 'errors.advisor.stream_http' }),
    )
  })

  it('maps a response without a body to a no-body cause and reports it once', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))

    await expect(run()).rejects.toMatchObject({ transportCause: { kind: 'no-body' } })
    expect(errorBus.emit).toHaveBeenCalledTimes(1)
    expect(errorBus.emit).toHaveBeenCalledWith(
      'operation-error',
      expect.objectContaining({ code: 'ADVISOR_STREAM_NO_BODY', message: 'errors.advisor.stream_no_body' }),
    )
  })

  it('maps an invalid frame to an invalid-frame cause and reports only the frame error', async () => {
    fetchMock.mockResolvedValue(sseResponse(['data: {not json\n\n']))

    await expect(run()).rejects.toMatchObject({ transportCause: { kind: 'invalid-frame' } })
    expect(errorBus.emit).toHaveBeenCalledTimes(1)
    expect(errorBus.emit).toHaveBeenCalledWith('validation-error', expect.anything())
  })

  it('maps a read failure mid-stream to a network cause and reports it once', async () => {
    const encoder = new TextEncoder()
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(frame(token('a'))))
            controller.error(new TypeError('network error'))
          },
        }),
        { status: 200 },
      ),
    )

    await expect(run()).rejects.toMatchObject({ transportCause: { kind: 'network' } })
    expect(errorBus.emit).toHaveBeenCalledTimes(1)
    expect(errorBus.emit).toHaveBeenCalledWith(
      'operation-error',
      expect.objectContaining({ code: 'ADVISOR_STREAM_NETWORK' }),
    )
  })

  it('reports nothing when the caller aborts', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    })

    const pending = run(controller.signal)
    controller.abort()

    await expect(pending).resolves.toEqual([])
    expect(errorBus.emit).not.toHaveBeenCalled()
  })
})

describe('RestAdvisorAdapter transport API', () => {
  it('never uses the browser auto-reconnecting event source', async () => {
    const eventSourceSpy = vi.fn()
    vi.stubGlobal('EventSource', eventSourceSpy)
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(sseResponse([frame(done)]))
    vi.stubGlobal('fetch', fetchMock)

    await collect(new RestAdvisorAdapter(BASE_URL).ask({ message: 'hi' }, new AbortController().signal))

    expect(eventSourceSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('does not reference the event source API anywhere in its source', () => {
    expect(adapterSource).not.toMatch(/EventSource/)
  })
})
