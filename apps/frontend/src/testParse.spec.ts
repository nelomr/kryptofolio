import { describe, it, expect } from 'vitest';
import { MOCK_TAX_REPORT } from '@dashboar-portfolio/api-gateway/src/data/mockTax';
import { MockTaxReportSchema } from './core/infrastructure/dtos/MockDtoSchemas';

describe('Test parse', () => {
  it('should parse MOCK_TAX_REPORT successfully', () => {
    const parsed = MockTaxReportSchema.safeParse(MOCK_TAX_REPORT);
    if (!parsed.success) {
      console.error(JSON.stringify(parsed.error.errors, null, 2));
    }
    expect(parsed.success).toBe(true);
  });
});
