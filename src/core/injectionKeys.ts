/**
 * Injection Keys — Symbols for Vue's provide/inject DI system.
 *
 * Using typed InjectionKey<T> ensures that `inject()` returns the correct
 * interface without manual type casting. The Symbol ensures the key is
 * globally unique, preventing naming collisions.
 *
 * @see openspec/specs/hexagonal-architecture/spec.md
 */

import type { InjectionKey } from 'vue'
import type { ICryptoPortfolioRepository } from './domain/repositories/ICryptoPortfolioRepository'
import type { ITaxRepository } from './domain/repositories/ITaxRepository'

/** Injection key for the portfolio repository (Ports) */
export const PORTFOLIO_REPO_KEY: InjectionKey<ICryptoPortfolioRepository> = Symbol(
  'ICryptoPortfolioRepository',
)

/** Injection key for the tax repository (Ports) */
export const TAX_REPO_KEY: InjectionKey<ITaxRepository> = Symbol('ITaxRepository')

/** Injection key for the i18n port (Ports) */
import type { I18nPort } from './domain/ports/I18nPort'
export const I18N_PORT_KEY: InjectionKey<I18nPort> = Symbol('I18nPort')
