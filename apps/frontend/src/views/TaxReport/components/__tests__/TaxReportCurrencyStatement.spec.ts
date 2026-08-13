/**
 * The header has to say what currency the figures are in, and whether they were converted.
 *
 * A euro figure and a dollar figure look identical on screen, and this report is the one a user
 * files. Decision 2 makes a EUR report from USD records the correct AEAT figure, so the report is
 * not blocked — it is labelled. This suite holds the four states apart: native, converted, and
 * either of those with a period the FX ledger could not fully cover.
 */

import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import TaxReportCurrencyStatement from '../TaxReportCurrencyStatement.vue';

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

const UNCONVERTIBLE = [
  { id: 'evt-old', occurredOn: '2024-01-02', nativeAmount: '90', nativeCurrency: 'USD' },
];

describe('TaxReportCurrencyStatement.vue', () => {
  it('names the currency of a native report without claiming a conversion', () => {
    const wrapper = mount(TaxReportCurrencyStatement, {
      props: { currency: 'EUR', conversion: { kind: 'NATIVE' }, unconvertibleEvents: [] },
    });

    expect(wrapper.text()).toContain('EUR');
    // A conversion notice on a native record is the mirror image of the defect being fixed: it
    // invites the reader to distrust a figure that needs no qualification.
    expect(wrapper.text()).not.toContain('tax.currency.converted_at_event_date');
  });

  it('states the basis when the figures were converted', () => {
    const wrapper = mount(TaxReportCurrencyStatement, {
      props: { currency: 'EUR', conversion: { kind: 'CONVERTED' }, unconvertibleEvents: [] },
    });

    expect(wrapper.text()).toContain('EUR');
    // Not merely "converted": at each event's own date is the claim that makes the total a valid
    // AEAT figure rather than today's rate applied to history.
    expect(wrapper.text()).toContain('tax.currency.converted_at_event_date');
  });

  it('declares the period incomplete and names the events it could not convert', () => {
    const wrapper = mount(TaxReportCurrencyStatement, {
      props: {
        currency: 'EUR',
        conversion: { kind: 'CONVERTED' },
        unconvertibleEvents: UNCONVERTIBLE,
      },
    });

    expect(wrapper.text()).toContain('tax.currency.incomplete');
    // The identity of the event and the figure it was worth, because "something is missing" is not
    // actionable and a total silently short by one disposal reads as correct.
    expect(wrapper.text()).toContain('evt-old');
    expect(wrapper.text()).toContain('90');
    expect(wrapper.text()).toContain('USD');
  });

  it('does not announce incompleteness for a fully covered period', () => {
    const wrapper = mount(TaxReportCurrencyStatement, {
      props: { currency: 'USD', conversion: { kind: 'NATIVE' }, unconvertibleEvents: [] },
    });

    // The counterpart of the assertion above: a warning shown always carries no information.
    expect(wrapper.text()).not.toContain('tax.currency.incomplete');
  });
});
