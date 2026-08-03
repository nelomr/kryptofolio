/**
 * Mock Portfolio Fixture — Backend-agnostic data for UI development and tests.
 * This mock is mathematically correlated across holdings, lots, history, metrics, and tax.
 */

import type { TaxLotType, TaxLotEventType } from '@kryptofolio/shared-types';

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

// We use the exact types from shared-types to ensure correlation
export type TaxLot = TaxLotType;
export type LotHistoryEvent = TaxLotEventType;

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
        asset_id: 'BTC',
        acquisition_timestamp: "2023-01-01T00:00:00.000Z",
        account_id: '10000000-0000-0000-0000-000000000002',
        spot_transaction_id: 'tx_src_btc_1',
        exchange_location: 'Kraken',
        original_qty: "0.5",
        remaining_qty: "0.5",
        unit_cost_fiat: "40000.00",
        total_cost_fiat: "20000.00",
        fiat_currency: "EUR",
        status: 'CLOSED',
      },
    ],
    ETH: [
      {
        id: 'lot_eth_1',
        asset_id: 'ETH',
        acquisition_timestamp: "2023-02-01T00:00:00.000Z",
        account_id: '10000000-0000-0000-0000-000000000001',
        spot_transaction_id: 'tx_src_eth_1',
        exchange_location: 'Binance',
        original_qty: "10",
        remaining_qty: "10",
        unit_cost_fiat: "1500.00",
        total_cost_fiat: "15000.00",
        fiat_currency: "EUR",
        status: 'CLOSED',
      },
    ],
    SOL: [
      {
        id: 'lot_sol_1',
        asset_id: 'SOL',
        acquisition_timestamp: "2023-07-01T00:00:00.000Z",
        account_id: '10000000-0000-0000-0000-000000000001',
        spot_transaction_id: 'tx_src_sol_1',
        exchange_location: 'Binance',
        original_qty: "200",
        remaining_qty: "100",
        unit_cost_fiat: "20.00",
        total_cost_fiat: "4000.00",
        fiat_currency: "EUR",
        status: 'PARTIAL',
      },
    ],
    ADA: [
      {
        id: 'lot_ada_1',
        asset_id: 'ADA',
        acquisition_timestamp: "2023-09-01T00:00:00.000Z",
        account_id: '10000000-0000-0000-0000-000000000003',
        spot_transaction_id: 'tx_src_ada_1',
        exchange_location: 'Bit2Me',
        original_qty: "5000",
        remaining_qty: "5000",
        unit_cost_fiat: "1.00",
        total_cost_fiat: "5000.00",
        fiat_currency: "EUR",
        status: 'CLOSED',
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
          tax_lot_id: 'lot_sol_1',
          spot_transaction_id: 'tx_dummy_sol_1',
          account_id: '10000000-0000-0000-0000-000000000001',
          disposal_date: "2023-12-12T00:00:00.000Z",
          amount_from_lot: "100",
          sale_price_fiat: "50.00",
          gain_loss_fiat: "3000.00", // (50 - 20) * 100
          is_taxable: true,
          disposal_type: 'SELL',
          fiat_currency: 'EUR',
        },
      ],
    },
  },
} satisfies PortfolioData

export default mockPortfolio

export const mockFullyConsumedLot: TaxLot = {
  id: 'lot_old_consumed',
  asset_id: 'BTC',
  acquisition_timestamp: "2021-12-31T00:00:00.000Z",
  account_id: '10000000-0000-0000-0000-000000000002',
  spot_transaction_id: 'tx_src_old_btc',
  exchange_location: 'Kraken',
  original_qty: "0.25",
  remaining_qty: "0",
  unit_cost_fiat: "38000.00",
  total_cost_fiat: "9500.00",
  fiat_currency: "EUR",
  status: 'CLOSED',
}

export const mockNonTaxableEvent: LotHistoryEvent = {
  id: 'event_nontaxable_1',
  tax_lot_id: 'lot_btc_1',
  spot_transaction_id: 'tx_dummy_btc_1',
  account_id: '10000000-0000-0000-0000-000000000002',
  disposal_date: "2023-03-01T00:00:00.000Z",
  amount_from_lot: "0.05",
  sale_price_fiat: "22000.00",
  gain_loss_fiat: "0",
  is_taxable: false,
  disposal_type: 'FEE',
  fiat_currency: 'EUR',
}
