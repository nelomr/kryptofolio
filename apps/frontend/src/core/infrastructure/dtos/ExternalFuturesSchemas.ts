/**
 * ExternalFuturesSchemas — Anti-Corruption Layer for the per-transaction futures ledger.
 *
 * Parses `LedgerFuturesTransaction` (`ILedgerPort.ts:62-80`), served verbatim by
 * `/api/tax/transactions/futures` — the same route `getFuturesTransactions` reads.
 * Every declared key and its optionality come from that emitter, measured, not
 * from an assumed CEX shape.
 *
 * @see src/core/domain/models/FiscalEntities.ts (TaxDerivativeEntity)
 */

import { z } from 'zod'
import { FUTURES_TX_TYPES, type FuturesTxType } from '@kryptofolio/shared-types'
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
// mapFuturesType — total map from the emitter's closed enum to the entity's
//
// `FUNDING_FEE` is the emitter's spelling; `FUTURES_FUNDING` is the entity's.
// Total over `FuturesTxType` so a fifth value added upstream fails this file's
// own typecheck instead of silently falling through to a catch-all.
// ---------------------------------------------------------------------------

const FUTURES_TYPE_MAP: Record<FuturesTxType, FuturesTransactionType> = {
  TRADE: 'FUTURES_TRADE',
  FUNDING_FEE: 'FUTURES_FUNDING',
  SETTLEMENT: 'FUTURES_SETTLEMENT',
  LIQUIDATION: 'FUTURES_LIQUIDATION',
}

function mapFuturesType(txType: FuturesTxType): FuturesTransactionType {
  return FUTURES_TYPE_MAP[txType]
}

// ---------------------------------------------------------------------------
// CexFuturesLedgerShape — THE CORE TRANSFORMATION
//
// Parses `LedgerFuturesTransaction` into `TaxDerivativeEntity`. Every key the
// emitter constructs (`ILedgerPort.ts:62-80`, `SQLiteLedgerAdapter.ts:240-257`)
// is declared here with the emitter's own optionality, even the ones this
// layer carries nowhere — a key that goes undeclared is a key an added-field
// contract test cannot see, which is how a real drift goes unnoticed. No
// alias with no producer survives.
//
// Field mapping (emitter → Domain entity):
//   id              → id (TransactionId branded)
//   tx_type         → type (FuturesTransactionType, via the total map above)
//   symbol          → contractSymbol + underlyingAsset (auto-extracted)
//   amount          → amount
//   trade_price     → tradePrice
//   realized_pnl    → realizedPnl (NEVER silently dropped)
//   fee_amount      → fees
//   funding_amount  → funding
//   timestamp       → timestamp (native Date)
//   exchange        → exchange
//   status          → status
//
// `id_hash`, `account_id`, `settlement_asset_id`, `fee_asset_id` and
// `fiat_currency` are parsed and carried nowhere: `TaxDerivativeEntity` has no
// field for any of them, and adding one is a display change this contract fix
// does not smuggle in. They stay declared so the mismatch is visible at the
// boundary rather than silently dropped.
//
// Named separately from the transformed export so a contract test can
// enumerate the wire keys this layer actually declares, without reaching into
// ZodEffects internals — see `backend-contract.spec.ts`.
// ---------------------------------------------------------------------------

export const CexFuturesLedgerShape = z.object({
  id: z.string().min(1),
  id_hash: z.string(),
  account_id: z.string(),
  tx_type: z.enum(FUTURES_TX_TYPES),
  symbol: z.string(),
  // Position size / contracts traded
  amount: numericField.optional(),
  // Execution price
  trade_price: numericField.optional(),
  // Realized PnL — CRITICAL fiscal field for AEAT
  realized_pnl: numericField.optional(),
  settlement_asset_id: z.string().optional(),
  funding_amount: numericField.optional(),
  fee_asset_id: z.string().optional(),
  fee_amount: numericField.optional(),
  fiat_currency: z.string(),
  timestamp: timestampToDate,
  exchange: z.string().optional(),
  status: z.string(),
})

export const CexFuturesLedgerSchema = CexFuturesLedgerShape
  .transform((raw): TaxDerivativeEntity => {
    const type = mapFuturesType(raw.tx_type)
    const contractSymbol = raw.symbol
    const underlyingAsset = extractUnderlyingAsset(contractSymbol)

    return {
      id: TransactionIdSchema.parse(raw.id),
      type,
      contractSymbol,
      underlyingAsset,
      // The entity's fields stay `number` here; a missing wire value still
      // falls back to `0`, unchanged from before this file's rewrite. That
      // fallback is the next thing to fix, not this one — retyping to a
      // value object that can represent "unresolved" is a separate change.
      amount: raw.amount ?? 0,
      tradePrice: raw.trade_price ?? 0,
      realizedPnl: raw.realized_pnl ?? 0,
      fees: raw.fee_amount ?? 0,
      funding: raw.funding_amount ?? 0,
      timestamp: raw.timestamp,
      exchange: raw.exchange,
      refId: undefined,
      status: raw.status,
    }
  })

export type CexFuturesLedgerDTO = z.infer<typeof CexFuturesLedgerSchema>
