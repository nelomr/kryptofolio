/**
 * The dictionaries are checked against the canonical vocabularies rather than against each other.
 *
 * A hand-written list would agree with whatever it was written from; driving the assertions off
 * `FIFO_QUALITY_FLAGS`, `DISPOSAL_TYPES` and `TAX_LOT_STATUSES` means adding a member to any of them
 * fails here until both languages carry it.
 */

import { describe, it, expect } from 'vitest'
import {
  DISPOSAL_TYPES,
  FIFO_QUALITY_FLAGS,
  MANUAL_VALUE_PROVENANCE,
  TAX_LOT_STATUSES,
} from '@kryptofolio/shared-types'
import { en } from '../dictionaries/en'
import { es } from '../dictionaries/es'
import {
  disposalTypeLabelKey,
  qualityFlagExplanationKey,
  qualityFlagLabelKey,
} from '@/views/TaxReport/composables/useTaxCalculations'

const DICTIONARIES = { en, es } as const

describe.each(Object.entries(DICTIONARIES))('%s dictionary', (_name, dictionary) => {
  const keys = dictionary as Record<string, string>

  it.each(FIFO_QUALITY_FLAGS)('carries a label and an explanation for %s', (flag) => {
    // A code with no explanation is something the user cannot act on.
    expect(keys[qualityFlagLabelKey(flag)]).toBeTruthy()
    expect(keys[qualityFlagExplanationKey(flag)]).toBeTruthy()
  })

  it.each(DISPOSAL_TYPES)('carries a label for the %s disposal type', (disposalType) => {
    expect(keys[disposalTypeLabelKey(disposalType)]).toBeTruthy()
  })

  it.each(TAX_LOT_STATUSES)('carries a label for lot status %s', (status) => {
    expect(keys[`lot_status.${status.toLowerCase()}`]).toBeTruthy()
  })

  it('no longer carries the retired "sold" status label', () => {
    // `lot_status.sold` was applied to untouched lots and `lot_status.open` to consumed ones.
    // Removing the key rather than the usage is what stops the inversion being reintroduced.
    expect(keys['lot_status.sold']).toBeUndefined()
  })

  it('carries a marker and a description for a manually declared value', () => {
    expect(MANUAL_VALUE_PROVENANCE).toContain('MANUAL')
    expect(keys['value_provenance.manual']).toBeTruthy()
    expect(keys['value_provenance.manual_desc']).toBeTruthy()
  })

  it.each([
    'custody.acquired_at',
    'custody.held_in',
    'custody.synthetic',
    'custody.synthetic_desc',
    'custody.sub_wallet',
    'custody.sub_wallet_desc',
  ])('carries the custody label %s', (key) => {
    expect(keys[key]).toBeTruthy()
  })

  it('carries no UI emoji, per the design system', () => {
    const emoji = /\p{Extended_Pictographic}/u
    const offenders = Object.entries(keys).filter(([, value]) => emoji.test(value))

    expect(offenders.map(([key]) => key)).toEqual([])
  })
})

describe('dictionary parity', () => {
  it('declares the same key set in both languages', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort())
  })
})
