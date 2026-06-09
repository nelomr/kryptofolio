export const MOCK_KPIS = {
  total_roi_percent: 72.62, // 30500 / 42000
  total_roi_fiat: 30500.00,
  invested_fiat: 42000.00, // Cost basis total
  delta_24h_fiat: 520.00,
  max_drawdown_percent: -15.40,
  max_drawdown_fiat: -11165.00,
  recovered_fiat: 72500.00, // Total Equity
  win_rate_percent: 100.00, // 1 winning trade (SOL) out of 1
  total_trades: 1, // Only 1 sell event
  winning_trades: 1,
  losing_trades: 0,
  average_r: 15.00,
  best_asset: {
    symbol: 'SOL',
    name: 'Solana',
    allocation_percent: 20.69,
    roi_percent: 650.00, // 13000 unrealized / 2000 cost basis
  },
  worst_asset: {
    symbol: 'ADA',
    name: 'Cardano',
    allocation_percent: 3.45,
    roi_percent: -50.00, // -2500 / 5000
  },
  portfolio_dispersion: 41.2,
};

export function generatePerformanceHistory(days: number) {
  const data = [];
  const now = Math.floor(Date.now() / 1000);

  const targetCost = 42000.00;
  const targetEquity = 72500.00;

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

export const MOCK_ASSET_ALLOCATION = {
  assets: [
    { symbol: 'BTC', name: 'Bitcoin', color: '#1e3a8a', allocation_pct: 41.38, value_fiat: 30000 },
    { symbol: 'ETH', name: 'Ethereum', color: '#00875a', allocation_pct: 34.48, value_fiat: 25000 },
    { symbol: 'SOL', name: 'Solana', color: '#b45309', allocation_pct: 20.69, value_fiat: 15000 },
    { symbol: 'ADA', name: 'Cardano', color: '#6b7280', allocation_pct: 3.45, value_fiat: 2500 }
  ],
  total_assets: 4,
  hhi: 3341
};
