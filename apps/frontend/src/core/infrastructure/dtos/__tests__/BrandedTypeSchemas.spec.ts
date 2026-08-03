import { describe, it, expect } from 'vitest'
import { AccountIdSchema, TransactionIdHashSchema } from '../BrandedTypeSchemas'

describe('AccountIdSchema', () => {
  it('brands a non-empty string as an AccountId', () => {
    const result = AccountIdSchema.safeParse('ownwallet-XRP')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('ownwallet-XRP')
    }
  })

  it('rejects an empty string', () => {
    expect(AccountIdSchema.safeParse('').success).toBe(false)
  })
})

describe('TransactionIdHashSchema', () => {
  it('brands a non-empty string as a TransactionIdHash', () => {
    const result = TransactionIdHashSchema.safeParse('abc123hash')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('abc123hash')
    }
  })

  it('rejects an empty string', () => {
    expect(TransactionIdHashSchema.safeParse('').success).toBe(false)
  })
})
