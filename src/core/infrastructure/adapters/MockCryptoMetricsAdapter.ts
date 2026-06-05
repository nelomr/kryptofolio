import type { CryptoKpis, ICryptoMetricsRepository } from '@/core/domain/ports/ICryptoMetricsRepository'

export class MockCryptoMetricsAdapter implements ICryptoMetricsRepository {
  async getKpis(): Promise<CryptoKpis> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          totalRoiPercent: 145.20,
          totalRoiFiat: 84460.45,
          investedFiat: 58120.00,
          delta24hFiat: 312.84,
          maxDrawdownPercent: -22.40,
          maxDrawdownFiat: -17640.20,
          recoveredFiat: 102100.65,
          winRatePercent: 85.50,
          totalTrades: 48,
          winningTrades: 41,
          losingTrades: 7,
          averageR: 18.40,
          bestAsset: {
            symbol: 'SOL',
            name: 'Solana',
            allocationPercent: 20,
            roiPercent: 312.40,
          },
          worstAsset: {
            symbol: 'ADA',
            name: 'Cardano',
            allocationPercent: 10,
            roiPercent: -18.20,
          },
          portfolioDispersion: 41.2,
        })
      }, 500)
    })
  }
}
