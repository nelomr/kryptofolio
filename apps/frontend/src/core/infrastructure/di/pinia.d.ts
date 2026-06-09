import 'pinia'
import type { ICryptoPortfolioPort } from '@/core/domain/ports/ICryptoPortfolioPort'
import type { ITaxPort } from '@/core/domain/ports/ITaxPort'
import type { IWalletPort } from '@/core/domain/ports/IWalletPort'
import type { ICryptoMetricsPort } from '@/core/domain/ports/ICryptoMetricsPort'

declare module 'pinia' {
  export interface PiniaCustomProperties {
    $portfolioRepo: ICryptoPortfolioPort
    $taxRepo: ITaxPort
    $walletRepo: IWalletPort
    $cryptoMetricsRepo: ICryptoMetricsPort
  }
}
