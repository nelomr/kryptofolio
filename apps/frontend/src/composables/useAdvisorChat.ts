import { computed, getCurrentScope, onScopeDispose, readonly, ref } from 'vue'
import type {
  AdvisorStreamEvent,
  AdvisorToolErrorCode,
  AdvisorToolName,
  AdvisorCauselessFailureCode,
  AdvisorProviderFailureCause,
  AdvisorProviderFailureKind,
  AiProviderId,
  RunExecutionProfile,
} from '@kryptofolio/shared-types'
import type { IAdvisorPort } from '@/core/domain/ports/IAdvisorPort'
import {
  AdvisorStreamError,
  type AdvisorAskRequest,
  type AdvisorTransportCause,
} from '@/core/domain/models/AdvisorEntities'

export type AdvisorToolStatus =
  | { readonly kind: 'running' }
  | { readonly kind: 'finished' }
  | { readonly kind: 'failed'; readonly code: AdvisorToolErrorCode }

export interface AdvisorToolActivity {
  readonly callId: string
  readonly tool: AdvisorToolName
  status: AdvisorToolStatus
}

/**
 * `transport-lost` and `user-aborted` exist only here: neither is a wire frame. A stream that
 * closes with no terminal frame is indistinguishable from a dropped connection, so it must never
 * read as success, and an abort ends the run before any terminal frame can arrive.
 */
export type AdvisorTurnOutcome =
  | { readonly kind: 'streaming' }
  | {
      readonly kind: 'done'
      readonly threadId: string
      readonly providerId: AiProviderId
      readonly modelId: string
      readonly executionProfile: RunExecutionProfile
      readonly stepsUsed: number
      readonly maxSteps: number
      readonly disclaimer: boolean
      readonly figuresIncomplete: boolean
    }
  | {
      readonly kind: 'refused'
      readonly threadId: string
      readonly reason: string
      readonly processorId: string
    }
  | { readonly kind: 'failed'; readonly code: AdvisorCauselessFailureCode }
  | {
      readonly kind: 'failed'
      readonly code: 'ALL_PROVIDERS_FAILED'
      readonly cause: AdvisorProviderFailureCause
    }
  | { readonly kind: 'transport-lost'; readonly cause: AdvisorTransportCause }
  | { readonly kind: 'user-aborted' }

/** A 5xx or a 429 clears by itself; every other status rejected the request as sent. */
export function isTransientHttpStatus(status: number): boolean {
  return status >= 500 || status === 429
}

/** A rejected key or an unknown model recurs unchanged until the user edits the settings. */
function isTransientProviderFailure(kind: AdvisorProviderFailureKind): boolean {
  return kind !== 'auth-rejected' && kind !== 'model-not-found'
}

/**
 * Resending the identical message can only succeed when the failure was transient. A malformed
 * frame, a missing body or a client-error status will recur unchanged, so the user has to change
 * something instead. Rate limiting (429) is the one client error that clears by itself.
 */
export function isRetryableOutcome(outcome: AdvisorTurnOutcome): boolean {
  switch (outcome.kind) {
    case 'failed':
      return outcome.code === 'ALL_PROVIDERS_FAILED' ? isTransientProviderFailure(outcome.cause.kind) : true
    case 'user-aborted':
      return true
    case 'transport-lost':
      switch (outcome.cause.kind) {
        case 'network':
        case 'stream-ended':
          return true
        case 'http':
          return isTransientHttpStatus(outcome.cause.status)
        case 'invalid-frame':
        case 'no-body':
          return false
      }
    case 'streaming':
    case 'done':
    case 'refused':
      return false
  }
}

export type AdvisorChatState = { readonly kind: 'idle' } | AdvisorTurnOutcome

export interface AdvisorTurn {
  readonly message: string
  answer: string
  tools: AdvisorToolActivity[]
  outcome: AdvisorTurnOutcome
}

/**
 * State only: it consumes the port's event iteration and holds what the UI renders. Everything
 * about how events arrive lives in the adapter behind the port.
 */
export function useAdvisorChat(port: IAdvisorPort) {
  const turns = ref<AdvisorTurn[]>([])
  const threadId = ref<string | undefined>(undefined)
  let activeController: AbortController | undefined

  const state = computed<AdvisorChatState>(() => turns.value.at(-1)?.outcome ?? { kind: 'idle' })

  function applyEvent(turn: AdvisorTurn, event: AdvisorStreamEvent): boolean {
    switch (event.kind) {
      case 'token':
        turn.answer += event.text
        return false
      case 'tool-start':
        turn.tools.push({ callId: event.callId, tool: event.tool, status: { kind: 'running' } })
        return false
      case 'tool-result':
        setToolStatus(turn, event.callId, { kind: 'finished' })
        return false
      case 'tool-error':
        setToolStatus(turn, event.callId, { kind: 'failed', code: event.code })
        return false
      case 'done':
        threadId.value = event.threadId
        turn.outcome = {
          kind: 'done',
          threadId: event.threadId,
          providerId: event.providerId,
          modelId: event.modelId,
          executionProfile: event.executionProfile,
          stepsUsed: event.stepsUsed,
          maxSteps: event.maxSteps,
          disclaimer: event.disclaimer,
          figuresIncomplete: event.figuresIncomplete,
        }
        return true
      case 'refused':
        threadId.value = event.threadId
        turn.outcome = {
          kind: 'refused',
          threadId: event.threadId,
          reason: event.reason,
          processorId: event.processorId,
        }
        return true
      case 'failed':
        // A failure before any receipt existed carries no thread id; an already-known thread must
        // survive it, and a brand-new conversation stays unset rather than inventing one.
        if (event.threadId !== undefined) threadId.value = event.threadId
        turn.outcome =
          event.code === 'ALL_PROVIDERS_FAILED'
            ? { kind: 'failed', code: event.code, cause: event.cause }
            : { kind: 'failed', code: event.code }
        return true
    }
  }

  function setToolStatus(turn: AdvisorTurn, callId: string, status: AdvisorToolStatus): void {
    const activity = turn.tools.find((candidate) => candidate.callId === callId)
    if (activity !== undefined) activity.status = status
  }

  async function send(message: string): Promise<void> {
    if (activeController !== undefined) return

    const controller = new AbortController()
    activeController = controller
    turns.value.push({ message, answer: '', tools: [], outcome: { kind: 'streaming' } })
    const turn = turns.value[turns.value.length - 1]

    const request: AdvisorAskRequest =
      threadId.value === undefined ? { message } : { message, threadId: threadId.value }

    let ended = false
    let thrownCause: AdvisorTransportCause | undefined
    try {
      for await (const event of port.ask(request, controller.signal)) {
        if (turn.outcome.kind !== 'streaming') break
        if (applyEvent(turn, event)) {
          ended = true
          break
        }
      }
    } catch (err) {
      thrownCause = err instanceof AdvisorStreamError ? err.transportCause : { kind: 'network' }
    } finally {
      if (activeController === controller) activeController = undefined
    }

    if (!ended && turn.outcome.kind === 'streaming') {
      turn.outcome = controller.signal.aborted
        ? { kind: 'user-aborted' }
        : { kind: 'transport-lost', cause: thrownCause ?? { kind: 'stream-ended' } }
    }
  }

  function abort(): void {
    const controller = activeController
    const turn = turns.value.at(-1)
    if (controller === undefined || turn === undefined || turn.outcome.kind !== 'streaming') return
    // The outcome is settled here, not when the iteration winds down, so a port that is slow to
    // react to the signal cannot leave the UI stuck in `streaming`.
    turn.outcome = { kind: 'user-aborted' }
    activeController = undefined
    controller.abort()
  }

  async function retry(): Promise<void> {
    const last = turns.value.at(-1)
    if (activeController !== undefined || last === undefined) return
    if (!isRetryableOutcome(last.outcome)) return
    turns.value.pop()
    await send(last.message)
  }

  function newConversation(): void {
    abort()
    turns.value = []
    threadId.value = undefined
  }

  if (getCurrentScope() !== undefined) onScopeDispose(abort)

  return {
    turns: readonly(turns),
    state,
    threadId: readonly(threadId),
    send,
    abort,
    retry,
    newConversation,
  }
}
