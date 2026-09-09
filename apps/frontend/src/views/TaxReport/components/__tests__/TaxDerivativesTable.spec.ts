/**
 * TaxDerivativesTable — the null render gates on the Amount/PnL/Fees-Funding columns.
 *
 * @see openspec/changes/adopt-fiscal-money-value-object/design.md
 */

import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { Money } from '@kryptofolio/core-domain';
import TaxDerivativesTable from '../TaxDerivativesTable.vue';
import type { TaxDerivativeEntity } from '@/core/domain/models/FiscalEntities';
import { TransactionIdSchema } from '@/core/infrastructure/dtos/BrandedTypeSchemas';

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

function derivative(
  overrides: Omit<Partial<TaxDerivativeEntity>, 'id'> & { id: string },
): TaxDerivativeEntity {
  const { id, ...rest } = overrides;
  return {
    id: TransactionIdSchema.parse(id),
    type: 'FUTURES_TRADE',
    contractSymbol: 'pf_btcusd',
    underlyingAsset: 'btc',
    amount: new Money('1'),
    tradePrice: new Money('60000'),
    realizedPnl: new Money('100'),
    fees: new Money('1'),
    funding: new Money('1'),
    timestamp: new Date('2024-01-01T00:00:00Z'),
    ...rest,
  };
}

describe('TaxDerivativesTable — null render gates on Amount/PnL/Fees-Funding', () => {
  it('renders "—" and not "€0.00"/"0" for a fully unresolved row', () => {
    const row = derivative({
      id: 'ftx-null',
      amount: null,
      tradePrice: null,
      realizedPnl: null,
      fees: null,
      funding: null,
    });
    const wrapper = mount(TaxDerivativesTable, { props: { transactions: [row] } });
    const text = wrapper.text();
    expect(text).toContain('—');
    expect(text).not.toContain('€0.00');
  });

  it('renders a resolved zero PnL and net impact as an actual value, not suppressed', () => {
    const row = derivative({
      id: 'ftx-zero',
      realizedPnl: new Money('0'),
      fees: new Money('0'),
      funding: new Money('0'),
    });
    const wrapper = mount(TaxDerivativesTable, { props: { transactions: [row] } });
    expect(wrapper.text()).toContain('€0.00');
  });

  it('never passes a null realizedPnl/net-impact into a formatter that fabricates a zero', () => {
    const row = derivative({
      id: 'ftx-partial',
      realizedPnl: null,
      fees: new Money('5'),
      funding: null,
    });
    const wrapper = mount(TaxDerivativesTable, { props: { transactions: [row] } });
    // Neither the PnL cell nor the net-impact cell may render a fabricated zero for these
    // unresolved figures — only the fee breakdown line (which reads `fees` alone, resolved here)
    // is allowed to show a currency value.
    const cells = wrapper.findAll('td');
    const pnlCell = cells[5]!.text();
    const netImpactCell = cells[6]!.text();
    expect(pnlCell).toContain('—');
    expect(pnlCell).not.toContain('€0.00');
    expect(netImpactCell).toContain('—');
  });
});
