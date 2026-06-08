export const MOCK_KPIS = {
  total_roi_percent: 145.20,
  total_roi_fiat: 84460.45,
  invested_fiat: 58120.00,
  delta_24h_fiat: 312.84,
  max_drawdown_percent: -22.40,
  max_drawdown_fiat: -17640.20,
  recovered_fiat: 102100.65,
  win_rate_percent: 85.50,
  total_trades: 48,
  winning_trades: 41,
  losing_trades: 7,
  average_r: 18.40,
  best_asset: {
    symbol: 'SOL',
    name: 'Solana',
    allocation_percent: 20,
    roi_percent: 312.40,
  },
  worst_asset: {
    symbol: 'ADA',
    name: 'Cardano',
    allocation_percent: 10,
    roi_percent: -18.20,
  },
  portfolio_dispersion: 41.2,
};

export function generatePerformanceHistory(days: number) {
  const data = [];
  const now = Math.floor(Date.now() / 1000);

  const targetCost = 58120.00;
  const targetEquity = 142580.45;

  let currentCost = targetCost;
  let currentValue = targetEquity;

  for (let i = 0; i <= days; i++) {
    const ts = now - (i * 86400);
    
    data.unshift({
      ts,
      value: currentValue,
      cost: currentCost
    });

    // Move backwards for the previous day
    currentCost -= (Math.random() - 0.4) * 200; 
    currentValue -= (Math.random() - 0.45) * 800;
  }

  const firstPoint = data[0];
  const lastPoint = data[data.length - 1];
  
  const return_fiat = lastPoint.value - firstPoint.value;
  const return_percent = (return_fiat / firstPoint.value) * 100;

  return {
    data,
    summary: {
      return_fiat,
      return_percent,
      volatility: 41.2,
      best_day: 12.4
    }
  };
}
