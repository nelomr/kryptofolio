import type { ISettingsPort } from "@/core/domain/ports/ISettingsPort";

/**
 * SyncExchangeRatesUseCase
 *
 * Application use case that triggers the manual synchronization
 * of fiat exchange rates from external providers (e.g., ECB).
 */
export class SyncExchangeRatesUseCase {
  private readonly settingsPort: ISettingsPort;

  constructor(settingsPort: ISettingsPort) {
    this.settingsPort = settingsPort;
  }

  /**
   * Executes the manual synchronization.
   */
  async execute(): Promise<void> {
    await this.settingsPort.syncExchangeRates();
  }
}
