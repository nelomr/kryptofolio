import { describe, it, expect, vi } from 'vitest';
import { SyncExchangeRatesUseCase } from '../SyncExchangeRatesUseCase';
import type { ISettingsPort } from '@/core/domain/ports/ISettingsPort';

describe('SyncExchangeRatesUseCase', () => {
  it('should call settingsPort.syncExchangeRates', async () => {
    const mockSettingsPort = {
      syncExchangeRates: vi.fn().mockResolvedValue(undefined),
    } as unknown as ISettingsPort;

    const useCase = new SyncExchangeRatesUseCase(mockSettingsPort);

    await useCase.execute();

    expect(mockSettingsPort.syncExchangeRates).toHaveBeenCalledTimes(1);
  });

  it('should throw if settingsPort throws', async () => {
    const error = new Error('Sync failed');
    const mockSettingsPort = {
      syncExchangeRates: vi.fn().mockRejectedValue(error),
    } as unknown as ISettingsPort;

    const useCase = new SyncExchangeRatesUseCase(mockSettingsPort);

    await expect(useCase.execute()).rejects.toThrow('Sync failed');
  });
});
