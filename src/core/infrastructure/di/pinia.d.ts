import 'pinia'
import type { ICryptoPortfolioRepository } from '@/core/domain/repositories/ICryptoPortfolioRepository'
import type { ITaxRepository } from '@/core/domain/repositories/ITaxRepository'

declare module 'pinia' {
  export interface PiniaCustomProperties {
    $portfolioRepo: ICryptoPortfolioRepository
    $taxRepo: ITaxRepository
  }
}
