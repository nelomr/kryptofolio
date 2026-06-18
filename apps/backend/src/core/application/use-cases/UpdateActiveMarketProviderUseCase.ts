import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort';
import type { MarketDataOrchestrator } from '../services/MarketDataOrchestrator';
import type { IMarketDataProvider } from '../../domain/ports/IMarketDataProvider';

export class UpdateActiveMarketProviderUseCase {
  private readonly userSettingsPort: IUserSettingsPort;
  private readonly orchestrator: MarketDataOrchestrator;
  private readonly providers: Record<string, IMarketDataProvider>;

  constructor(
    userSettingsPort: IUserSettingsPort,
    orchestrator: MarketDataOrchestrator,
    providers: Record<string, IMarketDataProvider>
  ) {
    this.userSettingsPort = userSettingsPort;
    this.orchestrator = orchestrator;
    this.providers = providers;
  }

  async execute(providerId: string): Promise<void> {
    const provider = this.providers[providerId];
    if (!provider) {
      throw new Error(`Provider ${providerId} is not registered`);
    }

    // Save choice in settings
    await this.userSettingsPort.setSetting('active_market_provider', providerId);

    // Switch it live in the orchestrator
    await this.orchestrator.activate(provider);
  }
}
