import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToggleActiveMarketProviderUseCase } from '@/core/application/use-cases/ToggleActiveMarketProviderUseCase';
import type { ISettingsPort } from '@/core/domain/ports/ISettingsPort';

describe('ToggleActiveMarketProviderUseCase', () => {
  let port: import('vitest').Mocked<ISettingsPort>;
  let useCase: ToggleActiveMarketProviderUseCase;

  beforeEach(() => {
    port = {
      getLanguage: vi.fn(),
      setLanguage: vi.fn(),
      setActiveMarketProvider: vi.fn().mockResolvedValue(undefined),
      getActiveMarketProvider: vi.fn(),
    } as unknown as import('vitest').Mocked<ISettingsPort>;
    useCase = new ToggleActiveMarketProviderUseCase(port);
  });

  it('delegates setting active market provider to the port', async () => {
    await useCase.execute('binance');
    expect(port.setActiveMarketProvider).toHaveBeenCalledWith('binance');
  });

  it('propagates errors from the port', async () => {
    port.setActiveMarketProvider.mockRejectedValueOnce(new Error('Network error'));
    await expect(useCase.execute('binance')).rejects.toThrow('Network error');
  });
});
