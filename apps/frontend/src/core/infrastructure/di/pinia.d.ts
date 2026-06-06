import 'pinia'
import type { ICryptoPortfolioRepository } from '@/core/domain/repositories/ICryptoPortfolioRepository'
import type { ITaxRepository } from '@/core/domain/repositories/ITaxRepository'
import type { IWalletRepository } from '@/core/domain/ports/IWalletRepository'
import type { ICryptoMetricsRepository } from '@/core/domain/ports/ICryptoMetricsRepository'

declare module 'pinia' {
  export interface PiniaCustomProperties {
    $portfolioRepo: ICryptoPortfolioRepository
    $taxRepo: ITaxRepository
    $walletRepo: IWalletRepository
    $cryptoMetricsRepo: ICryptoMetricsRepository
  }
}
