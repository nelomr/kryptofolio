import type { AdvisorStreamEvent, ExecutionProfiles, ModelChain } from '@kryptofolio/shared-types'
import type { AdvisorAskRequest, AdvisorConfig } from '@/core/domain/models/AdvisorEntities'

/**
 * IAdvisorPort — Frontend Domain Port for the AI portfolio advisor.
 *
 * The streaming `ask` lives in the domain port for the same reason `IMarketDataPort` declares its
 * stream there: the adapter owns the connection, the UI only consumes events. Unlike the market
 * stream it takes an `AbortSignal`, because the caller (not the adapter) decides when a run stops.
 */
export interface IAdvisorPort {
  /**
   * Streams one run. The iteration ends when the connection closes; a run that completed normally
   * ends with exactly one `done | refused | failed` event, so an iteration that finishes without
   * one means the transport dropped.
   */
  ask(request: AdvisorAskRequest, signal: AbortSignal): AsyncIterable<AdvisorStreamEvent>

  getConfig(): Promise<AdvisorConfig>
  setModelChain(chain: ModelChain): Promise<void>
  getExecutionProfiles(): Promise<ExecutionProfiles>
  setExecutionProfiles(profiles: ExecutionProfiles): Promise<ExecutionProfiles>
}
