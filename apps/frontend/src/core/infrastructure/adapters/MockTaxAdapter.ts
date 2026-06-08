import type { ITaxRepository } from '@/core/domain/repositories/ITaxRepository'
import type { TaxTransactionEntity, TaxReportEntity, TaxDerivativeEntity } from '@/core/domain/models/FiscalEntities'
import { MockTaxTransactionSchema, MockTaxReportSchema, MockTaxDerivativeSchema } from '@/core/infrastructure/dtos/MockDtoSchemas'
import { z } from 'zod'
import { bffClient } from '../http/BffClient'

export class MockTaxAdapter implements ITaxRepository {
  private _spotTransactions: TaxTransactionEntity[] | null = null;
  private _reportCache: Record<number, TaxReportEntity> = {};

  async getSpotTransactions(): Promise<TaxTransactionEntity[]> {
    if (this._spotTransactions) return this._spotTransactions;
    try {
      const res = await bffClient.api.tax.transactions.spot.$get()
      if (!res.ok) throw new Error('Failed to fetch transactions from BFF')
      
      const rawData = await res.json()
      const parsed = z.array(MockTaxTransactionSchema).safeParse(rawData)
      
      if (!parsed.success) {
        console.error('[MockTaxAdapter] Validation failed:', parsed.error)
        throw new Error('Invalid mock transaction data format')
      }
      
      this._spotTransactions = parsed.data
      return this._spotTransactions
    } catch {
      return []
    }
  }

  async getFuturesTransactions(): Promise<TaxTransactionEntity[]> {
    try {
      const res = await bffClient.api.tax.transactions.futures.$get()
      if (!res.ok) throw new Error('Failed to fetch futures transactions from BFF')
      
      const rawData = await res.json()
      const parsed = z.array(MockTaxTransactionSchema).safeParse(rawData)
      
      if (!parsed.success) {
        console.error('[MockTaxAdapter] Validation failed:', parsed.error)
        throw new Error('Invalid mock futures transaction data format')
      }
      return parsed.data
    } catch {
      return []
    }
  }

  async getFuturesDerivatives(): Promise<TaxDerivativeEntity[]> {
    try {
      const res = await bffClient.api.tax.transactions['futures-derivatives'].$get()
      if (!res.ok) throw new Error('Failed to fetch futures derivatives from BFF')
      
      const rawData = await res.json()
      const parsed = z.array(MockTaxDerivativeSchema).safeParse(rawData)
      
      if (!parsed.success) {
        console.error('[MockTaxAdapter] Validation failed:', parsed.error)
        throw new Error('Invalid mock futures derivative data format')
      }
      return parsed.data
    } catch {
      return []
    }
  }

  async getInvalidTransactions(): Promise<TaxTransactionEntity[]> {
    try {
      const res = await bffClient.api.tax.transactions.invalid.$get()
      const rawData = await res.json()
      return z.array(MockTaxTransactionSchema).parse(rawData)
    } catch {
      return []
    }
  }

  async getReport(year: number, method: string): Promise<TaxReportEntity> {
    if (this._reportCache[year]) return this._reportCache[year]
    try {
      const res = await bffClient.api.tax.report.$get()
      if (!res.ok) throw new Error('Failed to fetch tax report from BFF')
      
      const rawData = await res.json()
      const parsed = MockTaxReportSchema.safeParse(rawData)
      
      if (!parsed.success) {
        console.error('[MockTaxAdapter] Validation failed:', parsed.error)
        throw new Error('Invalid mock tax report data format')
      }
      
      parsed.data.year = year
      this._reportCache[year] = parsed.data
      return parsed.data
    } catch {
      // Ignore
    }
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
    if (this._spotTransactions) {
      this._spotTransactions = this._spotTransactions.filter((tx) => tx.id !== id)
    }
  }

  async updateTransaction(id: string, data: Partial<TaxTransactionEntity>): Promise<void> {
    if (!this._spotTransactions) return
    const idx = this._spotTransactions.findIndex((tx) => tx.id === id)
    if (idx !== -1) {
      this._spotTransactions[idx] = { ...this._spotTransactions[idx], ...data }
    }
  }

  async validateTransaction(_payload: Partial<TaxTransactionEntity>): Promise<void> {
    // No-op
  }

  async uploadTaxFile(_file: File, _market: 'spot' | 'futures'): Promise<void> {
    // No-op mock
  }

  async deleteAllTransactions(market: 'spot' | 'futures'): Promise<void> {
    if (market === 'spot') this._spotTransactions = []
  }

  async importWallet(chain: string, address: string): Promise<void> {
    console.info(`[MockTaxAdapter] importWallet called for ${chain}:${address}`)
  }

  async syncWeb3(): Promise<void> {
    console.info('[MockTaxAdapter] syncWeb3 called')
  }

  async downloadReport(year: number, _format: 'pdf' | 'csv'): Promise<Blob> {
    const report = await this.getReport(year, 'FIFO')
    const text = `Kryptofolio Report ${year}\nNet Result: ${report.summary.netPatrimonialResultEur} EUR`
    return new Blob([text], { type: 'text/plain;charset=utf-8;' })
  }
}
