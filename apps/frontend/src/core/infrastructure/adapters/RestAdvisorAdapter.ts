import {
  advisorStreamEventSchema,
  executionProfilesSchema,
  type AdvisorStreamEvent,
  type ExecutionProfiles,
  type ModelChain,
} from '@kryptofolio/shared-types'
import type { IAdvisorPort } from '@/core/domain/ports/IAdvisorPort'
import {
  AdvisorStreamError,
  type AdvisorAskRequest,
  type AdvisorConfig,
  type AdvisorTransportCause,
} from '@/core/domain/models/AdvisorEntities'
import { AdvisorConfigSchema } from '@/core/infrastructure/dtos/AdvisorSchemas'
import { errorBus } from '@/core/infrastructure/errors/errorBus'
import { BFF_BASE_URL, bffClient } from '../http/BffClient'

export class AdvisorAdapterError extends Error {
  constructor(message: string) {
    super(`[RestAdvisorAdapter] ${message}`)
    this.name = 'AdvisorAdapterError'
  }
}

/**
 * The stream is a plain `fetch` POST read by hand. The browser's built-in server-sent-events client
 * would be simpler, but it cannot POST a body and it reconnects on its own, which would silently
 * re-run (and re-bill) an LLM call that had already finished. Every retry here is an explicit user
 * action made above this adapter.
 */
export class RestAdvisorAdapter implements IAdvisorPort {
  private readonly baseUrl: string

  constructor(baseUrl: string = BFF_BASE_URL) {
    this.baseUrl = baseUrl
  }

  async *ask(request: AdvisorAskRequest, signal: AbortSignal): AsyncIterable<AdvisorStreamEvent> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/api/advisor/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify(request),
        signal,
      })
    } catch (err) {
      if (signal.aborted) return
      throw failStream(err instanceof Error ? err.message : 'request failed', { kind: 'network' })
    }

    if (!response.ok) {
      throw failStream(`/api/advisor/stream returned ${response.status}`, {
        kind: 'http',
        status: response.status,
      })
    }
    if (response.body === null) {
      throw failStream('/api/advisor/stream returned no body', { kind: 'no-body' })
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    // A carriage return at the end of a chunk may be the first half of a CRLF pair, so it is held
    // back until the next chunk shows whether a line feed follows.
    let heldCarriageReturn = ''
    let buffer = ''

    try {
      while (true) {
        let chunk: ReadableStreamReadResult<Uint8Array>
        try {
          chunk = await reader.read()
        } catch (err) {
          if (signal.aborted) return
          throw failStream(err instanceof Error ? err.message : 'stream read failed', { kind: 'network' })
        }
        if (chunk.done) return

        const text = heldCarriageReturn + decoder.decode(chunk.value, { stream: true })
        heldCarriageReturn = text.endsWith('\r') ? '\r' : ''
        buffer += text.slice(0, text.length - heldCarriageReturn.length).replace(/\r\n?/g, '\n')

        let boundary = buffer.indexOf('\n\n')
        while (boundary !== -1) {
          const rawFrame = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          const data = dataOf(rawFrame)
          if (data !== null) yield parseFrame(data)
          boundary = buffer.indexOf('\n\n')
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined)
    }
  }

  async getConfig(): Promise<AdvisorConfig> {
    const res = await bffClient.api.advisor.config.$get()
    if (!res.ok) throw new AdvisorAdapterError(`/api/advisor/config returned ${res.status}`)
    return parseOrFail(AdvisorConfigSchema, await res.json(), 'RestAdvisorAdapter.getConfig')
  }

  async setModelChain(chain: ModelChain): Promise<void> {
    const res = await bffClient.api.advisor.config['model-chain'].$put({ json: chain })
    if (!res.ok) {
      errorBus.emit('operation-error', {
        code: 'ADVISOR_MODEL_CHAIN_REJECTED',
        message: 'errors.advisor.model_chain_rejected',
      })
      throw new AdvisorAdapterError(`/api/advisor/config/model-chain returned ${res.status}`)
    }
  }

  async getExecutionProfiles(): Promise<ExecutionProfiles> {
    const res = await bffClient.api.advisor.config['execution-profiles'].$get()
    if (!res.ok) {
      throw new AdvisorAdapterError(`/api/advisor/config/execution-profiles returned ${res.status}`)
    }
    return parseOrFail(executionProfilesSchema, await res.json(), 'RestAdvisorAdapter.getExecutionProfiles')
  }

  async setExecutionProfiles(profiles: ExecutionProfiles): Promise<ExecutionProfiles> {
    // Validated before sending so a value above a ceiling is reported as-is; the server would
    // reject it too, but nothing here ever rewrites the number to fit.
    const checked = parseOrFail(executionProfilesSchema, profiles, 'RestAdvisorAdapter.setExecutionProfiles')
    const res = await bffClient.api.advisor.config['execution-profiles'].$put({ json: checked })
    if (!res.ok) {
      errorBus.emit('operation-error', {
        code: 'ADVISOR_EXECUTION_PROFILES_REJECTED',
        message: 'errors.advisor.execution_profiles_rejected',
      })
      throw new AdvisorAdapterError(`/api/advisor/config/execution-profiles returned ${res.status}`)
    }
    return parseOrFail(executionProfilesSchema, await res.json(), 'RestAdvisorAdapter.setExecutionProfiles')
  }
}

/** The joined `data:` payload of one SSE frame, or `null` when the frame carries none (comments only). */
function dataOf(rawFrame: string): string | null {
  const dataLines: string[] = []
  for (const line of rawFrame.split('\n')) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''))
    }
  }
  return dataLines.length === 0 ? null : dataLines.join('\n')
}

const STREAM_FAILURE_REPORTS = {
  network: { code: 'ADVISOR_STREAM_NETWORK', message: 'errors.advisor.stream_network' },
  http: { code: 'ADVISOR_STREAM_HTTP', message: 'errors.advisor.stream_http' },
  'no-body': { code: 'ADVISOR_STREAM_NO_BODY', message: 'errors.advisor.stream_no_body' },
} as const

/** Reports a stream failure to the user exactly once, here, so the consumer never has to toast it again. */
function failStream(
  detail: string,
  cause: Exclude<AdvisorTransportCause, { kind: 'invalid-frame' | 'stream-ended' }>,
): AdvisorStreamError {
  errorBus.emit('operation-error', STREAM_FAILURE_REPORTS[cause.kind])
  return new AdvisorStreamError(`[RestAdvisorAdapter] ${detail}`, cause)
}

function reportInvalidFrame(details: unknown): never {
  errorBus.emit('validation-error', {
    message: 'errors.advisor.invalid_stream_frame',
    context: 'RestAdvisorAdapter.ask',
    details,
  })
  throw new AdvisorStreamError('[RestAdvisorAdapter] received an invalid stream frame', {
    kind: 'invalid-frame',
  })
}

function parseFrame(data: string): AdvisorStreamEvent {
  let raw: unknown
  try {
    raw = JSON.parse(data)
  } catch (err) {
    return reportInvalidFrame(err)
  }
  const result = advisorStreamEventSchema.safeParse(raw)
  if (!result.success) return reportInvalidFrame(result.error)
  return result.data
}

function parseOrFail<T>(
  schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: unknown } },
  raw: unknown,
  context: string,
): T {
  const result = schema.safeParse(raw)
  if (!result.success) {
    errorBus.emit('validation-error', {
      message: 'errors.validation.api_malformed_data',
      context,
      details: result.error,
    })
    throw new AdvisorAdapterError(`validation failed in ${context}`)
  }
  return result.data
}
