import { describe, it, expect } from 'vitest';
import { STABLECOIN_SYMBOLS, isStablecoinSymbol } from '../../src/stablecoins';
import { METRIC_IDS, metricIdSchema } from '../../src/advisor-metrics';

describe('STABLECOIN_SYMBOLS', () => {
  it('is the closed list the concentration tool classifies against', () => {
    expect([...STABLECOIN_SYMBOLS]).toEqual(['USDT', 'USDC', 'DAI', 'EURC', 'FDUSD', 'PYUSD', 'TUSD', 'USDE']);
  });

  it('treats a listed symbol as a stablecoin and an unlisted one as not', () => {
    expect(isStablecoinSymbol('USDC')).toBe(true);
    expect(isStablecoinSymbol('BTC')).toBe(false);
    expect(isStablecoinSymbol('usdc')).toBe(false);
  });
});

describe('METRIC_IDS', () => {
  it('is the closed vocabulary explain_metric accepts', () => {
    expect([...METRIC_IDS]).toEqual([
      'equity',
      'cost_basis',
      'realized_pnl',
      'unrealized_pnl',
      'max_drawdown',
      'annualised_volatility',
      'sharpe',
      'alpha',
      'beta',
      'hhi',
      'top_n_weight',
      'breakeven_price',
      'rates_incomplete',
      'prices_incomplete',
      'unvalued',
      'irpf_savings_base',
      'net_patrimonial_result',
    ]);
  });

  it('rejects a value outside the vocabulary', () => {
    expect(metricIdSchema.safeParse('hhi').success).toBe(true);
    expect(metricIdSchema.safeParse('market_cap').success).toBe(false);
  });
});
