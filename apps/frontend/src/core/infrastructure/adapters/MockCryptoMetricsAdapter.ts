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

  async getPerformanceHistory(range: import('@/core/domain/ports/ICryptoMetricsRepository').TimeRange): Promise<{
    history: import('@/core/domain/ports/ICryptoMetricsRepository').PerformancePoint[];
    metrics: import('@/core/domain/ports/ICryptoMetricsRepository').PerformanceMetrics;
  }> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const history: import('@/core/domain/ports/ICryptoMetricsRepository').PerformancePoint[] = [];
        const now = Math.floor(Date.now() / 1000);
        let days = 30;
        
        switch(range) {
          case '1D': days = 1; break;
          case '1W': days = 7; break;
          case '1M': days = 30; break;
          case '1Y': days = 365; break;
          case 'ALL': days = 730; break;
        }

        const targetCost = 58120.00;
        const targetEquity = 142580.45;

        let currentCost = targetCost;
        let currentValue = targetEquity;

        for (let i = 0; i <= days; i++) {
          const timestamp = now - (i * 86400);
          
          history.unshift({
            timestamp,
            valueFiat: currentValue,
            costBasisFiat: currentCost
          });

          // Move backwards for the previous day
          currentCost -= (Math.random() - 0.4) * 200; 
          currentValue -= (Math.random() - 0.45) * 800;
        }

        const firstPoint = history[0];
        const lastPoint = history[history.length - 1];
        
        const returnFiat = lastPoint.valueFiat - firstPoint.valueFiat;
        const returnPercent = (returnFiat / firstPoint.valueFiat) * 100;

        resolve({
          history,
          metrics: {
            returnFiat,
            returnPercent,
            volatilityPercent: 41.2,
            bestDayPercent: 12.4
          }
        });
      }, 500);
    });
  }
}
