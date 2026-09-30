import { describe, it, expect } from 'vitest';
import { GetAvailableProvidersUseCase } from '../GetAvailableProvidersUseCase.js';

describe('GetAvailableProvidersUseCase', () => {
  it('returns providers each carrying a discriminated category', async () => {
    const useCase = new GetAvailableProvidersUseCase();

    const providers = await useCase.execute();

    expect(providers.length).toBeGreaterThan(0);
    for (const provider of providers) {
      expect(['exchange', 'market-data', 'ai-model']).toContain(provider.category.kind);
    }
  });
});
