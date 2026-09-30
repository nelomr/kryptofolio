import type {
  PortfolioHoldingDto,
  PortfolioSummaryMetricsDto,
  PortfolioSummaryResponse,
} from '../../../../../application/use-cases/GetPortfolioSummaryUseCase.js';

/**
 * A worst-case 40-holding portfolio, measured from this project's own real ledger rather than
 * assumed: the 17 symbols are the exact distinct `asset_id`s in that ledger (`kryptofolio_ledger.db`,
 * `v_active_tax_lots`, read-only against a scratch copy, never the live file), ordered by their real
 * remaining-lot count descending (`B2M` 474 lots down to `PUMP` 1). The real ledger holds only 17
 * distinct assets today — nowhere near the 40 tasks.md asks for — so the remaining 23 entries are
 * clearly-labeled synthetic filler (`SYNTH01`..`SYNTH23`), never disguised as real symbols, added only
 * to exercise the top-15/omittedCount arithmetic at the scale the task specifies. This is a documented
 * deviation from "derived from the real ledger": the *symbols and their relative weighting* are real,
 * the *count* is padded. Flagged in `resume-apply.md` for a human to confirm this is an acceptable
 * reading of the task.
 */
const REAL_SYMBOLS = [
  'B2M',
  'GIGA',
  'HBAR',
  'XRP',
  'ADA',
  'VELO',
  'USDC',
  'USDT',
  'XLM',
  'JASMY',
  'AI16Z',
  'ETH',
  'SOL',
  'PLUME',
  'BNB',
  'BTC',
  'PUMP',
] as const;

const SYNTHETIC_SYMBOLS = Array.from({ length: 23 }, (_, i) => `SYNTH${String(i + 1).padStart(2, '0')}`);

const ALL_SYMBOLS = [...REAL_SYMBOLS, ...SYNTHETIC_SYMBOLS];

function holdingAt(index: number, symbol: string): PortfolioHoldingDto {
  // Descending value by construction index, so the ranking is verifiable independent of any
  // comparison operator this test file itself performs.
  const halves = (40 - index) * 275;
  const value = `${Math.floor(halves / 2)}.${halves % 2 === 0 ? '00' : '50'}`;
  return {
    id: `asset-${symbol.toLowerCase()}`,
    symbol,
    amount: (index + 1).toString(),
    avg_price_fiat: '1.00',
    cost_basis_fiat: value,
    cost_basis: { kind: 'NATIVE', amount: value, currency: 'USD' },
    live_price: '1.00',
    current_value_fiat: value,
    unrealized_pnl_fiat: '0.00',
    currency: 'USD',
    portfolio_locations: ['kraken'],
  };
}

export function buildFortyHoldingFixture(): PortfolioSummaryResponse {
  const holdings = ALL_SYMBOLS.map((symbol, index) => holdingAt(index, symbol));

  const metrics: PortfolioSummaryMetricsDto = {
    rates_incomplete: false,
    prices_incomplete: false,
    total_equity_fiat: '10000.00',
    total_cost_basis_fiat: '9000.00',
    total_realized_pnl_fiat: '500.00',
    total_unrealized_pnl_fiat: '500.00',
    total_pnl_fiat: '1000.00',
    currency: 'USD',
  };

  return { metrics, holdings };
}

/**
 * The same 40-holding shape, but 6 holdings (indices 34-39, the smallest-valued of the synthetic
 * filler) are unvalued: 3 have no `current_value_fiat` at all, 3 carry an `UNCONVERTIBLE` cost basis
 * — the two distinct "no resolved value" causes, both routed to `unvalued`, never to `0`.
 */
export function buildFortyHoldingFixtureWithUnvalued(): PortfolioSummaryResponse {
  const base = buildFortyHoldingFixture();
  const holdings = base.holdings.map((h, index) => {
    if (index === 34 || index === 35 || index === 36) {
      const { current_value_fiat, unrealized_pnl_fiat, live_price, ...rest } = h;
      return rest;
    }
    if (index === 37 || index === 38 || index === 39) {
      const { current_value_fiat, unrealized_pnl_fiat, ...rest } = h;
      return {
        ...rest,
        cost_basis: {
          kind: 'UNCONVERTIBLE' as const,
          nativeAmount: h.cost_basis_fiat,
          nativeCurrency: 'USD',
          requested: 'EUR' as const,
        },
      };
    }
    return h;
  });

  return {
    metrics: { ...base.metrics, rates_incomplete: true, prices_incomplete: true },
    holdings,
  };
}
