export const MOCK_KPIS = {
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
};

export function generatePerformanceHistory(days: number) {
  const history = [];
  const now = Math.floor(Date.now() / 1000);

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

  return {
    history,
    metrics: {
      returnFiat,
      returnPercent,
      volatilityPercent: 41.2,
      bestDayPercent: 12.4
    }
  };
}
