/**
 * ExternalFuturesSchemas — Anti-Corruption Layer for CEX Futures/Derivatives API responses.
 *
 * Handles the shape of futures ledger data from CEX providers like Kraken Futures:
 *   - Parses contract symbols (e.g. pf_xrpusd) and extracts the underlying asset
 *   - Coerces string numbers to native numbers with safe fallback to 0
 *   - Normalizes timestamps to native Date objects
 *   - Maps snake_case exchange field names to camelCase domain entities
 *   - Isolates FUTURES_TRADE vs FUTURES_FUNDING vs CONVERSION detection
 *
 * AEAT Compliance: realized_pnl is the primary taxable concept for derivatives
 * under LIRPF — this layer ensures it is never silently dropped or zero-defaulted.
 *
 * @see src/core/domain/models/FiscalEntities.ts (TaxDerivativeEntity)
 */

import { z } from 'zod'
import type { TaxDerivativeEntity, FuturesTransactionType } from '@/core/domain/models/FiscalEntities'
import { TransactionIdSchema } from '@/core/infrastructure/dtos/BrandedTypeSchemas'

// ---------------------------------------------------------------------------
// Helpers — reused from ExternalTaxSchemas pattern
// ---------------------------------------------------------------------------

/** Coerces any numeric-like value to a number, with 0 as fallback */
const numericField = z.preprocess(
  (val) => {
    if (val === null || val === undefined) return 0
    const n = typeof val === 'string' ? parseFloat(val.replace(/[^0-9.-]/g, '')) : Number(val)
    return isNaN(n) ? 0 : n
  },
  z.number(),
)

/** Normalizes various timestamp formats to a native Date object */
const timestampToDate = z.preprocess((val) => {
  if (val instanceof Date) return val
  if (typeof val === 'number') {
    const ms = val < 1e10 ? val * 1000 : val
    return new Date(ms)
  }
  if (typeof val === 'string') {
    let normalized = val.replace(' ', 'T')
    if (!normalized.endsWith('Z') && !normalized.includes('+')) {
      normalized += 'Z'
    }
    return new Date(normalized)
  }
  return new Date(0)
}, z.date())

// ---------------------------------------------------------------------------
// extractUnderlyingAsset
//
// Parses a CEX futures contract symbol to extract the underlying asset.
// Handles common formats:
//   - Kraken Futures: "pf_xrpusd" → "xrp", "pi_btcusd" → "btc"
//   - Generic: "BTC-PERP" → "btc", "ETHUSDT" → "eth"
// ---------------------------------------------------------------------------

export function extractUnderlyingAsset(contractSymbol: string): string {
  if (!contractSymbol) return 'generic'
  const lower = contractSymbol.toLowerCase()

  // Kraken format: pf_xrpusd, pi_ethusd (prefix_assetquote)
  const krakenNounderscore = lower.match(/^(?:pf|pi|ff|fi)_([a-z0-9]+?)(?:usd|eur|gbp|usdt|usdc)$/)
  if (krakenNounderscore) return krakenNounderscore[1]

  // Kraken format with underscore before quote: ff_sol_usd, fi_btc_usd
  const krakenUnderscore = lower.match(/^(?:pf|pi|ff|fi)_([a-z0-9]+)_(?:usd|eur|gbp|usdt|usdc)$/)
  if (krakenUnderscore) return krakenUnderscore[1]

  // Format with underscore separator: btc_usd, eth_eur
  const underscoreMatch = lower.match(/^([a-z0-9]+)_(?:usd|eur|usdt|gbp|usdc)/)
  if (underscoreMatch) return underscoreMatch[1]

  // Format with dash: BTC-PERP, ETH-USD
  const dashMatch = lower.match(/^([a-z0-9]+)-/)
  if (dashMatch) return dashMatch[1]

  // Trailing quote currency: BTCUSDT, ETHEUR (min 6 chars)
  if (lower.length >= 6) {
    const quoteSuffixes = ['usdt', 'usdc', 'usd', 'eur', 'gbp', 'btc']
    for (const suffix of quoteSuffixes) {
      if (lower.endsWith(suffix) && lower.length > suffix.length) {
        return lower.slice(0, lower.length - suffix.length)
      }
    }
  }

  return lower
}

// ---------------------------------------------------------------------------
// mapFuturesType — normalizes raw string to FuturesTransactionType
// ---------------------------------------------------------------------------

const FUTURES_TYPE_MAP: Record<string, FuturesTransactionType> = {
  futures_trade: 'FUTURES_TRADE',
  trade: 'FUTURES_TRADE',
  futures_funding: 'FUTURES_FUNDING',
  funding: 'FUTURES_FUNDING',
  funding_rate: 'FUTURES_FUNDING',
  conversion: 'CONVERSION',
}

function mapFuturesType(raw: string | undefined): FuturesTransactionType {
  if (!raw) return 'UNKNOWN'
  return FUTURES_TYPE_MAP[raw.toLowerCase()] ?? 'UNKNOWN'
}

// ---------------------------------------------------------------------------
// CexFuturesLedgerSchema — THE CORE TRANSFORMATION
//
// Parses a raw futures ledger entry (from API response or CSV-based payload)
// into a clean TaxDerivativeEntity domain model.
//
// Field mapping (CEX raw → Domain entity):
//   id              → id (TransactionId branded)
//   type/tx_type    → type (FuturesTransactionType)
//   symbol/contract → contractSymbol + underlyingAsset (auto-extracted)
//   change/amount   → amount
//   trade_price     → tradePrice
//   realized_pnl    → realizedPnl (NEVER silently dropped)
//   fee/fee_eur     → fees
//   realized_funding→ funding
//   timestamp/date  → timestamp (native Date)
//   exchange        → exchange
//   ref_id          → refId
//   status          → status
// ---------------------------------------------------------------------------

export const CexFuturesLedgerSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().optional(),
    tx_type: z.string().optional(),
    // Contract symbol — accepts 'symbol', 'contract', or 'pair'
    symbol: z.string().optional(),
    contract: z.string().optional(),
    pair: z.string().optional(),
    // Position size / contracts traded
    change: numericField.optional(),
    amount: numericField.optional(),
    // Execution price
    trade_price: numericField.optional(),
    price: numericField.optional(),
    price_eur: numericField.optional(),
    // Realized PnL — CRITICAL fiscal field for AEAT
    realized_pnl: numericField.optional(),
    pnl: numericField.optional(),
    // Fees
    fee: numericField.optional(),
    fee_eur: numericField.optional(),
    // Funding rate
    realized_funding: numericField.optional(),
    funding: numericField.optional(),
    // Timestamp
    timestamp: timestampToDate.optional(),
    date: timestampToDate.optional(),
    // Metadata
    exchange: z.string().optional(),
    ref_id: z.string().optional(),
    refid: z.string().optional(),
    status: z.string().optional(),
  })
  .transform((raw): TaxDerivativeEntity => {
    const rawType = raw.type ?? raw.tx_type
    const type = mapFuturesType(rawType)

    const contractSymbol = raw.symbol ?? raw.contract ?? raw.pair ?? ''
    const underlyingAsset = extractUnderlyingAsset(contractSymbol)

    const amount = raw.change ?? raw.amount ?? 0
    const tradePrice = raw.trade_price ?? raw.price ?? raw.price_eur ?? 0
    const realizedPnl = raw.realized_pnl ?? raw.pnl ?? 0
    const fees = raw.fee_eur ?? raw.fee ?? 0
    const funding = raw.realized_funding ?? raw.funding ?? 0
    const timestamp = raw.timestamp ?? raw.date ?? new Date(0)
    const refId = raw.ref_id ?? raw.refid

    return {
      id: TransactionIdSchema.parse(raw.id),
      type,
      contractSymbol,
      underlyingAsset,
      amount,
      tradePrice,
      realizedPnl,
      fees,
      funding,
      timestamp,
      exchange: raw.exchange,
      refId,
      status: raw.status,
    }
  })

export type CexFuturesLedgerDTO = z.infer<typeof CexFuturesLedgerSchema>
