import type { ISettingsPort } from '@/core/domain/ports/ISettingsPort';

/**
 * ToggleActiveMarketProviderUseCase — Application Use Case.
 *
 * Allows the UI to update the global active market provider (e.g. from Kraken to Binance).
 * 
 * Architectural rules:
 *  - No Vue, Axios, or framework imports — pure TypeScript.
 *  - Inputs are primitives — LLM-tool-ready.
 *  - Delegates all I/O to the ISettingsPort.
 */
export class ToggleActiveMarketProviderUseCase {
  private readonly settingsPort: ISettingsPort;

  constructor(settingsPort: ISettingsPort) {
    this.settingsPort = settingsPort;
  }

  /**
   * Set the active market provider globally.
   *
   * @param providerId — The ID of the provider to activate (e.g., 'kraken', 'binance').
   */
  async execute(providerId: string): Promise<void> {
    await this.settingsPort.setActiveMarketProvider(providerId);
  }
}
