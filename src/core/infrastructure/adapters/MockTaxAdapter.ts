/**
 * MockTaxAdapter — Offline fiscal adapter for development and testing.
 *
 * REWRITTEN: Now stateful. `_transactions` is a mutable instance array.
 * All write operations (deleteTransaction, updateTransaction, uploadTaxFile,
 * deleteAllTransactions) actually mutate the array, so getTransactions()
 * reflects the changes in the same session.
 *
 * uploadTaxFile: Parses CSV via papaparse and XLSX via SheetJS (both lazy-
 * imported so they don't inflate the initial bundle). Format auto-detection
 * is done via REGISTERED_PARSERS.detect().
 *
 * @see openspec/specs/mock-adapters/spec.md
 */

import type { ITaxRepository } from '@/core/domain/repositories/ITaxRepository'
import type { TaxTransactionEntity, TaxReportEntity, TaxLotHistoryEvent } from '@/core/domain/models/FiscalEntities'
import { TransactionIdSchema } from '@/core/domain/models/BrandedTypes'
import { TaxOperationError } from '@/core/infrastructure/errors/TaxOperationError'
import { REGISTERED_PARSERS } from '@/core/infrastructure/csv'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------------------------------------------------------------------------
// Rich seed dataset — ~50 transactions, all TaxTransactionType values,
// two fiscal years (2024 and 2025), FIFO lots, and audit trail entries.
// ---------------------------------------------------------------------------

function buildSeed(): TaxTransactionEntity[] {
  const tx = (
    id: string,
    type: TaxTransactionEntity['type'],
    symbol: string,
    amount: number,
    totalEur: number,
    priceEur: number,
    feeEur: number,
    date: string,
    exchange = 'Kraken',
    refId?: string,
  ): TaxTransactionEntity => ({
    id: TransactionIdSchema.parse(id),
    type,
    symbol,
    amount,
    totalEur,
    priceEur,
    feeEur,
    timestamp: new Date(date),
    exchange,
    refId,
  })

  return [
    // --- 2024 — BUY lots (FIFO base) ---
    tx('tx-001', 'BUY', 'BTC', 0.5, 25_000, 50_000, 12.5, '2024-01-15T10:00:00Z'),
    tx('tx-002', 'BUY', 'ETH', 4.5, 8_100, 1_800, 4.05, '2024-02-10T09:15:00Z'),
    tx('tx-003', 'BUY', 'SOL', 100, 5_000, 50, 2.5, '2024-03-05T14:00:00Z'),
    tx('tx-004', 'BUY', 'BTC', 0.2, 11_000, 55_000, 5.5, '2024-04-01T08:00:00Z'),
    tx('tx-005', 'BUY', 'ADA', 2000, 700, 0.35, 0.35, '2024-04-20T11:00:00Z', 'Bitvavo'),
    tx('tx-006', 'BUY', 'HBAR', 5000, 300, 0.06, 0.15, '2024-05-10T13:00:00Z', 'Bitvavo'),
    tx('tx-007', 'BUY', 'XRP', 1000, 550, 0.55, 0.275, '2024-06-01T10:30:00Z'),

    // --- 2024 — SELL disposals ---
    tx('tx-008', 'SELL', 'BTC', 0.1, 6_200, 62_000, 3.1, '2024-03-20T14:30:00Z'),
    tx('tx-009', 'SELL', 'ETH', 1.0, 3_500, 3_500, 1.75, '2024-05-15T16:00:00Z'),
    tx('tx-010', 'SELL', 'SOL', 30, 2_100, 70, 1.05, '2024-07-08T09:45:00Z'),

    // --- 2024 — DEPOSIT / WITHDRAWAL ---
    tx('tx-011', 'DEPOSIT', 'SOL', 50, 0, 0, 0, '2024-06-05T16:00:00Z', 'Phantom'),
    tx('tx-012', 'DEPOSIT', 'HBAR', 5_239, 0, 0, 0, '2024-09-16T13:15:00Z', 'Kraken', 'FTRZofM'),
    tx('tx-013', 'WITHDRAWAL', 'SOL', 0.006, 0, 0, 0, '2024-11-10T15:48:00Z'),
    tx('tx-014', 'WITHDRAWAL', 'XRP', 439.55, 0, 0, 0, '2024-07-07T10:19:00Z', 'Bitvavo'),
    tx('tx-015', 'DEPOSIT', 'ADA', 543.34, 0, 0, 0, '2024-12-13T12:18:00Z', 'BitUnix'),

    // --- 2024 — AIRDROP / REWARD ---
    tx('tx-016', 'AIRDROP', 'UNI', 400, 0, 0, 0, '2024-09-17T00:00:00Z', 'Uniswap'),
    tx('tx-017', 'REWARD', 'SOL', 0.5, 35, 70, 0, '2024-08-01T00:00:00Z', 'Phantom'),
    tx('tx-018', 'REWARD', 'EUR', 10, 10, 1, 0, '2024-09-30T10:10:00Z', 'Bitvavo'),
    tx('tx-019', 'REWARD', 'B2M', 25.5, 0, 0, 0, '2024-04-01T12:00:00Z', 'Bit2Me'),

    // --- 2024 — SWAP ---
    tx('tx-020', 'SWAP', 'ETH', 0.1, 0, 0, 0.5, '2024-10-15T12:00:00Z', 'Bit2Me'),

    // --- 2024 — TRANSFER ---
    tx('tx-021', 'TRANSFER_OUT', 'EUR', 200, 200, 1, 0, '2024-01-16T15:41:00Z'),
    tx('tx-022', 'TRANSFER_IN', 'EUR', 200, 200, 1, 0, '2024-01-16T15:42:00Z'),

    // --- 2024 — MIGRATION_SWAP ---
    tx('tx-023', 'MIGRATION_SWAP', 'AI16Z', 1000, 0, 0, 0, '2024-11-20T00:00:00Z', 'Phantom'),

    // --- 2024 — FEE ---
    tx('tx-024', 'FEE', 'EUR', 2.5, 2.5, 1, 0, '2024-12-31T23:59:00Z'),

    // --- 2024 — More BUYs for FIFO testing ---
    tx('tx-025', 'BUY', 'ETH', 2.0, 7_000, 3_500, 3.5, '2024-08-20T10:00:00Z'),
    tx('tx-026', 'BUY', 'BTC', 0.05, 3_250, 65_000, 1.625, '2024-09-01T09:00:00Z'),
    tx('tx-027', 'BUY', 'SOL', 50, 4_000, 80, 2.0, '2024-10-10T14:00:00Z'),

    // --- 2025 — BUY lots ---
    tx('tx-028', 'BUY', 'BTC', 0.1, 9_000, 90_000, 4.5, '2025-01-05T10:00:00Z'),
    tx('tx-029', 'BUY', 'ETH', 3.0, 9_000, 3_000, 4.5, '2025-02-05T16:29:00Z', 'Bitvavo'),
    tx('tx-030', 'BUY', 'PUMP', 7_704, 50, 0.006, 0.22, '2025-09-19T01:38:00Z', 'Kraken', 'TTE7DJ'),
    tx('tx-031', 'BUY', 'ENA', 1_000, 500, 0.5, 0.25, '2025-02-01T10:00:00Z'),
    tx('tx-032', 'BUY', 'ADA', 1_000, 350, 0.35, 0.175, '2025-03-01T11:00:00Z'),
    tx('tx-033', 'BUY', 'XRP', 500, 300, 0.6, 0.15, '2025-04-10T09:00:00Z'),

    // --- 2025 — SELL disposals ---
    tx('tx-034', 'SELL', 'ENA', 957.64, 448.75, 0.468, 1.795, '2025-10-07T23:40:00Z', 'Kraken', 'TKU627'),
    tx('tx-035', 'SELL', 'BTC', 0.05, 4_800, 96_000, 2.4, '2025-06-15T12:00:00Z'),
    tx('tx-036', 'SELL', 'ETH', 1.5, 5_250, 3_500, 2.625, '2025-07-20T14:00:00Z'),
    tx('tx-037', 'SELL', 'SOL', 20, 1_600, 80, 0.8, '2025-08-05T10:00:00Z'),

    // --- 2025 — DEPOSIT / WITHDRAWAL ---
    tx('tx-038', 'DEPOSIT', 'XRP', 1.0, 0, 0, 0, '2025-06-03T10:01:00Z', 'Tangem', 'WALLET_ACTIVATION-XRP-0'),
    tx('tx-039', 'DEPOSIT', 'ADA', 546.84, 0, 0, 0, '2025-12-13T22:03:00Z', 'BitUnix'),
    tx('tx-040', 'WITHDRAWAL', 'ADA', 546.84, 0, 0, 0, '2025-12-13T22:03:00Z', 'BitUnix'),

    // --- 2025 — REWARD ---
    tx('tx-041', 'REWARD', 'SOL', 0.8, 80, 100, 0, '2025-03-15T00:00:00Z', 'Phantom'),
    tx('tx-042', 'REWARD', 'B2M', 50, 0, 0, 0, '2025-04-01T12:00:00Z', 'Bit2Me'),

    // --- 2025 — SWAP / MIGRATION ---
    tx('tx-043', 'SWAP', 'SOL', 0.3, 0, 0, 0.5, '2025-01-10T09:00:00Z', 'Bit2Me'),
    tx('tx-044', 'MIGRATION_SWAP', 'ELIZAOS', 1000, 0, 0, 0, '2025-02-10T00:00:00Z', 'Phantom'),

    // --- Extra entries to reach ~50 ---
    tx('tx-045', 'BUY', 'SOL', 25, 2_500, 100, 1.25, '2025-05-01T10:00:00Z'),
    tx('tx-046', 'SELL', 'XRP', 200, 120, 0.6, 0.06, '2025-09-20T14:00:00Z'),
    tx('tx-047', 'BUY', 'HBAR', 10_000, 500, 0.05, 0.25, '2025-10-01T11:00:00Z', 'Bitvavo'),
    tx('tx-048', 'DEPOSIT', 'BTC', 0.01, 0, 0, 0, '2025-11-01T09:00:00Z', 'Tangem'),
    tx('tx-049', 'WITHDRAWAL', 'ETH', 0.5, 0, 0, 0.005, '2025-11-15T12:00:00Z'),
    tx('tx-050', 'FEE', 'EUR', 1.8, 1.8, 1, 0, '2025-12-31T23:59:00Z'),
  ]
}

// ---------------------------------------------------------------------------
// Invalid transactions — 3 edge-case entries for getInvalidTransactions()
// ---------------------------------------------------------------------------

const INVALID_TRANSACTIONS: TaxTransactionEntity[] = [
  {
    id: TransactionIdSchema.parse('tx-inv-001'),
    type: 'BUY',
    symbol: 'UNKNOWN_TOKEN',
    amount: 100,
    totalEur: 0,
    priceEur: 0, // Missing price — unresolvable
    feeEur: 0,
    timestamp: new Date('2024-06-01T00:00:00Z'),
    exchange: 'Kraken',
  },
  {
    id: TransactionIdSchema.parse('tx-inv-002'),
    type: 'SELL',
    symbol: 'ETH',
    amount: 0, // Zero amount — suspicious
    totalEur: 500,
    priceEur: 3_500,
    feeEur: 0.25,
    timestamp: new Date('2024-09-10T00:00:00Z'),
    exchange: 'Bitvavo',
  },
  {
    id: TransactionIdSchema.parse('tx-inv-003'),
    type: 'UNKNOWN',
    symbol: '???',
    amount: 1,
    totalEur: 0,
    priceEur: 0,
    feeEur: 0,
    timestamp: new Date('2025-03-01T00:00:00Z'),
    exchange: 'Unknown',
  },
]

// ---------------------------------------------------------------------------
// Mock tax report 2024 — non-zero summary + 5 audit trail entries
// ---------------------------------------------------------------------------

const MOCK_AUDIT_TRAIL: TaxLotHistoryEvent[] = [
  {
    id: 'lot-evt-001',
    disposalDate: new Date('2024-03-20T14:30:00Z'),
    amountFromLot: 0.1,
    salePriceEur: 62_000,
    gainLossEur: 1_200,
    saleFeeEur: 3.1,
    isTaxable: true,
    notes: 'FIFO: Lot tx-001 partial (0.1 BTC @ 50000 EUR cost)',
  },
  {
    id: 'lot-evt-002',
    disposalDate: new Date('2024-05-15T16:00:00Z'),
    amountFromLot: 1.0,
    salePriceEur: 3_500,
    gainLossEur: -300,
    saleFeeEur: 1.75,
    isTaxable: true,
    notes: 'FIFO: Lot tx-002 partial (1 ETH @ 1800 EUR cost)',
  },
  {
    id: 'lot-evt-003',
    disposalDate: new Date('2024-07-08T09:45:00Z'),
    amountFromLot: 30,
    salePriceEur: 70,
    gainLossEur: 600,
    saleFeeEur: 1.05,
    isTaxable: true,
    notes: 'FIFO: Lot tx-003 partial (30 SOL @ 50 EUR cost)',
  },
  {
    id: 'lot-evt-004',
    disposalDate: new Date('2024-06-03T10:01:00Z'),
    amountFromLot: 1.0,
    salePriceEur: 0,
    gainLossEur: 0,
    isTaxable: false,
    flag: 'WALLET_ACTIVATION',
    notes: 'XRP Wallet Activation Reserve — non-taxable base reserve',
  },
  {
    id: 'lot-evt-005',
    disposalDate: new Date('2024-09-17T00:00:00Z'),
    amountFromLot: 400,
    salePriceEur: 0,
    gainLossEur: 0,
    isTaxable: false,
    notes: 'UNI Airdrop — zero cost basis, declared as general income base',
  },
]

const MOCK_REPORT_2024: TaxReportEntity = {
  year: 2024,
  method: 'FIFO',
  summary: {
    capitalGainsEur: 1_800,
    capitalLossesEur: 300,
    savingsBaseYieldsEur: 35,
    generalBaseAirdropsEur: 0,
    netPatrimonialResultEur: 1_500,
    estimatedIrpfEur: 285,
  },
  auditTrail: MOCK_AUDIT_TRAIL,
}

// ---------------------------------------------------------------------------
// MockTaxAdapter — stateful, mutable instance
// ---------------------------------------------------------------------------

export class MockTaxAdapter implements ITaxRepository {
  private _transactions: TaxTransactionEntity[]

  constructor() {
    this._transactions = buildSeed()
  }

  async getTransactions(): Promise<TaxTransactionEntity[]> {
    await delay(350)
    return [...this._transactions]
  }

  async getInvalidTransactions(): Promise<TaxTransactionEntity[]> {
    await delay(200)
    return [...INVALID_TRANSACTIONS]
  }

  async getReport(year: number, method: string): Promise<TaxReportEntity> {
    await delay(500)
    if (year === 2024) return MOCK_REPORT_2024
    return {
      year,
      method,
      summary: {
        capitalGainsEur: 0,
        capitalLossesEur: 0,
        savingsBaseYieldsEur: 0,
        generalBaseAirdropsEur: 0,
        netPatrimonialResultEur: 0,
        estimatedIrpfEur: 0,
      },
      auditTrail: [],
    }
  }

  async deleteTransaction(id: string): Promise<void> {
    await delay(100)
    this._transactions = this._transactions.filter((tx) => tx.id !== id)
  }

  async updateTransaction(id: string, data: Partial<TaxTransactionEntity>): Promise<void> {
    await delay(150)
    const idx = this._transactions.findIndex((tx) => tx.id === id)
    if (idx !== -1) {
      this._transactions[idx] = { ...this._transactions[idx], ...data }
    }
  }

  async validateTransaction(payload: Partial<TaxTransactionEntity>): Promise<void> {
    await delay(150)
    if (!payload.id) return
    const idx = this._transactions.findIndex((tx) => tx.id === payload.id)
    if (idx !== -1) {
      // Mark the transaction as validated — no structural change, just merge
      this._transactions[idx] = { ...this._transactions[idx], ...payload }
    }
  }

  /**
   * Parse a CSV or XLSX file locally and append results to _transactions.
   * No network request is made. Uses papaparse for CSV, SheetJS for XLSX.
   * @throws {TaxOperationError} with code 'UPLOAD_FAILED' if format unknown
   */
  async uploadTaxFile(file: File): Promise<void> {
    await delay(200)

    let rawRows: Record<string, string>[] = []

    if (file.name.toLowerCase().endsWith('.xlsx')) {
      rawRows = await this._parseXlsx(file)
    } else {
      rawRows = await this._parseCsv(file)
    }

    if (rawRows.length === 0) {
      throw new TaxOperationError('UPLOAD_FAILED', 'File is empty or could not be read')
    }

    const headers = Object.keys(rawRows[0])
    const parser = REGISTERED_PARSERS.find((p) => p.detect(headers))

    if (!parser) {
      throw new TaxOperationError(
        'UPLOAD_FAILED',
        `Unsupported file format. Headers found: ${headers.slice(0, 5).join(', ')}`,
      )
    }

    const newEntities = parser.parse(rawRows)
    this._transactions = [...this._transactions, ...newEntities]
  }

  /** Clears all transactions — in-memory only. */
  async deleteAllTransactions(): Promise<void> {
    await delay(100)
    this._transactions = []
  }

  /**
   * Mock wallet import — simulates a small batch of on-chain transactions.
   * No network request is made.
   */
  async importWallet(chain: string, address: string): Promise<void> {
    await delay(800)
    // In a real scenario, this would fetch from the chain's API.
    // In mock mode, we just log and do nothing to keep the dataset clean.
    console.info(`[MockTaxAdapter] importWallet called for ${chain}:${address} — no-op in mock mode`)
  }

  /** Mock Web3 sync — no-op in dev mode. */
  async syncWeb3(): Promise<void> {
    await delay(1200)
    console.info('[MockTaxAdapter] syncWeb3 called — no-op in mock mode')
  }

  // ---------------------------------------------------------------------------
  // Private helpers — lazy imports for bundle size
  // ---------------------------------------------------------------------------

  private async _parseCsv(file: File): Promise<Record<string, string>[]> {
    const { default: Papa } = await import('papaparse')
    const text = await file.text()
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    })
    return result.data
  }

  private async _parseXlsx(file: File): Promise<Record<string, string>[]> {
    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    // header: 1 returns array-of-arrays; we want objects keyed by header name
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })
    return rows
  }
}
