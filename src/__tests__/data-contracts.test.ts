/**
 * Tests for data-contracts-agnostic-mocks change
 *
 * Spec coverage:
 *   - portfolio-types: structural type assertions
 *   - portfolio-mock-data: shape, depth, edge cases, store injection
 *
 * @see openspec/specs/
 */

import { describe, it, expect } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineStore } from 'pinia'

import mockPortfolio, {
  mockFullyConsumedLot,
  mockNonTaxableEvent,
} from '../data/mockPortfolio'

import type { PortfolioData } from '../types/portfolio'

// ---------------------------------------------------------------------------
// Task 4.1 — mockPortfolio satisfies PortfolioData at all 3 levels
// ---------------------------------------------------------------------------

describe('mockPortfolio — structure (PortfolioData shape)', () => {
  it('satisfies the PortfolioData root type (compile-time + runtime)', () => {
    // The `satisfies PortfolioData` in the source file already enforces this
    // at compile time. Here we verify the runtime shape matches.
    const data: PortfolioData = mockPortfolio

    // Level 1 — metrics
    expect(typeof data.summary.metrics.total_equity_eur).toBe('number')
    expect(typeof data.summary.metrics.total_realized_pnl_eur).toBe('number')
    expect(typeof data.summary.metrics.total_unrealized_pnl_eur).toBe('number')

    // Level 1 — holdings array
    expect(Array.isArray(data.summary.holdings)).toBe(true)

    // Level 2 — lots keyed by symbol
    expect(typeof data.lots).toBe('object')
    expect(Array.isArray(data.lots['BTC'])).toBe(true)

    // Level 3 — history keyed by symbol → lot ID
    expect(typeof data.history).toBe('object')
    expect(typeof data.history['BTC']).toBe('object')
    const btcLot1 = data.history['BTC']['lot_btc_1']
    expect(btcLot1).toBeDefined()
    expect(['FULL', 'PARTIAL', 'EMPTY']).toContain(btcLot1.status)
    expect(Array.isArray(btcLot1.history)).toBe(true)
  })

  it('has non-zero metric values', () => {
    const { metrics } = mockPortfolio.summary
    expect(metrics.total_equity_eur).toBeGreaterThan(0)
    expect(metrics.total_realized_pnl_eur).toBeGreaterThan(0)
    expect(metrics.total_unrealized_pnl_eur).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Task 4.2 — mockFullyConsumedLot edge case
// ---------------------------------------------------------------------------

describe('mockFullyConsumedLot', () => {
  it('has remaining_qty === 0', () => {
    expect(mockFullyConsumedLot.remaining_qty).toBe(0)
  })

  it('has original_qty > 0', () => {
    expect(mockFullyConsumedLot.original_qty).toBeGreaterThan(0)
  })

  it('has all required TaxLot fields', () => {
    expect(typeof mockFullyConsumedLot.id).toBe('string')
    expect(typeof mockFullyConsumedLot.symbol).toBe('string')
    expect(typeof mockFullyConsumedLot.date).toBe('number')
    expect(typeof mockFullyConsumedLot.exchange).toBe('string')
    expect(typeof mockFullyConsumedLot.unit_cost).toBe('number')
    expect(typeof mockFullyConsumedLot.total_cost).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// Task 4.3 — mockNonTaxableEvent edge case
// ---------------------------------------------------------------------------

describe('mockNonTaxableEvent', () => {
  it('has is_taxable === false', () => {
    expect(mockNonTaxableEvent.is_taxable).toBe(false)
  })

  it('has all required LotHistoryEvent fields', () => {
    expect(typeof mockNonTaxableEvent.id).toBe('string')
    expect(typeof mockNonTaxableEvent.disposal_date).toBe('number')
    expect(typeof mockNonTaxableEvent.amount_from_lot).toBe('number')
    expect(typeof mockNonTaxableEvent.sale_price_eur).toBe('number')
    expect(typeof mockNonTaxableEvent.gain_loss_eur).toBe('number')
  })

  it('has a valid optional flag value', () => {
    const validFlags = ['WALLET_ACTIVATION', null, undefined]
    expect(validFlags).toContain(mockNonTaxableEvent.flag)
  })
})

// ---------------------------------------------------------------------------
// Task 4.4 — holdings array depth and portfolio_locations
// ---------------------------------------------------------------------------

describe('mockPortfolio.summary.holdings', () => {
  it('has at least 2 entries', () => {
    expect(mockPortfolio.summary.holdings.length).toBeGreaterThanOrEqual(2)
  })

  it('each entry has portfolio_locations with at least one location', () => {
    for (const holding of mockPortfolio.summary.holdings) {
      expect(Array.isArray(holding.portfolio_locations)).toBe(true)
      expect(holding.portfolio_locations.length).toBeGreaterThan(0)
    }
  })

  it('each entry has all required HoldingItem numeric fields', () => {
    for (const h of mockPortfolio.summary.holdings) {
      expect(typeof h.symbol).toBe('string')
      expect(typeof h.amount).toBe('number')
      expect(typeof h.avg_price_eur).toBe('number')
      expect(typeof h.weighted_average_cost).toBe('number')
      expect(typeof h.current_value_eur).toBe('number')
      expect(typeof h.cost_basis_eur).toBe('number')
      expect(typeof h.unrealized_pnl_eur).toBe('number')
      expect(typeof h.pnl_eur).toBe('number')
    }
  })
})

// ---------------------------------------------------------------------------
// Task 4.5 — Pinia store initialized with mockPortfolio
// ---------------------------------------------------------------------------

describe('Pinia store initialized with mockPortfolio', () => {
  it('exposes all PortfolioMetrics fields without runtime error', () => {
    setActivePinia(createPinia())

    const usePortfolioStore = defineStore('portfolio', {
      state: (): PortfolioData => ({
        summary: mockPortfolio.summary,
        lots: mockPortfolio.lots,
        history: mockPortfolio.history,
      }),
      getters: {
        equity: (state) => state.summary.metrics.total_equity_eur,
        realizedPnl: (state) => state.summary.metrics.total_realized_pnl_eur,
        unrealizedPnl: (state) => state.summary.metrics.total_unrealized_pnl_eur,
      },
    })

    const store = usePortfolioStore()

    expect(store.equity).toBe(mockPortfolio.summary.metrics.total_equity_eur)
    expect(store.realizedPnl).toBe(mockPortfolio.summary.metrics.total_realized_pnl_eur)
    expect(store.unrealizedPnl).toBe(mockPortfolio.summary.metrics.total_unrealized_pnl_eur)
  })

  it('allows accessing holdings from store state', () => {
    setActivePinia(createPinia())

    const usePortfolioStore = defineStore('portfolio-holdings', {
      state: (): PortfolioData => ({
        summary: mockPortfolio.summary,
        lots: mockPortfolio.lots,
        history: mockPortfolio.history,
      }),
    })

    const store = usePortfolioStore()
    expect(store.summary.holdings.length).toBeGreaterThanOrEqual(2)
    expect(store.lots['BTC'].length).toBeGreaterThan(0)
  })
})
