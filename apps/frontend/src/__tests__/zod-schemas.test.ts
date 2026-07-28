/**
 * Unit Tests — Zod DTO Schemas
 *
 * Spec coverage:
 *   - zod-validation: safeParse, preprocess, numeric strings, timestamp parsing
 *   - fiscal-domain: ExternalTaxTransactionSchema BUY/SELL/etc mapping
 *   - global-error-handling: safeParse failure paths
 *
 * @see openspec/specs/zod-validation/spec.md
 * @see openspec/specs/fiscal-domain/spec.md
 */

import { describe, it, expect } from 'vitest';
import {
  ExternalAssetSchema,
  ExternalPortfolioSummarySchema,
} from '@/core/infrastructure/dtos/ExternalPortfolioSchemas';
import {
  ExternalTaxTransactionSchema,
  ExternalTaxReportSchema,
} from '@/core/infrastructure/dtos/ExternalTaxSchemas';

// ---------------------------------------------------------------------------
// ExternalAssetSchema — portfolio holdings
// ---------------------------------------------------------------------------

describe('ExternalAssetSchema', () => {
  it('parses a well-formed external holding object', () => {
    const raw = {
      id: 'asset-001',
      symbol: 'BTC',
      amount: 0.5,
      avg_price_fiat: 62000,
      current_value_fiat: 31000,
      cost_basis_fiat: 30000,
      unrealized_pnl_fiat: 1000,
      pnl_fiat: 1000,
      currency: 'USD',
      portfolio_locations: ['Ledger'],
    };
    const result = ExternalAssetSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.symbol).toBe('BTC');
      expect(typeof result.data.amount).toBe('number');
    }
  });

  it('coerces string numbers to numbers (numeric string sanitization)', () => {
    const raw = {
      id: 'asset-001',
      symbol: 'ETH',
      amount: '1.5',
      avg_price_eur: '3200.00',
      current_value_eur: '4800',
      cost_basis_eur: '4500',
      unrealized_pnl_eur: '300',
      pnl_eur: '300',
      portfolio_locations: ['Phantom'],
    };
    const result = ExternalAssetSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe(1.5);
      expect(result.data.avgPriceFiat).toBe(3200);
    }
  });

  it('maps weighted_average_cost alias to avgPriceFiat', () => {
    const raw = {
      id: 'asset-001',
      symbol: 'SOL',
      amount: 10,
      weighted_average_cost: '150.5', // legacy alias
      current_value_fiat: 1600,
      cost_basis_fiat: 1505,
      unrealized_pnl_fiat: 95,
      pnl_fiat: 95,
      portfolio_locations: ['Phantom'],
    };
    const result = ExternalAssetSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.avgPriceFiat).toBe(150.5);
    }
  });

  it('fails gracefully on missing required symbol (safeParse does not throw)', () => {
    const result = ExternalAssetSchema.safeParse({ id: 'x', amount: 1 });
    expect(result.success).toBe(false);
    expect(() => ExternalAssetSchema.safeParse({ id: 'x' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// ExternalPortfolioSummarySchema
// ---------------------------------------------------------------------------

describe('ExternalPortfolioSummarySchema', () => {
  it('parses a complete summary response', () => {
    const raw = {
      metrics: {
        total_equity_fiat: '150000',
        total_cost_basis_fiat: '120000',
        total_realized_pnl_fiat: '5000',
        total_unrealized_pnl_fiat: '25000',
        total_pnl_fiat: '30000',
        currency: 'USD',
      },
      holdings: [
        {
          id: 'asset-001',
          symbol: 'BTC',
          amount: 1.0,
          avg_price_fiat: 50000,
          current_value_fiat: 62000,
          cost_basis_fiat: 50000,
          unrealized_pnl_fiat: 12000,
          pnl_fiat: 12000,
          currency: 'USD',
          portfolio_locations: ['Ledger'],
        },
      ],
    };
    const result = ExternalPortfolioSummarySchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metrics.totalEquityFiat).toBe(150000);
      expect(result.data.holdings).toHaveLength(1);
      expect(result.data.holdings[0].symbol).toBe('BTC');
    }
  });

  it('fails gracefully if metrics are missing', () => {
    const result = ExternalPortfolioSummarySchema.safeParse({ holdings: [] });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ExternalTaxTransactionSchema — the "BUY/SELL magic" test
// ---------------------------------------------------------------------------

describe('ExternalTaxTransactionSchema — type-based symbol/amount resolution', () => {
  it('correctly resolves a BUY transaction (asset_in is the crypto)', () => {
    const raw = {
      id: 'tx-001',
      tx_type: 'BUY',
      asset_in_id: 'BTC',
      asset_out_id: 'EUR',
      amount_in: '0.5',
      amount_out: '31000',
      price_eur: '62000',
      fee_eur: '5',
      timestamp: '2024-01-15 12:30:00',
    };
    const result = ExternalTaxTransactionSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('BUY');
      expect(result.data.symbol).toBe('BTC');
      expect(result.data.amount).toBe(0.5);
      expect(result.data.totalEur).toBe(31000);
      expect(result.data.feeEur).toBe(5);
      expect(result.data.timestamp).toBeInstanceOf(Date);
    }
  });

  it('correctly resolves a SELL transaction (asset_out is the crypto)', () => {
    const raw = {
      id: 'tx-002',
      tx_type: 'SELL',
      asset_in_id: 'EUR',
      asset_out_id: 'BTC',
      amount_in: '31000',
      amount_out: '0.5',
      price_eur: '62000',
      fee_eur: '5',
      timestamp: '2024-06-01 09:00:00',
    };
    const result = ExternalTaxTransactionSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('SELL');
      expect(result.data.symbol).toBe('BTC');
      expect(result.data.amount).toBe(0.5);
      expect(result.data.totalEur).toBe(31000); // EUR received (proceeds)
    }
  });

  it('correctly resolves a DEPOSIT transaction', () => {
    const raw = {
      id: 'tx-003',
      tx_type: 'DEPOSIT',
      asset_in_id: 'ETH',
      amount_in: '2.0',
      fee_eur: '0',
      timestamp: '2024-03-10 10:00:00',
    };
    const result = ExternalTaxTransactionSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('DEPOSIT');
      expect(result.data.symbol).toBe('ETH');
      expect(result.data.amount).toBe(2.0);
      expect(result.data.totalEur).toBe(0);
    }
  });

  it('correctly resolves a WITHDRAWAL transaction', () => {
    const raw = {
      id: 'tx-004',
      tx_type: 'WITHDRAWAL',
      asset_out_id: 'BTC',
      amount_out: '0.1',
      fee_eur: '2',
      timestamp: '2024-04-01 08:00:00',
    };
    const result = ExternalTaxTransactionSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('WITHDRAWAL');
      expect(result.data.symbol).toBe('BTC');
    }
  });

  it('converts "YYYY-MM-DD HH:MM:SS" string timestamps to Date objects', () => {
    const raw = {
      id: 'tx-005',
      tx_type: 'BUY',
      asset_in_id: 'SOL',
      amount_in: '10',
      fee_eur: '1',
      timestamp: '2024-05-20 14:30:00',
    };
    const result = ExternalTaxTransactionSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timestamp).toBeInstanceOf(Date);
      expect(result.data.timestamp.getFullYear()).toBe(2024);
    }
  });

  it('handles numeric timestamp (unix seconds) to Date', () => {
    const raw = {
      id: 'tx-006',
      tx_type: 'DEPOSIT',
      asset_in_id: 'BTC',
      amount_in: '0.01',
      fee_eur: '0',
      timestamp: 1716220200, // Unix seconds
    };
    const result = ExternalTaxTransactionSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timestamp).toBeInstanceOf(Date);
    }
  });

  it('fails gracefully on completely invalid input (safeParse does not throw)', () => {
    const result = ExternalTaxTransactionSchema.safeParse(null);
    expect(result.success).toBe(false);
    expect(() => ExternalTaxTransactionSchema.safeParse(null)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// ExternalTaxReportSchema
// ---------------------------------------------------------------------------

describe('ExternalTaxReportSchema', () => {
  it('parses a well-formed tax report response', () => {
    const raw = {
      year: 2024,
      method: 'FIFO',
      summary: {
        capital_gains_eur: '5000',
        capital_losses_eur: '1000',
        savings_base_yields_eur: '200',
        general_base_airdrops_eur: '100',
        net_patrimonial_result_eur: '4000',
        estimated_irpf_eur: '800',
      },
      audit_trail: [],
    };
    const result = ExternalTaxReportSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary.capitalGainsEur).toBe(5000);
      expect(result.data.summary.estimatedIrpfEur).toBe(800);
      expect(Array.isArray(result.data.auditTrail)).toBe(true);
    }
  });

  it('handles missing optional summary fields with zero defaults', () => {
    const raw = {
      year: 2023,
      method: 'FIFO',
      summary: {
        capital_gains_eur: '0',
        capital_losses_eur: '0',
      },
    };
    const result = ExternalTaxReportSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary.savingsBaseYieldsEur).toBe(0);
      expect(result.data.auditTrail).toEqual([]);
    }
  });
});
