import type { App } from "vue";
import { inject } from "vue";
import type { Pinia } from "pinia";

// --- Hexagonal Architecture: Dependency Injection Setup ---
import {
  PORTFOLIO_PORT_KEY,
  TAX_PORT_KEY,
  I18N_PORT_KEY,
  WALLET_PORT_KEY,
  CRYPTO_METRICS_PORT_KEY,
  SETTINGS_PORT_KEY,
  VAULT_PORT_KEY,
} from "@/core/injectionKeys";
import { RestCryptoAdapter } from "@/core/infrastructure/adapters/RestCryptoAdapter";
import { RestTaxAdapter } from "@/core/infrastructure/adapters/RestTaxAdapter";
import { RestWalletAdapter } from "@/core/infrastructure/adapters/RestWalletAdapter";
import { RestCryptoMetricsAdapter } from "@/core/infrastructure/adapters/RestCryptoMetricsAdapter";
import { RestSettingsAdapter } from "@/core/infrastructure/adapters/RestSettingsAdapter";
import { RestVaultAdapter } from "@/core/infrastructure/adapters/RestVaultAdapter";
import { ReactiveI18nAdapter } from "@/core/infrastructure/i18n/ReactiveI18nAdapter";

/**
 * setupDependencyInjection
 *
 * Configures the Application's Composition Root.
 * Instantiates the HTTP Rest Adapters and wires them into Vue and Pinia.
 * Note: Mocks are now managed exclusively at the BFF layer.
 */
export function setupDependencyInjection(app: App, pinia: Pinia) {
  // 1. Instantiate infrastructure
  const portfolioPort = new RestCryptoAdapter();
  const taxPort = new RestTaxAdapter();
  const walletPort = new RestWalletAdapter();
  const cryptoMetricsPort = new RestCryptoMetricsAdapter();
  const settingsPort = new RestSettingsAdapter();
  const vaultPort = new RestVaultAdapter();

  const lang = import.meta.env.VITE_APP_LANG || "en";
  const i18nAdapter = new ReactiveI18nAdapter(lang);

  // 2. Provide ports globally to Vue components via Symbol keys
  app.provide(PORTFOLIO_PORT_KEY, portfolioPort);
  app.provide(TAX_PORT_KEY, taxPort);
  app.provide(I18N_PORT_KEY, i18nAdapter);
  app.provide(WALLET_PORT_KEY, walletPort);
  app.provide(CRYPTO_METRICS_PORT_KEY, cryptoMetricsPort);
  app.provide(SETTINGS_PORT_KEY, settingsPort);
  app.provide(VAULT_PORT_KEY, vaultPort);

  // 3. Inject ports directly into Pinia stores
  // This solves the "[Vue warn]: inject() can only be used inside setup()"
  // when stores need to fetch dependencies asynchronously.
  pinia.use(({ app: piniaApp }) => {
    return {
      $portfolioPort: piniaApp.runWithContext(() => {
        const port = inject(PORTFOLIO_PORT_KEY);
        if (!port)
          throw new Error(
            "[DI] PORTFOLIO_PORT_KEY not provided to Vue app context",
          );
        return port;
      }),
      $taxPort: piniaApp.runWithContext(() => {
        const port = inject(TAX_PORT_KEY);
        if (!port)
          throw new Error("[DI] TAX_PORT_KEY not provided to Vue app context");
        return port;
      }),
      $walletPort: piniaApp.runWithContext(() => {
        const port = inject(WALLET_PORT_KEY);
        if (!port)
          throw new Error(
            "[DI] WALLET_PORT_KEY not provided to Vue app context",
          );
        return port;
      }),
      $cryptoMetricsPort: piniaApp.runWithContext(() => {
        const port = inject(CRYPTO_METRICS_PORT_KEY);
        if (!port)
          throw new Error(
            "[DI] CRYPTO_METRICS_PORT_KEY not provided to Vue app context",
          );
        return port;
      }),
    };
  });
}
