import type { AiProviderId, ModelChainEntry } from '@kryptofolio/shared-types'

export interface AdvisorAskRequest {
  readonly message: string
  /** Absent when starting a new conversation; the server then allocates the thread. */
  readonly threadId?: string
}

export type AdvisorCredentialState =
  | { readonly kind: 'present' }
  | { readonly kind: 'absent' }
  | { readonly kind: 'locked' }

export interface AdvisorProviderStatus {
  readonly id: AiProviderId
  readonly credential: AdvisorCredentialState
}

export interface AdvisorConfig {
  /** Empty until the user has configured a chain. */
  readonly chain: readonly ModelChainEntry[]
  readonly providers: readonly AdvisorProviderStatus[]
}

/**
 * Why a run's stream ended without a terminal frame. `stream-ended` is the only cause a consumer
 * synthesizes itself: the connection closed cleanly but no terminal frame ever arrived.
 */
export type AdvisorTransportCause =
  | { readonly kind: 'network' }
  | { readonly kind: 'http'; readonly status: number }
  | { readonly kind: 'no-body' }
  | { readonly kind: 'invalid-frame' }
  | { readonly kind: 'stream-ended' }

export class AdvisorStreamError extends Error {
  readonly transportCause: AdvisorTransportCause

  constructor(message: string, transportCause: AdvisorTransportCause) {
    super(message)
    this.name = 'AdvisorStreamError'
    this.transportCause = transportCause
  }
}
