/**
 * TaxTransactionsTable — sort ordering past the float boundary, and the D11 null-vs-zero
 * render gate on the Total/Price/Amount cells.
 *
 * @see openspec/changes/adopt-fiscal-money-value-object/design.md D11
 */

import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { Money } from '@kryptofolio/core-domain';
import TaxTransactionsTable from '../TaxTransactionsTable.vue';
import type { TaxTransactionEntity } from '@/core/domain/models/FiscalEntities';
import { TransactionIdSchema } from '@/core/infrastructure/dtos/BrandedTypeSchemas';

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

function tx(
  overrides: Omit<Partial<TaxTransactionEntity>, 'id'> & { id: string },
): TaxTransactionEntity {
  const { id, ...rest } = overrides;
  return {
    id: TransactionIdSchema.parse(id),
    type: 'BUY',
    symbol: 'BTC',
    amount: new Money('1'),
    totalEur: new Money('1'),
    priceEur: new Money('1'),
    feeEur: null,
    timestamp: new Date('2024-01-01T00:00:00Z'),
    ...rest,
  };
}

describe('TaxTransactionsTable — Money sort and null render gates (task 5.5, 5.7)', () => {
  it('orders two transactions whose priceEur differ only past the float boundary, in both directions', async () => {
    const low = tx({ id: 'tx-low', symbol: 'LOW', priceEur: new Money('0.1000000000000001') });
    const high = tx({ id: 'tx-high', symbol: 'HIGH', priceEur: new Money('0.1000000000000002') });

    const wrapper = mount(TaxTransactionsTable, {
      props: { transactions: [low, high] },
    });

    // Default sort is by timestamp desc; switch to the Price column.
    const priceHeader = wrapper.findAll('th').find((h) => h.text().includes('tax.col.price'));
    expect(priceHeader).toBeTruthy();

    await priceHeader!.trigger('click'); // first click on a new key: desc
    const rowsDesc = wrapper.findAll('tbody tr');
    expect(rowsDesc.length).toBe(2);
    const symbolOf = (rows: typeof rowsDesc) =>
      rows.map((r) => (r.text().includes('HIGH') ? 'HIGH' : 'LOW'));
    const descOrder = symbolOf(rowsDesc);
    // desc: the row with the higher priceEur ('...0002') renders first.
    expect(descOrder).toEqual(['HIGH', 'LOW']);

    await priceHeader!.trigger('click'); // second click: asc — must invert row order
    const rowsAsc = wrapper.findAll('tbody tr');
    expect(symbolOf(rowsAsc)).toEqual(['LOW', 'HIGH']);
  });

  it('renders "—" and not "€0.00" for a null totalEur, priceEur or amount', () => {
    const row = tx({ id: 'tx-null', totalEur: null, priceEur: null, amount: null });
    const wrapper = mount(TaxTransactionsTable, { props: { transactions: [row] } });
    const text = wrapper.text();
    expect(text).toContain('—');
    expect(text).not.toContain('€0.00');
  });

  it('renders a resolved zero as an actual value, not suppressed', () => {
    const row = tx({ id: 'tx-zero', totalEur: new Money('0'), priceEur: new Money('0'), amount: new Money('0') });
    const wrapper = mount(TaxTransactionsTable, { props: { transactions: [row] } });
    expect(wrapper.text()).toContain('€0.00');
  });
});
