/**
 * ICryptoPortfolioPort — Port for portfolio data access.
 *
 * This port isolates the application from the API gateway or database.
 * Use Cases interact ONLY with this port.
 *
 * It is implemented by:
 *  - RestCryptoAdapter (for production, via Hono RPC)
 *  - MockCryptoAdapter (for local testing/development)
 *
 * @see openspec/specs/hexagonal-architecture/spec.md
 */

import type {
  PortfolioSummaryEntity,
  CryptoAssetEntity,
  IngestionStatusEntity,
  TokenHistoryEntity,
} from '@/core/domain/models/PortfolioEntities'

export interface ICryptoPortfolioPort {
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
  getTokenHistory(symbol: string): Promise<TokenHistoryEntity>

  /**
   * Get the current background ingestion status (polling support).
   */
  getIngestionStatus(): Promise<IngestionStatusEntity>

  /**
   * Trigger a full portfolio rebuild/resync on the backend.
   */
  triggerRebuild(): Promise<void>
}
