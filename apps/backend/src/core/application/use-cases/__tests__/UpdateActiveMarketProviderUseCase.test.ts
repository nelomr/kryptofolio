import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateActiveMarketProviderUseCase } from '../UpdateActiveMarketProviderUseCase';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort';
import type { MarketDataOrchestrator } from '../../services/MarketDataOrchestrator';

describe('UpdateActiveMarketProviderUseCase', () => {
  let mockUserSettingsPort: import('vitest').Mocked<IUserSettingsPort>;
  let mockOrchestrator: { activate: import('vitest').Mock, disableProvider: import('vitest').Mock };
  let mockProviders: Record<string, any>;

  beforeEach(() => {
    mockUserSettingsPort = {
      getSetting: vi.fn(),
      setSetting: vi.fn(),
    } as unknown as import('vitest').Mocked<IUserSettingsPort>;

    mockOrchestrator = {
      activate: vi.fn(),
      disableProvider: vi.fn(),
    };

    mockProviders = {
      kraken: { id: 'kraken', type: 'crypto' },
      coingecko: { id: 'coingecko', type: 'crypto' },
    };
  });

  it('should update the setting and activate the new provider', async () => {
    const useCase = new UpdateActiveMarketProviderUseCase(
      mockUserSettingsPort,
      mockOrchestrator as unknown as MarketDataOrchestrator,
      mockProviders
    );

    await useCase.execute('coingecko');

    expect(mockUserSettingsPort.setSetting).toHaveBeenCalledWith('active_market_provider', 'coingecko');
    expect(mockOrchestrator.activate).toHaveBeenCalledWith(mockProviders['coingecko']);
  });

  it('should throw an error if the provider is not registered', async () => {
    const useCase = new UpdateActiveMarketProviderUseCase(
      mockUserSettingsPort,
      mockOrchestrator as unknown as MarketDataOrchestrator,
      mockProviders
    );

    await expect(useCase.execute('unknown')).rejects.toThrow('Provider unknown is not registered');
  });
});
