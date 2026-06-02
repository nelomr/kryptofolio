/**
 * Mock Portfolio Fixture — Backend-agnostic data for UI development and tests.
 *
 * Covers the full 3-level hierarchy:
 *   Level 1 → PortfolioMetrics + HoldingItem[]
 *   Level 2 → TaxLot[] per symbol
 *   Level 3 → LotHistoryEvent[] per lot
 *
 * The `satisfies PortfolioData` annotation ensures compile-time type safety:
 * any structural mismatch between this mock and the interfaces causes a build error.
 *
 * @see openspec/specs/portfolio-mock-data/spec.md
 */

import type {
  PortfolioData,
  TaxLot,
  LotHistoryEvent,
} from '../types/portfolio'

// ---------------------------------------------------------------------------
// Root mock — injectable directly into a Pinia store's state
// ---------------------------------------------------------------------------

const mockPortfolio = {
  summary: {
    metrics: {
      total_equity_eur: 45_231.89,
      total_realized_pnl_eur: 12_234.50,
      total_unrealized_pnl_eur: 5_340.20,
    },
    holdings: [
      {
        symbol: 'BTC',
        amount: 0.5432,
        avg_price_eur: 35_000.00,
        weighted_average_cost: 34_500.00,
        current_value_eur: 31_505.60,
        cost_basis_eur: 19_012.00,
        unrealized_pnl_eur: 12_493.60,
        pnl_eur: 12_493.60,
        portfolio_locations: ['Ledger', 'Kraken', 'Bit2Me'],
      },
      {
        symbol: 'ETH',
        amount: 4.5,
        avg_price_eur: 1_800.00,
        weighted_average_cost: 1_750.00,
        current_value_eur: 10_350.00,
        cost_basis_eur: 8_100.00,
        unrealized_pnl_eur: 2_250.00,
        pnl_eur: 2_250.00,
        portfolio_locations: ['Metamask', 'Binance'],
      },
    ],
  },

  // Level 2 — FIFO tax lots keyed by symbol
  lots: {
    BTC: [
      {
        id: 'lot_btc_1',
        symbol: 'BTC',
        date: 1_672_531_200, // 2023-01-01
        exchange: 'Kraken',
        original_qty: 0.5,
        remaining_qty: 0.3,
        unit_cost: 20_000.00,
        total_cost: 10_000.00,
      },
      {
        id: 'lot_btc_2',
        symbol: 'BTC',
        date: 1_688_169_600, // 2023-07-01
        exchange: 'Bit2Me',
        original_qty: 0.0432,
        remaining_qty: 0.0432,
        unit_cost: 26_500.00,
        total_cost: 1_144.80,
      },
    ],
    ETH: [
      {
        id: 'lot_eth_1',
        symbol: 'ETH',
        date: 1_675_209_600, // 2023-02-01
        exchange: 'Binance',
        original_qty: 4.5,
        remaining_qty: 4.5,
        unit_cost: 1_800.00,
        total_cost: 8_100.00,
      },
    ],
    SOL: [
      {
        id: 'lot_sol_1',
        symbol: 'SOL',
        date: 1_693_526_400, // 2023-09-01
        exchange: 'Phantom',
        original_qty: 100,
        remaining_qty: 50,
        unit_cost: 60.00,
        total_cost: 3_000.00,
      },
    ],
  },

  // Level 3 — lot history keyed by symbol → lot ID
  history: {
    BTC: {
      lot_btc_1: {
        status: 'PARTIAL' as const,
        history: [
          {
            id: 'event_btc_1_1',
            disposal_date: 1_680_307_200, // 2023-04-01
            amount_from_lot: 0.2,
            sale_price_eur: 30_000.00,
            gain_loss_eur: 2_000.00,
            is_taxable: true,
            notes: 'Partial sale',
          },
        ],
      },
      lot_btc_2: {
        status: 'EMPTY' as const,
        history: [],
      },
    },
    ETH: {
      lot_eth_1: {
        status: 'EMPTY' as const,
        history: [],
      },
    },
    SOL: {
      lot_sol_1: {
        status: 'PARTIAL' as const,
        history: [
          {
            id: 'event_sol_1_1',
            disposal_date: 1_702_339_200, // 2023-12-12
            amount_from_lot: 50,
            sale_price_eur: 110.00,
            gain_loss_eur: 2_500.00,
            is_taxable: true,
            notes: 'Partial profit taking',
          },
        ],
      },
    },
  },
} satisfies PortfolioData

export default mockPortfolio

// ---------------------------------------------------------------------------
// Edge-case named exports (for targeted unit tests)
// ---------------------------------------------------------------------------

/** A fully-consumed FIFO lot — remaining_qty === 0, original_qty > 0 */
export const mockFullyConsumedLot: TaxLot = {
  id: 'lot_btc_consumed',
  symbol: 'BTC',
  date: 1_640_995_200, // 2022-01-01
  exchange: 'Kraken',
  original_qty: 0.25,
  remaining_qty: 0,
  unit_cost: 38_000.00,
  total_cost: 9_500.00,
}

/** A non-taxable disposal event (e.g. internal wallet transfer) */
export const mockNonTaxableEvent: LotHistoryEvent = {
  id: 'event_nontaxable_1',
  disposal_date: 1_677_628_800, // 2023-03-01
  amount_from_lot: 0.05,
  sale_price_eur: 22_000.00,
  gain_loss_eur: 0,
  is_taxable: false,
  flag: 'WALLET_ACTIVATION',
  notes: 'Transfer to cold wallet — not a taxable swap',
}
