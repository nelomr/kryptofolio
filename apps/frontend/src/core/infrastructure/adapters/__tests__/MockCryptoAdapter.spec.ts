import { describe, it, expect } from 'vitest';
import { MockCryptoAdapter } from '../MockCryptoAdapter';

// We just ensure the adapter instantiates correctly
describe('MockCryptoAdapter', () => {
  it('instantiates correctly', () => {
    const adapter = new MockCryptoAdapter();
    expect(adapter).toBeDefined();
  });
});
