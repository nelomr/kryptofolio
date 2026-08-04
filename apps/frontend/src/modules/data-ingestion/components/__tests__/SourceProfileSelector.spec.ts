/**
 * The detect-or-choose control for the source format, and the report of what could be verified.
 *
 * Presentational only: the detection and the invariant outcome are computed by the wizard and passed
 * in, so nothing here decides anything. The two properties worth asserting are that an ambiguity is
 * offered as a choice rather than resolved by picking a candidate, and that an unverified convention
 * is never presented as a verified one.
 */

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { ClassValue } from 'clsx'
import type { SourceProfileDetection } from '@kryptofolio/core-domain'
import type { SourceProfileId } from '@kryptofolio/shared-types'
import SourceProfileSelector from '../SourceProfileSelector.vue'
import BaseSelect from '@/components/ui/select/BaseSelect.vue'
import { I18N_PORT_KEY } from '@/core/injectionKeys'
import type { InvariantStatus } from '../../composables/useCsvImportWizard'

vi.mock('@/lib/utils', () => ({ cn: (...args: ClassValue[]) => args.join(' ') }))

function mountSelector(props: {
  modelValue?: SourceProfileId | ''
  detection?: SourceProfileDetection
  invariantStatus?: InvariantStatus
  rowsChecked?: number | null
}) {
  return mount(SourceProfileSelector, {
    props: {
      modelValue: 'kraken-spot',
      detection: { kind: 'RESOLVED', profileId: 'kraken-spot' } satisfies SourceProfileDetection,
      invariantStatus: 'VERIFIED' as InvariantStatus,
      rowsChecked: 34,
      ...props,
    },
    global: {
      stubs: { BaseSelect: true },
      provide: {
        [I18N_PORT_KEY as symbol]: {
          translate: (key: string) => key,
          setLanguage: vi.fn(),
          getCurrentLanguage: vi.fn().mockReturnValue('en'),
        },
      },
    },
  })
}

const select = (wrapper: ReturnType<typeof mountSelector>) => wrapper.findComponent(BaseSelect)

describe('the source format control', () => {
  it('offers every measured source plus the fallback, so a wrong detection is correctable', () => {
    const options = select(mountSelector({})).props('options') as { value: string }[]
    const values = options.map((o) => o.value)
    expect(values).toContain('kraken-spot')
    expect(values).toContain('bit2me-spot')
    expect(values).toContain('generic')
    expect(values).toHaveLength(7)
  })

  it('passes the user’s choice up rather than deciding anything itself', async () => {
    const wrapper = mountSelector({})
    select(wrapper).vm.$emit('update:modelValue', 'bitvavo-spot')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')).toEqual([['bitvavo-spot']])
  })

  it('shows every candidate and selects none when the header row is ambiguous', () => {
    const wrapper = mountSelector({
      modelValue: '',
      detection: { kind: 'AMBIGUOUS', candidates: ['bitunix-spot', 'bitvavo-spot'] },
      invariantStatus: 'PROFILE_NOT_CHOSEN',
      rowsChecked: null,
    })

    expect(select(wrapper).props('modelValue')).toBe('')
    const text = wrapper.text()
    expect(text).toContain('ingestion.profile.ambiguous')
    expect(text).toContain('bitunix-spot')
    expect(text).toContain('bitvavo-spot')
  })

  it('reports a verified invariant with the count it checked', () => {
    const wrapper = mountSelector({ invariantStatus: 'VERIFIED', rowsChecked: 34 })
    expect(wrapper.text()).toContain('ingestion.profile.invariant.verified')
    // Rule 2: a digit is set in the mono face wherever it appears.
    expect(wrapper.find('[data-testid="invariant-rows"]').classes()).toContain('font-mono')
    expect(wrapper.find('[data-testid="invariant-rows"]').text()).toBe('34')
  })

  it('distinguishes the outcomes and never calls an unverified one verified', () => {
    const notDeclared = mountSelector({ invariantStatus: 'NOT_DECLARED', rowsChecked: null })
    expect(notDeclared.text()).toContain('ingestion.profile.invariant.not_declared')
    expect(notDeclared.text()).not.toContain('ingestion.profile.invariant.verified')

    const couldNot = mountSelector({ invariantStatus: 'COULD_NOT_VERIFY', rowsChecked: null })
    expect(couldNot.text()).toContain('ingestion.profile.invariant.could_not_verify')
    expect(couldNot.text()).not.toContain('ingestion.profile.invariant.verified')

    const failed = mountSelector({ invariantStatus: 'FAILED', rowsChecked: null })
    expect(failed.text()).toContain('ingestion.profile.invariant.failed')
    expect(failed.find('.text-loss').exists()).toBe(true)
  })
})
