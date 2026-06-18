import { DateTime } from 'luxon';

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

interface MockPerformancePoint {
  ts: number;
  value: number;
  cost: number;
}

function createMasterPerformanceHistory(): MockPerformancePoint[] {
  const data: MockPerformancePoint[] = [];
  const now = DateTime.now().toUTC();
  const maxDays = 3650; // 10 years maximum

  const targetCost = 42000.00;
  const targetEquity = 72500.00;

  let currentCost = targetCost;
  let currentValue = targetEquity;

  for (let i = 0; i <= maxDays; i++) {
    const dt = now.minus({ days: i });
    const ts = Math.floor(dt.toSeconds());

    data.unshift({
      ts,
      value: Number(currentValue.toFixed(2)),
      cost: Number(currentCost.toFixed(2))
    });

    // Move backwards for the previous day
    currentCost -= (Math.random() - 0.4) * 200; 
    currentValue -= (Math.random() - 0.45) * 800;

    // Guard against negative/zero value/cost
    if (currentValue < 1000) currentValue = 1000 + Math.random() * 500;
    if (currentCost < 1000) currentCost = 1000 + Math.random() * 500;
  }

  return data;
}

const MASTER_PERFORMANCE_HISTORY = createMasterPerformanceHistory();

export function generatePerformanceHistory(days: number) {
  const count = Math.min(days, 3650);
  const data = MASTER_PERFORMANCE_HISTORY.slice(MASTER_PERFORMANCE_HISTORY.length - (count + 1));

  const firstPoint = data[0];
  const lastPoint = data[data.length - 1];

  const return_fiat = Number((lastPoint.value - firstPoint.value).toFixed(2));
  const return_percent = firstPoint.value > 0 
    ? Number(((return_fiat / firstPoint.value) * 100).toFixed(2))
    : 0;

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

export function generateDrawdownCurve(days: number) {
  const count = Math.min(days, 3650);
  const data = MASTER_PERFORMANCE_HISTORY.slice(MASTER_PERFORMANCE_HISTORY.length - (count + 1));

  let runningPeak = -Infinity;
  const drawdownPoints = [];

  for (const point of data) {
    if (point.value > runningPeak) {
      runningPeak = point.value;
    }

    const drawdownPercent = runningPeak > 0
      ? ((point.value - runningPeak) / runningPeak) * 100
      : 0;

    drawdownPoints.push({
      ts: point.ts,
      drawdown_percent: Number(drawdownPercent.toFixed(2))
    });
  }

  return drawdownPoints;
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

export function generateVolatilityHeatmap(year: number) {
  const data = [];
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // Parameters correlated with MOCK_KPIS
  const maxDrawdown = -15.40;
  const bestDay = 12.4;
  const dailyAverageExpectancy = 0.2; // Bullish bias to reach 72% ROI

  for (let month = 0; month < 12; month++) {
    for (let day = 1; day <= daysInMonth[month]; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      // Base noise with slight bullish bias
      let pct = dailyAverageExpectancy + (Math.random() - 0.45) * 5;
      
      // Simulate market cycles (clustering volatility)
      const cycle = Math.sin((day + month * 30) / 14) * 3;
      pct += cycle;

      // Simulate outlier days (fat tails)
      if (Math.random() > 0.95) pct += (Math.random() * 6);
      if (Math.random() < 0.05) pct -= (Math.random() * 8);

      // Clamp to the defined KPI extremes
      if (pct > bestDay) pct = bestDay;
      if (pct < maxDrawdown) pct = maxDrawdown;

      // Force the exact best day once to guarantee stats correlation
      if (month === 10 && day === 12) pct = bestDay;
      
      data.push({ date: dateStr, pct: Number(pct.toFixed(2)) });
    }
  }
  return data;
}

export const MOCK_RISK_METRICS = {
  sharpe_ratio: 2.18,
  sortino_ratio: 2.62,
  beta_vs_btc: 0.87,
  alpha_pct: 4.2,
  calmar_ratio: 3.41,
  history: [1.5, 1.8, 2.0, 2.18]
};
