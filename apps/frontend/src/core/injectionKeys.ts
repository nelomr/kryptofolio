/**
 * Injection Keys — Symbols for Vue's provide/inject DI system.
 *
 * Using typed InjectionKey<T> ensures that `inject()` returns the correct
 * interface without manual type casting. The Symbol ensures the key is
 * globally unique, preventing naming collisions.
 *
 * @see openspec/specs/hexagonal-architecture/spec.md
 */

import type { InjectionKey } from "vue";
import type { ICryptoPortfolioPort } from "./domain/ports/ICryptoPortfolioPort";
import type { ITaxPort } from "./domain/ports/ITaxPort";

/** Injection key for the portfolio port (Ports) */
export const PORTFOLIO_PORT_KEY: InjectionKey<ICryptoPortfolioPort> = Symbol(
  "ICryptoPortfolioPort",
);

/** Injection key for the tax port (Ports) */
export const TAX_PORT_KEY: InjectionKey<ITaxPort> = Symbol("ITaxPort");

/** Injection key for the i18n port (Ports) */
import type { I18nPort } from "./domain/ports/I18nPort";
export const I18N_PORT_KEY: InjectionKey<I18nPort> = Symbol("I18nPort");

/** Injection key for the vault port (Ports) */
import type { IVaultPort } from "./domain/ports/IVaultPort";
export const VAULT_PORT_KEY: InjectionKey<IVaultPort> = Symbol("IVaultPort");

/** Injection key for the wallet port (Ports) */
import type { IWalletPort } from "./domain/ports/IWalletPort";
export const WALLET_PORT_KEY: InjectionKey<IWalletPort> = Symbol("IWalletPort");

/** Injection key for the crypto metrics port (Ports) */
import type { ICryptoMetricsPort } from "./domain/ports/ICryptoMetricsPort";
export const CRYPTO_METRICS_PORT_KEY: InjectionKey<ICryptoMetricsPort> =
  Symbol("ICryptoMetricsPort");

/** Injection key for the settings port (Ports) */
import type { ISettingsPort } from "./domain/ports/ISettingsPort";
export const SETTINGS_PORT_KEY: InjectionKey<ISettingsPort> =
  Symbol("ISettingsPort");
