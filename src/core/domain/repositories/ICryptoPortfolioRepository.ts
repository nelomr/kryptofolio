/**
 * ICryptoPortfolioRepository — Port for portfolio data access.
 *
 * Defines the contract for fetching portfolio data. Any adapter that provides
 * portfolio data (REST API, Mock, LocalStorage) MUST implement this interface.
 * Pinia stores depend only on this abstraction — never on concrete adapters.
 *
 * @see openspec/specs/hexagonal-architecture/spec.md
 */

import type {
  PortfolioSummaryEntity,
  CryptoAssetEntity,
  IngestionStatusEntity,
} from '@/core/domain/models/PortfolioEntities'

export interface ICryptoPortfolioRepository {
  /**
   * Fetch the full portfolio summary including metrics and all holdings.
   */
  getSummary(): Promise<PortfolioSummaryEntity>

  /**
   * Fetch detailed FIFO lot information for a specific asset.
   * @param symbol - The asset ticker (e.g. "BTC")
   */
  getTokenDetails(symbol: string): Promise<CryptoAssetEntity>

  /**
   * Fetch the lot history events for a specific asset.
   * @param symbol - The asset ticker
   */
  getTokenHistory(symbol: string): Promise<Record<string, any>>

  /**
   * Get the current background ingestion status (polling support).
   */
  getIngestionStatus(): Promise<IngestionStatusEntity>

  /**
   * Trigger a full portfolio rebuild/resync on the backend.
   */
  triggerRebuild(): Promise<void>
}
