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
import { Money } from '@kryptofolio/core-domain';
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
        rates_incomplete: false,
        prices_incomplete: false,
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
          cost_basis: { kind: 'NATIVE', amount: '50000.00', currency: 'USD' },
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
      price_fiat: '62000',
      fee_fiat: '5',
      timestamp: '2024-01-15 12:30:00',
    };
    const result = ExternalTaxTransactionSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('BUY');
      expect(result.data.symbol).toBe('BTC');
      expect(result.data.amount?.equals(new Money('0.5'))).toBe(true);
      expect(result.data.totalEur?.equals(new Money('31000'))).toBe(true);
      expect(result.data.feeEur?.equals(new Money('5'))).toBe(true);
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
      price_fiat: '62000',
      fee_fiat: '5',
      timestamp: '2024-06-01 09:00:00',
    };
    const result = ExternalTaxTransactionSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('SELL');
      expect(result.data.symbol).toBe('BTC');
      expect(result.data.amount?.equals(new Money('0.5'))).toBe(true);
      expect(result.data.totalEur?.equals(new Money('31000'))).toBe(true); // EUR received (proceeds)
    }
  });

  it('a DEPOSIT with a resolved total_fiat passes the valuation through, not a forced zero', () => {
    const raw = {
      id: 'tx-003',
      tx_type: 'DEPOSIT',
      asset_in_id: 'ETH',
      amount_in: '2.0',
      total_fiat: '4200',
      fee_fiat: '0',
      timestamp: '2024-03-10 10:00:00',
    };
    const result = ExternalTaxTransactionSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('DEPOSIT');
      expect(result.data.symbol).toBe('ETH');
      expect(result.data.amount?.equals(new Money('2.0'))).toBe(true);
      // D11: DEPOSIT/TRANSFER_IN no longer force Money('0') — resolveFiatMagnitudes
      // resolves a market valuation for every row regardless of type, so a stated
      // total_fiat must pass through instead of being discarded.
      expect(result.data.totalEur?.equals(new Money('4200'))).toBe(true);
    }
  });

  it('a DEPOSIT with no resolved total_fiat yields null, never a fabricated zero', () => {
    const raw = {
      id: 'tx-003b',
      tx_type: 'DEPOSIT',
      asset_in_id: 'ETH',
      amount_in: '2.0',
      fee_fiat: '0',
      timestamp: '2024-03-10 10:00:00',
    };
    const result = ExternalTaxTransactionSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalEur).toBeNull();
    }
  });

  it('correctly resolves a WITHDRAWAL transaction', () => {
    const raw = {
      id: 'tx-004',
      tx_type: 'WITHDRAWAL',
      asset_out_id: 'BTC',
      amount_out: '0.1',
      fee_fiat: '2',
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
      fee_fiat: '1',
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
      fee_fiat: '0',
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

  // -------------------------------------------------------------------------
  // A precision string past the float boundary survives exactly
  // -------------------------------------------------------------------------
  it('preserves an exact decimal total_fiat past the float-precision boundary', () => {
    const raw = {
      id: 'tx-precision',
      tx_type: 'SWAP',
      asset_in_id: 'ETH',
      asset_out_id: 'BTC',
      total_fiat: '0.000000010000000001',
      timestamp: '2024-01-01 00:00:00',
    };
    const result = ExternalTaxTransactionSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      // Decimal.toString() renders this magnitude in exponential form, so the exact-decimal
      // assertion goes through .equals(), not string identity.
      expect(result.data.totalEur?.equals(new Money('0.000000010000000001'))).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // amountIn/amountOut absence stays undefined, never Money('0')
  // -------------------------------------------------------------------------
  it('leaves amountIn/amountOut undefined when the wire omits them, never a Money of zero', () => {
    const raw = {
      id: 'tx-noleg',
      tx_type: 'BUY',
      asset_in_id: 'BTC',
      amount_out: '31000',
      timestamp: '2024-01-01 00:00:00',
    };
    const result = ExternalTaxTransactionSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amountIn).toBeUndefined();
      expect(result.data.amountOut?.equals(new Money('31000'))).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // The per-branch table: passthrough-or-null, never a forced zero
  // -------------------------------------------------------------------------
  describe('totalEur per-branch resolution: resolved passes through, absent is null', () => {
    const cases: Array<{ type: string; extra: Record<string, string> }> = [
      { type: 'SWAP', extra: { asset_in_id: 'ETH', asset_out_id: 'BTC' } },
      { type: 'MIGRATION_SWAP', extra: { asset_in_id: 'ETH', asset_out_id: 'BTC' } },
      { type: 'DEPOSIT', extra: { asset_in_id: 'ETH' } },
      { type: 'TRANSFER_IN', extra: { asset_in_id: 'ETH' } },
      { type: 'WITHDRAWAL', extra: { asset_out_id: 'ETH' } },
      { type: 'TRANSFER_OUT', extra: { asset_out_id: 'ETH' } },
      { type: 'AIRDROP', extra: { asset_in_id: 'ETH' } },
      { type: 'REWARD', extra: { asset_in_id: 'ETH' } },
      { type: 'FEE', extra: { asset_out_id: 'ETH' } },
      { type: 'UNKNOWN', extra: {} },
    ];

    it.each(cases)('$type: a resolved total_fiat passes through', ({ type, extra }) => {
      const raw = { id: `tx-${type}-r`, tx_type: type, total_fiat: '77', timestamp: '2024-01-01 00:00:00', ...extra };
      const result = ExternalTaxTransactionSchema.safeParse(raw);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalEur?.equals(new Money('77'))).toBe(true);
      }
    });

    it.each(cases)('$type: an absent total_fiat yields null, not a forced zero', ({ type, extra }) => {
      const raw = { id: `tx-${type}-a`, tx_type: type, timestamp: '2024-01-01 00:00:00', ...extra };
      const result = ExternalTaxTransactionSchema.safeParse(raw);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalEur).toBeNull();
      }
    });
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
      currency: 'EUR',
      conversion: { kind: 'NATIVE' },
      summary: {
        capital_gains: '5000',
        capital_losses: '1000',
        savings_base_yields: '200',
        general_base_airdrops: '100',
        net_patrimonial_result: '4000',
        estimated_irpf: '800',
      },
      audit_trail: [],
    };
    const result = ExternalTaxReportSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      // Exact strings: a declared tax base is not a float.
      expect(result.data.summary.capitalGains).toBe('5000');
      expect(result.data.summary.estimatedIrpf).toBe('800');
      expect(Array.isArray(result.data.auditTrail)).toBe(true);
    }
  });

  it('parses the two exclusion counts the backend sends at the top level, camelCase', () => {
    // The backend's SpanishTaxReportResponse sends these two siblings of `summary`, not inside it,
    // and not snake_case — unlike every other field on this response.
    const raw = {
      year: 2024,
      method: 'FIFO',
      currency: 'EUR',
      conversion: { kind: 'NATIVE' },
      audit_trail: [],
      excludedFlaggedEvents: 2,
      excludedUnresolvedIncomeCount: 3,
      summary: {
        capital_gains: '0', capital_losses: '0', savings_base_yields: '0',
        general_base_airdrops: '0', net_patrimonial_result: '0', estimated_irpf: '0',
      },
    };
    const result = ExternalTaxReportSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.excludedFlaggedEvents).toBe(2);
      expect(result.data.excludedUnresolvedIncomeCount).toBe(3);
    }
  });

  it('rejects a report that does not say which currency its figures are in', () => {
    // Not defaulted: a report rendered under an assumed currency is exactly the failure this
    // change removes, and a default would reinstate it at the parsing boundary.
    const result = ExternalTaxReportSchema.safeParse({
      year: 2024, method: 'FIFO', conversion: { kind: 'NATIVE' }, audit_trail: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unrecognised conversion outcome instead of coercing it', () => {
    // A third arm arriving from a newer backend must fail loudly here rather than be read as one of
    // the two this UI knows how to label.
    const result = ExternalTaxReportSchema.safeParse({
      year: 2024, method: 'FIFO', currency: 'EUR',
      conversion: { kind: 'PARTIALLY_CONVERTED' }, audit_trail: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a NATIVE outcome carrying a rate, rather than ignoring the extra field', () => {
    // `.strict()` is what makes the two arms mean different things: a native figure was never
    // multiplied, so a rate on it is a contradiction, not surplus detail.
    const result = ExternalTaxReportSchema.safeParse({
      year: 2024, method: 'FIFO', currency: 'EUR',
      conversion: { kind: 'NATIVE', rate: '1' }, audit_trail: [],
    });
    expect(result.success).toBe(false);
  });

  it('defaults both exclusion counts to zero when the backend omits them', () => {
    const raw = {
      year: 2024, method: 'FIFO', currency: 'EUR',
      conversion: { kind: 'NATIVE' }, audit_trail: [],
      summary: {
        capital_gains: '0', capital_losses: '0', savings_base_yields: '0',
        general_base_airdrops: '0', net_patrimonial_result: '0', estimated_irpf: '0',
      },
    };
    const result = ExternalTaxReportSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.excludedFlaggedEvents).toBe(0);
      expect(result.data.excludedUnresolvedIncomeCount).toBe(0);
    }
  });

  it('refuses a partial summary rather than completing it with zeros', () => {
    // This test asserted the opposite until the summary became required, and the assertion it made
    // was the defect: an absent figure was filled with `0` — a declared tax base of zero that no
    // engine ever computed. A partial declaration is not a smaller declaration, it is a wrong one.
    const result = ExternalTaxReportSchema.safeParse({
      year: 2023,
      method: 'FIFO',
      currency: 'EUR',
      conversion: { kind: 'NATIVE' },
      summary: {
        capital_gains: '0',
        capital_losses: '0',
      },
    });
    expect(result.success).toBe(false);
  });

  it('refuses a report carrying no summary at all', () => {
    const result = ExternalTaxReportSchema.safeParse({
      year: 2023, method: 'FIFO', currency: 'EUR',
      conversion: { kind: 'NATIVE' }, audit_trail: [],
    });
    expect(result.success).toBe(false);
  });
});
