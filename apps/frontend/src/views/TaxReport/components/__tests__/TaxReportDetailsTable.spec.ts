/**
 * TaxReportDetailsTable — the fee column's D14 render difference.
 *
 * A `null` sale_fee now renders `—`, where it used to render `€0.00` — the last of the change's
 * four deliberate render differences (see design.md D14 point 2).
 *
 * @see openspec/changes/adopt-fiscal-money-value-object/design.md D14
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { Money } from '@kryptofolio/core-domain';
import TaxReportDetailsTable from '../TaxReportDetailsTable.vue';
import type { TaxLotHistoryEvent } from '@/core/domain/models/FiscalEntities';

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

function auditEvent(overrides: Partial<TaxLotHistoryEvent> = {}): TaxLotHistoryEvent {
  return {
    id: 'evt-1',
    disposalDate: new Date('2024-06-01T00:00:00Z'),
    amountFromLot: new Money('1'),
    salePrice: { kind: 'NATIVE', amount: '100', currency: 'EUR' },
    gainLoss: { kind: 'NATIVE', amount: '10', currency: 'EUR' },
    saleFeeEur: null,
    isTaxable: true,
    disposalType: 'SELL',
    operationType: 'SELL',
    ...overrides,
  };
}

describe('TaxReportDetailsTable — the fee column renders — for a null sale_fee (task 7.5, D14)', () => {
  it('renders "—" for an audit-trail row whose sale_fee is null, not "€0.00"', () => {
    const wrapper = mount(TaxReportDetailsTable, {
      props: { auditTrail: [auditEvent({ saleFeeEur: null })] },
    });

    const row = wrapper.get('tbody tr');
    expect(row.text()).toContain('—');
    expect(row.text()).not.toContain('€0.00');
  });

  it('renders the resolved fee figure for a row whose sale_fee is a real Money', () => {
    const wrapper = mount(TaxReportDetailsTable, {
      props: { auditTrail: [auditEvent({ saleFeeEur: new Money('1.5') })] },
    });

    const row = wrapper.get('tbody tr');
    expect(row.text()).toContain('€1.50');
  });
});
