/**
 * Mock Portfolio Fixture — Backend-agnostic data for UI development and tests.
 * This mock is mathematically correlated across holdings, lots, history, metrics, and tax.
 */

export interface PortfolioMetrics {
  total_equity_eur: number
  total_realized_pnl_eur: number
  total_unrealized_pnl_eur: number
}

export interface HoldingItem {
  id: string
  symbol: string
  amount: number
  avg_price_eur: number
  weighted_average_cost: number
  current_value_eur: number
  cost_basis_eur: number
  unrealized_pnl_eur: number
  pnl_eur: number
  portfolio_locations: string[]
}

export interface TaxLot {
  id: string
  symbol: string
  date: number
  exchange: string
  original_qty: number
  remaining_qty: number
  unit_cost: number
  total_cost: number
  status?: 'FULL' | 'PARTIAL' | 'EMPTY'
}

export interface LotHistoryEvent {
  id: string
  disposal_date: number
  amount_from_lot: number
  sale_price_eur: number
  gain_loss_eur: number
  is_taxable: boolean
  flag?: 'WALLET_ACTIVATION' | null
  notes?: string
}

export interface PortfolioData {
  summary: {
    metrics: PortfolioMetrics
    holdings: HoldingItem[]
  }
  lots: Record<string, TaxLot[]>
  history: Record<string, Record<string, LotHistoryEvent[]>>
}

const mockPortfolio = {
  summary: {
    metrics: {
      total_equity_eur: 72_500.00,
      total_realized_pnl_eur: 3_000.00,
      total_unrealized_pnl_eur: 30_500.00,
    },
    holdings: [
      {
        id: 'hold_btc_1',
        symbol: 'BTC',
        amount: 0.5,
        avg_price_eur: 40_000.00,
        weighted_average_cost: 40_000.00,
        current_value_eur: 30_000.00,
        cost_basis_eur: 20_000.00,
        unrealized_pnl_eur: 10_000.00,
        pnl_eur: 10_000.00,
        portfolio_locations: ['Kraken', 'Ledger'],
      },
      {
        id: 'hold_eth_1',
        symbol: 'ETH',
        amount: 10,
        avg_price_eur: 1_500.00,
        weighted_average_cost: 1_500.00,
        current_value_eur: 25_000.00,
        cost_basis_eur: 15_000.00,
        unrealized_pnl_eur: 10_000.00,
        pnl_eur: 10_000.00,
        portfolio_locations: ['Binance'],
      },
      {
        id: 'hold_sol_1',
        symbol: 'SOL',
        amount: 100,
        avg_price_eur: 20.00,
        weighted_average_cost: 20.00,
        current_value_eur: 15_000.00,
        cost_basis_eur: 2_000.00,
        unrealized_pnl_eur: 13_000.00,
        pnl_eur: 16_000.00, // 13k unrealized + 3k realized
        portfolio_locations: ['Phantom'],
      },
      {
        id: 'hold_ada_1',
        symbol: 'ADA',
        amount: 5000,
        avg_price_eur: 1.00,
        weighted_average_cost: 1.00,
        current_value_eur: 2_500.00,
        cost_basis_eur: 5_000.00,
        unrealized_pnl_eur: -2_500.00,
        pnl_eur: -2_500.00,
        portfolio_locations: ['Bit2Me'],
      },
    ],
  },
  lots: {
    BTC: [
      {
        id: 'lot_btc_1',
        symbol: 'BTC',
        date: 1_672_531_200, // 2023-01-01
        exchange: 'Kraken',
        original_qty: 0.5,
        remaining_qty: 0.5,
        unit_cost: 40_000.00,
        total_cost: 20_000.00,
        status: 'FULL',
      },
    ],
    ETH: [
      {
        id: 'lot_eth_1',
        symbol: 'ETH',
        date: 1_675_209_600, // 2023-02-01
        exchange: 'Binance',
        original_qty: 10,
        remaining_qty: 10,
        unit_cost: 1_500.00,
        total_cost: 15_000.00,
        status: 'FULL',
      },
    ],
    SOL: [
      {
        id: 'lot_sol_1',
        symbol: 'SOL',
        date: 1_688_169_600, // 2023-07-01
        exchange: 'Binance',
        original_qty: 200,
        remaining_qty: 100,
        unit_cost: 20.00,
        total_cost: 4_000.00,
        status: 'PARTIAL',
      },
    ],
    ADA: [
      {
        id: 'lot_ada_1',
        symbol: 'ADA',
        date: 1_693_526_400, // 2023-09-01
        exchange: 'Bit2Me',
        original_qty: 5000,
        remaining_qty: 5000,
        unit_cost: 1.00,
        total_cost: 5_000.00,
        status: 'FULL',
      },
    ],
  },
  history: {
    BTC: { lot_btc_1: [] },
    ETH: { lot_eth_1: [] },
    ADA: { lot_ada_1: [] },
    SOL: {
      lot_sol_1: [
        {
          id: 'event_sol_1_1',
          disposal_date: 1_702_339_200, // 2023-12-12
          amount_from_lot: 100,
          sale_price_eur: 50.00,
          gain_loss_eur: 3_000.00, // (50 - 20) * 100
          is_taxable: true,
          notes: 'Partial profit taking',
        },
      ],
    },
  },
} satisfies PortfolioData

export default mockPortfolio

export const mockFullyConsumedLot: TaxLot = {
  id: 'lot_old_consumed',
  symbol: 'BTC',
  date: 1_640_995_200,
  exchange: 'Kraken',
  original_qty: 0.25,
  remaining_qty: 0,
  unit_cost: 38_000.00,
  total_cost: 9_500.00,
}

export const mockNonTaxableEvent: LotHistoryEvent = {
  id: 'event_nontaxable_1',
  disposal_date: 1_677_628_800,
  amount_from_lot: 0.05,
  sale_price_eur: 22_000.00,
  gain_loss_eur: 0,
  is_taxable: false,
  flag: 'WALLET_ACTIVATION',
  notes: 'Transfer to cold wallet',
}
