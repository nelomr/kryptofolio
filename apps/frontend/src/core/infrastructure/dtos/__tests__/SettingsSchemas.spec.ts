import { describe, it, expect } from 'vitest'
import { parseSelectableAccounts } from '../SettingsSchemas'

describe('parseSelectableAccounts', () => {
  const VENUE = {
    value: 'kraken',
    label: 'Kraken',
    type: 'exchange',
    parentAccountId: null,
  }
  const SUB_WALLET = {
    value: 'kraken:earn',
    label: 'Kraken / earn',
    type: 'exchange',
    parentAccountId: 'kraken',
  }

  it('maps the selector payload onto the domain entity', () => {
    const accounts = parseSelectableAccounts({ accounts: [VENUE, SUB_WALLET] })

    expect(accounts).toEqual([
      { id: 'kraken', name: 'Kraken', type: 'exchange', parentAccountId: null },
      { id: 'kraken:earn', name: 'Kraken / earn', type: 'exchange', parentAccountId: 'kraken' },
    ])
  })

  it('treats a missing parentAccountId as no parent rather than as undefined', () => {
    const accounts = parseSelectableAccounts({
      accounts: [{ value: 'kraken', label: 'Kraken', type: 'exchange' }],
    })

    expect(accounts[0]?.parentAccountId).toBeNull()
  })

  it('rejects a payload that carries a synthetic account', () => {
    expect(() =>
      parseSelectableAccounts({
        accounts: [
          VENUE,
          {
            value: 'ownwallet-XRP',
            label: 'Own Wallet XRP',
            type: 'wallet',
            parentAccountId: null,
            isSynthetic: true,
          },
        ],
      }),
    ).toThrow(/synthetic/i)
  })

  it('rejects a payload whose account has no identifier', () => {
    expect(() =>
      parseSelectableAccounts({ accounts: [{ label: 'Kraken', type: 'exchange' }] }),
    ).toThrow()
  })

  it('rejects an error payload instead of reading it as an empty account list', () => {
    expect(() => parseSelectableAccounts({ error: 'FAILED_TO_READ_ACCOUNTS' })).toThrow()
  })
})
