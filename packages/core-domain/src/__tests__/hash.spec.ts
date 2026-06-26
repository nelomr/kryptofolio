import { describe, it, expect } from 'vitest'
import { generateIdHash } from '../domain/services/TransactionHashService'

describe('generateIdHash', () => {
  it('should generate a deterministic hash for the same data', async () => {
    const data1 = {
      timestamp: '2023-12-01',
      amount_in: '500',
      asset_in: 'ETH',
      tx_type: 'BUY',
      account_id: '10000000-0000-0000-0000-000000000001'
    } as any

    const data2 = {
      timestamp: '2023-12-01',
      amount_in: '500',
      asset_in: 'ETH',
      tx_type: 'buy', // case difference
      account_id: '10000000-0000-0000-0000-000000000001'
    } as any

    const hash1 = await generateIdHash(data1)
    const hash2 = await generateIdHash(data2)

    expect(hash1).toBeDefined()
    expect(hash1).toBeTypeOf('string')
    expect(hash1).toEqual(hash2)
  })

  it('should generate different hashes for different data', async () => {
    const data1 = {
      timestamp: '2023-12-01',
      amount_in: '500',
      asset_in: 'ETH',
      tx_type: 'BUY',
      account_id: '10000000-0000-0000-0000-000000000001'
    } as any

    const data2 = {
      timestamp: '2023-12-01',
      amount_in: '500',
      asset_in: 'ETH',
      tx_type: 'BUY',
      account_id: '10000000-0000-0000-0000-000000000002' // different account
    } as any

    const hash1 = await generateIdHash(data1)
    const hash2 = await generateIdHash(data2)

    expect(hash1).not.toEqual(hash2)
  })

  it('should prioritize native tx_id if present', async () => {
    const data1 = {
      tx_id: 'native-blockchain-hash-123',
      timestamp: '2023-12-01T12:00:00Z',
      amount_in: '500',
      asset_in: 'ETH',
      tx_type: 'BUY'
    } as any

    const data2 = {
      tx_id: 'native-blockchain-hash-123',
      timestamp: '2023-12-02T12:00:00Z', // Different timestamp
      amount_in: '100', // Different amount
      asset_in: 'BTC',
      tx_type: 'SELL'
    } as any

    const hash1 = await generateIdHash(data1)
    const hash2 = await generateIdHash(data2)

    expect(hash1).toEqual(hash2) // Because tx_id matches, it shouldn't hash other fields
    // and it shouldn't just be the plain tx_id either, or it could be.
    // Let's assume it hashes the tx_id for consistency, or returns tx_id directly.
    // The requirement says "It must prioritize native tx_id if present."
  })
})
