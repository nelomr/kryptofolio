import type { ISettingsPort } from '@/core/domain/ports/ISettingsPort';
import type { FiatCurrency } from '@kryptofolio/core-domain';
import { SUPPORTED_CURRENCIES } from '@kryptofolio/shared-types';

/**
 * UpdateBaseCurrencyUseCase
 *
 * Application Use Case — orchestrates the persistence of the user's preferred
 * base fiat currency. Follows the Functional Sandwich pattern:
 *   1. Impure effect: validate input
 *   2. Pure transformation: normalize currency code
 *   3. Impure effect: persist via ISettingsPort
 */
export class UpdateBaseCurrencyUseCase {
  private readonly settingsPort: ISettingsPort;

  constructor(settingsPort: ISettingsPort) {
    this.settingsPort = settingsPort;
  }

  async execute(currency: FiatCurrency): Promise<void> {
    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      throw new Error(`[UpdateBaseCurrencyUseCase] Unsupported currency: ${currency}`);
    }
    await this.settingsPort.setBaseCurrency(currency);
  }
}
