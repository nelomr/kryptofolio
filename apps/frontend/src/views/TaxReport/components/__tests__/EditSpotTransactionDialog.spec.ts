/**
 * EditSpotTransactionDialog (design.md D9, group 11): editable fields beside their original
 * values, client-side validation, loading/pending states spanning the full save-through-rebuild
 * request, the D6 balance-check outcome, 422 field-error mapping, and restore-original.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { Money } from '@kryptofolio/core-domain'
import { CalendarDate } from '@internationalized/date'
import EditSpotTransactionDialog from '../EditSpotTransactionDialog.vue'
import type { TaxTransactionEntity } from '@/core/domain/models/FiscalEntities'
import { TransactionIdSchema } from '@/core/infrastructure/dtos/BrandedTypeSchemas'

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const toastSuccess = vi.fn()
const toastWarning = vi.fn()
const toastError = vi.fn()
vi.mock('vue-sonner', () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), warning: (...a: unknown[]) => toastWarning(...a), error: (...a: unknown[]) => toastError(...a) },
}))

const setMutateAsync = vi.fn()
const removeMutateAsync = vi.fn()
const setIsLoading = { value: false }

vi.mock('@/composables/queries/useTaxMutations', () => ({
  useSetSpotTransactionOverrideMutation: () => ({
    mutateAsync: setMutateAsync,
    isLoading: setIsLoading,
  }),
  useRemoveSpotTransactionOverrideMutation: () => ({
    mutateAsync: removeMutateAsync,
    isLoading: { value: false },
  }),
}))

function transaction(overrides: Partial<TaxTransactionEntity> = {}): TaxTransactionEntity {
  return {
    id: TransactionIdSchema.parse('tx-1'),
    idHash: 'hash-1',
    type: 'BUY',
    symbol: 'BTC',
    amount: new Money('1'),
    totalEur: new Money('40000'),
    priceEur: new Money('40000'),
    feeEur: null,
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
    fiatCurrency: 'EUR',
    override: { kind: 'NONE' },
    ...overrides,
  }
}

describe('EditSpotTransactionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setIsLoading.value = false
  })

  it('renders each editable field pre-filled with the original value', () => {
    const wrapper = mount(EditSpotTransactionDialog, {
      global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
      props: { open: true, transaction: transaction() },
    })

    const priceInput = wrapper.find('[data-testid="field-price_fiat"]')
      .element as HTMLInputElement
    expect(priceInput.value).toBe('40000')
  })

  it("submits the row's own native fiatCurrency on a price edit, not a hard-coded one", async () => {
    setMutateAsync.mockResolvedValue({
      applied: 1,
      materialization: null,
      pendingReview: 0,
      balanceCheck: { kind: 'CLEAN' },
    })

    const wrapper = mount(EditSpotTransactionDialog, {
      global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
      props: { open: true, transaction: transaction({ fiatCurrency: 'USD', priceEur: new Money('43000') }) },
    })

    await wrapper.find('[data-testid="field-price_fiat"]').setValue('45000')
    await wrapper.find('[data-testid="save-button"]').trigger('click')
    await flushPromises()

    const [call] = setMutateAsync.mock.calls[0]
    expect(call.payload.price_fiat).toEqual({ kind: 'SET', value: '45000', fiatCurrency: 'USD' })
  })

  it('shows the asset symbol beside amount_in and the row\'s own fiatCurrency beside price_fiat/total_fiat', () => {
    const wrapper = mount(EditSpotTransactionDialog, {
      global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
      props: { open: true, transaction: transaction({ symbol: 'XRP', fiatCurrency: 'USD' }) },
    })

    expect(wrapper.get('[data-testid="field-amount_in-unit"]').text()).toBe('XRP')
    expect(wrapper.get('[data-testid="field-price_fiat-unit"]').text()).toBe('USD')
    expect(wrapper.get('[data-testid="field-total_fiat-unit"]').text()).toBe('USD')
  })

  it('falls back to EUR beside price_fiat/total_fiat when the row has no fiatCurrency', () => {
    const wrapper = mount(EditSpotTransactionDialog, {
      global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
      props: { open: true, transaction: transaction({ fiatCurrency: undefined }) },
    })

    expect(wrapper.get('[data-testid="field-price_fiat-unit"]').text()).toBe('EUR')
  })

  it('falls back to assetIn over symbol beside amount_in when the row has a distinct incoming asset', () => {
    const wrapper = mount(EditSpotTransactionDialog, {
      global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
      props: { open: true, transaction: transaction({ symbol: 'BTC', assetIn: 'ETH' }) },
    })

    expect(wrapper.get('[data-testid="field-amount_in-unit"]').text()).toBe('ETH')
  })

  describe('the timestamp field (11.15: a real date-time picker, not a raw ISO string input)', () => {
    it('shows the original date on the picker trigger, not a raw ISO string field', () => {
      const wrapper = mount(EditSpotTransactionDialog, {
        global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
        props: { open: true, transaction: transaction({ timestamp: new Date('2026-03-14T09:05:00.000Z') }) },
      })

      expect(wrapper.find('[data-testid="field-timestamp"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="field-timestamp-trigger"]').text()).toContain('2026-03-14')
      const timeInput = wrapper.get('[data-testid="field-timestamp-time"]').element as HTMLInputElement
      expect(timeInput.value).toBe('09:05')
    })

    it('changing the time preserves the original date and submits the combined ISO timestamp', async () => {
      setMutateAsync.mockResolvedValue({
        applied: 1, materialization: null, pendingReview: 0, balanceCheck: { kind: 'CLEAN' },
      })
      const wrapper = mount(EditSpotTransactionDialog, {
        global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
        props: { open: true, transaction: transaction({ timestamp: new Date('2026-03-14T09:05:00.000Z') }) },
      })

      await wrapper.get('[data-testid="field-timestamp-time"]').setValue('14:30')
      await wrapper.find('[data-testid="save-button"]').trigger('click')
      await flushPromises()

      const [call] = setMutateAsync.mock.calls[0]
      expect(call.payload.timestamp).toEqual({ kind: 'SET', value: '2026-03-14T14:30:00.000Z' })
    })

    it('selecting a new day preserves the original time and submits the combined ISO timestamp', async () => {
      setMutateAsync.mockResolvedValue({
        applied: 1, materialization: null, pendingReview: 0, balanceCheck: { kind: 'CLEAN' },
      })
      const wrapper = mount(EditSpotTransactionDialog, {
        global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
        props: { open: true, transaction: transaction({ timestamp: new Date('2026-03-14T09:05:00.000Z') }) },
      })

      await wrapper.get('[data-testid="field-timestamp-trigger"]').trigger('click')
      await flushPromises()

      const calendar = wrapper.findComponent({ name: 'Calendar' })
      expect(calendar.exists()).toBe(true)
      calendar.vm.$emit('update:modelValue', new CalendarDate(2026, 3, 20))
      await flushPromises()

      await wrapper.find('[data-testid="save-button"]').trigger('click')
      await flushPromises()

      const [call] = setMutateAsync.mock.calls[0]
      expect(call.payload.timestamp).toEqual({ kind: 'SET', value: '2026-03-20T09:05:00.000Z' })
    })
  })

  it('pre-focuses and scrolls to price_fiat when opened with initialFocusField="price_fiat"', async () => {
    const scrollIntoViewSpy = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy

    const wrapper = mount(EditSpotTransactionDialog, {
      global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
      props: { open: true, transaction: transaction(), initialFocusField: 'price_fiat' },
      attachTo: document.body,
    })
    await flushPromises()

    const priceInput = wrapper.find('[data-testid="field-price_fiat"]').element as HTMLInputElement
    expect(document.activeElement).toBe(priceInput)
    expect(scrollIntoViewSpy).toHaveBeenCalled()

    wrapper.unmount()
  })

  it('does not steal focus when opened without initialFocusField (the Ledgers-pencil path)', async () => {
    const scrollIntoViewSpy = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy

    const wrapper = mount(EditSpotTransactionDialog, {
      global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
      props: { open: true, transaction: transaction() },
      attachTo: document.body,
    })
    await flushPromises()

    expect(scrollIntoViewSpy).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('client-side validation rejects a malformed amount before any network call', async () => {
    const wrapper = mount(EditSpotTransactionDialog, {
      global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
      props: { open: true, transaction: transaction() },
    })

    await wrapper.find('[data-testid="field-price_fiat"]').setValue('not-a-number')
    await wrapper.find('[data-testid="save-button"]').trigger('click')
    await flushPromises()

    expect(setMutateAsync).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('tax.edit.error.invalid_price_fiat')
  })

  it('disables Save/Restore and shows a spinner for the full request, and cannot be dismissed while pending', async () => {
    let resolveMutation: (v: unknown) => void = () => {}
    setMutateAsync.mockReturnValue(
      new Promise((resolve) => {
        resolveMutation = resolve
      }),
    )

    const wrapper = mount(EditSpotTransactionDialog, {
      global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
      props: {
        open: true,
        transaction: transaction({ override: { kind: 'ACTIVE', editedFields: ['price_fiat'] } }),
      },
    })

    await wrapper.find('[data-testid="field-price_fiat"]').setValue('42000')
    await wrapper.find('[data-testid="save-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="save-button"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="restore-button"]').attributes('disabled')).toBeDefined()
    expect(wrapper.props('open')).toBe(true)

    resolveMutation({ applied: 1, materialization: null, pendingReview: 0, balanceCheck: { kind: 'CLEAN' } })
    await flushPromises()
  })

  it('a CLEAN result shows toast.success and closes the dialog', async () => {
    setMutateAsync.mockResolvedValue({
      applied: 1,
      materialization: null,
      pendingReview: 0,
      balanceCheck: { kind: 'CLEAN' },
    })

    const wrapper = mount(EditSpotTransactionDialog, {
      global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
      props: { open: true, transaction: transaction() },
    })

    await wrapper.find('[data-testid="field-price_fiat"]').setValue('42000')
    await wrapper.find('[data-testid="save-button"]').trigger('click')
    await flushPromises()

    expect(toastSuccess).toHaveBeenCalled()
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
  })

  it('a NEGATIVE_BALANCE result shows toast.warning, keeps the dialog open, and renders a persistent Alert', async () => {
    setMutateAsync.mockResolvedValue({
      applied: 1,
      materialization: null,
      pendingReview: 0,
      balanceCheck: {
        kind: 'NEGATIVE_BALANCE',
        entries: [{ assetId: 'BTC', accountId: 'acc-1', balance: '-0.5', tolerance: '0.001' }],
      },
    })

    const wrapper = mount(EditSpotTransactionDialog, {
      global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
      props: { open: true, transaction: transaction() },
    })

    await wrapper.find('[data-testid="field-price_fiat"]').setValue('42000')
    await wrapper.find('[data-testid="save-button"]').trigger('click')
    await flushPromises()

    expect(toastWarning).toHaveBeenCalled()
    expect(wrapper.emitted('update:open')).toBeUndefined()
    expect(wrapper.find('[data-testid="balance-warning"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('BTC')
  })

  it('a 422 field-scoped error maps to the matching field, without closing the dialog', async () => {
    setMutateAsync.mockRejectedValue(
      Object.assign(new Error('cannot retype a custody movement'), { field: 'tx_type' }),
    )

    const wrapper = mount(EditSpotTransactionDialog, {
      global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
      props: { open: true, transaction: transaction() },
    })

    await wrapper.find('[data-testid="field-price_fiat"]').setValue('42000')
    await wrapper.find('[data-testid="save-button"]').trigger('click')
    await flushPromises()

    expect(toastError).toHaveBeenCalled()
    expect(wrapper.find('[data-testid="field-error-tx_type"]').text()).toContain(
      'cannot retype a custody movement',
    )
    expect(wrapper.emitted('update:open')).toBeUndefined()
  })

  it('a non-field server error renders as a form-level Alert, without closing the dialog', async () => {
    setMutateAsync.mockRejectedValue(new Error('database is locked'))

    const wrapper = mount(EditSpotTransactionDialog, {
      global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
      props: { open: true, transaction: transaction() },
    })

    await wrapper.find('[data-testid="field-price_fiat"]').setValue('42000')
    await wrapper.find('[data-testid="save-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="form-error"]').text()).toContain('database is locked')
  })

  it('Restore is visible only when override.kind === "ACTIVE"', () => {
    const clean = mount(EditSpotTransactionDialog, {
      global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
      props: { open: true, transaction: transaction({ override: { kind: 'NONE' } }) },
    })
    expect(clean.find('[data-testid="restore-button"]').exists()).toBe(false)

    const edited = mount(EditSpotTransactionDialog, {
      global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
      props: {
        open: true,
        transaction: transaction({ override: { kind: 'ACTIVE', editedFields: ['price_fiat'] } }),
      },
    })
    expect(edited.find('[data-testid="restore-button"]').exists()).toBe(true)
  })

  it('activating Restore (after the in-dialog confirm) calls the remove mutation and closes on success', async () => {
    removeMutateAsync.mockResolvedValue({
      applied: 1,
      materialization: null,
      pendingReview: 0,
      balanceCheck: { kind: 'CLEAN' },
    })

    const wrapper = mount(EditSpotTransactionDialog, {
      global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
      props: {
        open: true,
        transaction: transaction({ override: { kind: 'ACTIVE', editedFields: ['price_fiat'] } }),
      },
    })

    await wrapper.find('[data-testid="restore-button"]').trigger('click')
    await wrapper.find('[data-testid="restore-confirm-button"]').trigger('click')
    await flushPromises()

    expect(removeMutateAsync).toHaveBeenCalledWith('hash-1')
    expect(toastSuccess).toHaveBeenCalled()
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
  })

  it('carries a DialogDescription, so reka-ui does not warn about a missing accessible description', () => {
    // Real defect found in production (browser console): `DialogContent` had a `DialogTitle` but
    // no `DialogDescription`, so reka-ui logged "Missing `Description` or `aria-describedby`" on
    // every open — this dialog was the first shadcn `Dialog` in the codebase (task 9.1), so there
    // was no established pattern yet to follow.
    const wrapper = mount(EditSpotTransactionDialog, {
      global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
      props: { open: true, transaction: transaction() },
    })

    expect(wrapper.text()).toContain('tax.edit.description')
  })
})
