import type { App } from 'vue'
import { inject } from 'vue'
import type { Pinia } from 'pinia'

// --- Hexagonal Architecture: Dependency Injection Setup ---
import { PORTFOLIO_REPO_KEY, TAX_REPO_KEY, I18N_PORT_KEY, WALLET_REPO_KEY, CRYPTO_METRICS_REPO_KEY } from '@/core/injectionKeys'
import { RestCryptoAdapter } from '@/core/infrastructure/adapters/RestCryptoAdapter'
import { RestTaxAdapter } from '@/core/infrastructure/adapters/RestTaxAdapter'
import { RestWalletRepository } from '@/core/infrastructure/adapters/RestWalletRepository'
import { RestCryptoMetricsAdapter } from '@/core/infrastructure/adapters/RestCryptoMetricsAdapter'
import { EnvI18nAdapter } from '@/core/infrastructure/i18n/EnvI18nAdapter'
import { es } from '@/i18n/dictionaries/es'
import { en } from '@/i18n/dictionaries/en'

/**
 * setupDependencyInjection
 * 
 * Configures the Application's Composition Root. 
 * Instantiates the HTTP Rest Adapters and wires them into Vue and Pinia.
 * Note: Mocks are now managed exclusively at the BFF layer.
 */
export function setupDependencyInjection(app: App, pinia: Pinia) {
  // 1. Instantiate infrastructure
  const portfolioRepo = new RestCryptoAdapter()
  const taxRepo = new RestTaxAdapter()
  const walletRepo = new RestWalletRepository()
  const cryptoMetricsRepo = new RestCryptoMetricsAdapter()

  const lang = import.meta.env.VITE_APP_LANG || 'en'
  const dictionary = lang === 'en' ? en : es
  const i18nAdapter = new EnvI18nAdapter(dictionary)

  // 2. Provide repositories globally to Vue components via Symbol keys
  app.provide(PORTFOLIO_REPO_KEY, portfolioRepo)
  app.provide(TAX_REPO_KEY, taxRepo)
  app.provide(I18N_PORT_KEY, i18nAdapter)
  app.provide(WALLET_REPO_KEY, walletRepo)
  app.provide(CRYPTO_METRICS_REPO_KEY, cryptoMetricsRepo)

  // 3. Inject repositories directly into Pinia stores
  // This solves the "[Vue warn]: inject() can only be used inside setup()" 
  // when stores need to fetch dependencies asynchronously.
  pinia.use(({ app: piniaApp }) => {
    return {
      $portfolioRepo: piniaApp.runWithContext(() => {
        const repo = inject(PORTFOLIO_REPO_KEY)
        if (!repo) throw new Error('[DI] PORTFOLIO_REPO_KEY not provided to Vue app context')
        return repo
      }),
      $taxRepo: piniaApp.runWithContext(() => {
        const repo = inject(TAX_REPO_KEY)
        if (!repo) throw new Error('[DI] TAX_REPO_KEY not provided to Vue app context')
        return repo
      }),
      $walletRepo: piniaApp.runWithContext(() => {
        const repo = inject(WALLET_REPO_KEY)
        if (!repo) throw new Error('[DI] WALLET_REPO_KEY not provided to Vue app context')
        return repo
      }),
      $cryptoMetricsRepo: piniaApp.runWithContext(() => {
        const repo = inject(CRYPTO_METRICS_REPO_KEY)
        if (!repo) throw new Error('[DI] CRYPTO_METRICS_REPO_KEY not provided to Vue app context')
        return repo
      })
    }
  })
}
