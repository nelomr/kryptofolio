/**
 * BffMarketDataAdapter — SSE connectivity feedback.
 *
 * Real UX gap found by the user: `subscribeToStream`'s `onError` callback exists on the port but
 * `useMarketDataFeed` never passes one, and nothing else surfaced a disconnect either — the
 * browser's `EventSource` auto-reconnects silently, so a dead backend produced only
 * `net::ERR_CONNECTION_REFUSED` console spam with no visible "stream down" state, which read as
 * "the whole app broke" even though it recovers on its own once the backend comes back.
 *
 * Fixed at the adapter (the same place the other SSE failure paths already call `errorBus`, so
 * `App.vue`'s existing toast wiring is the single place that reacts), not via the optional
 * `onError` callback — this must fire regardless of whether a caller passed one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BffMarketDataAdapter } from '../BffMarketDataAdapter'
import { errorBus } from '@/core/infrastructure/errors/errorBus'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  listeners = new Map<string, Set<(event: unknown) => void>>()
  closed = false
  url: string

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(listener)
  }

  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.get(type)?.delete(listener)
  }

  close() {
    this.closed = true
  }

  emit(type: string, event: unknown = {}) {
    for (const l of this.listeners.get(type) ?? []) l(event)
  }
}

describe('BffMarketDataAdapter — SSE connectivity feedback', () => {
  beforeEach(() => {
    FakeEventSource.instances = []
    vi.stubGlobal('EventSource', FakeEventSource)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('emits an operation-error once when the stream goes down, even with no onError callback passed', () => {
    const spy = vi.fn()
    errorBus.on('operation-error', spy)

    const adapter = new BffMarketDataAdapter()
    adapter.subscribeToStream(() => {})

    const source = FakeEventSource.instances[0]!
    source.emit('error')

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ code: 'MARKET_STREAM_DOWN' }))

    errorBus.off('operation-error', spy)
  })

  it('does not re-emit MARKET_STREAM_DOWN on repeated reconnect attempts while still down', () => {
    const spy = vi.fn()
    errorBus.on('operation-error', spy)

    const adapter = new BffMarketDataAdapter()
    adapter.subscribeToStream(() => {})
    const source = FakeEventSource.instances[0]!

    source.emit('error')
    source.emit('error')
    source.emit('error')

    expect(spy).toHaveBeenCalledTimes(1)

    errorBus.off('operation-error', spy)
  })

  it('emits MARKET_STREAM_RECOVERED once the connection reopens after having been down', () => {
    const spy = vi.fn()
    errorBus.on('operation-error', spy)

    const adapter = new BffMarketDataAdapter()
    adapter.subscribeToStream(() => {})
    const source = FakeEventSource.instances[0]!

    source.emit('error')
    source.emit('open')

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ code: 'MARKET_STREAM_RECOVERED' }))

    errorBus.off('operation-error', spy)
  })

  it('does not emit MARKET_STREAM_RECOVERED on the initial connection open (never having been down)', () => {
    const spy = vi.fn()
    errorBus.on('operation-error', spy)

    const adapter = new BffMarketDataAdapter()
    adapter.subscribeToStream(() => {})
    const source = FakeEventSource.instances[0]!

    source.emit('open')

    expect(spy).not.toHaveBeenCalled()

    errorBus.off('operation-error', spy)
  })

  it('still invokes an explicitly passed onError callback, alongside the errorBus emit', () => {
    const onError = vi.fn()
    const adapter = new BffMarketDataAdapter()
    adapter.subscribeToStream(() => {}, onError)

    const source = FakeEventSource.instances[0]!
    source.emit('error')

    expect(onError).toHaveBeenCalled()
  })
})
