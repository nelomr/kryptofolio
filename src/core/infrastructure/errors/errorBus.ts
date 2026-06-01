/**
 * errorBus — Global event emitter for validation errors.
 *
 * When a Zod `safeParse` fails in any adapter, it emits a 'validation-error' event
 * here. The App.vue root component listens to this bus and displays a Sonner toast.
 *
 * This pattern keeps adapters completely decoupled from Vue's component tree
 * while still being able to notify the user of data corruption.
 *
 * Usage in adapter:
 *   errorBus.emit('validation-error', { message: 'Portfolio API returned malformed data', details: zodError })
 *
 * Usage in App.vue:
 *   errorBus.on('validation-error', (err) => toast.error(err.message))
 *
 * @see openspec/changes/hex-arch-zod-refactor/specs/global-error-handling/spec.md
 */

type ValidationErrorPayload = {
  message: string
  context?: string
  details?: unknown
}

type OperationErrorPayload = {
  code: string
  message: string
}

type ErrorBusEvents = {
  'validation-error': ValidationErrorPayload
  'operation-error': OperationErrorPayload
}

type EventListener<T> = (payload: T) => void

class ErrorBus {
  private listeners: Map<string, Set<EventListener<unknown>>> = new Map()

  on<K extends keyof ErrorBusEvents>(
    event: K,
    listener: EventListener<ErrorBusEvents[K]>,
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(listener as EventListener<unknown>)
  }

  off<K extends keyof ErrorBusEvents>(
    event: K,
    listener: EventListener<ErrorBusEvents[K]>,
  ): void {
    this.listeners.get(event)?.delete(listener as EventListener<unknown>)
  }

  emit<K extends keyof ErrorBusEvents>(event: K, payload: ErrorBusEvents[K]): void {
    this.listeners.get(event)?.forEach((listener) => listener(payload))
  }
}

/** Singleton error bus — import this in adapters and App.vue */
export const errorBus = new ErrorBus()
export type { ValidationErrorPayload }
