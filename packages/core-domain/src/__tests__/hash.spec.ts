import { describe, it, expect } from 'vitest'
import { generateIdHash } from '../domain/services/TransactionHashService'

describe('generateIdHash', () => {
  it('should generate a deterministic hash for the same data', async () => {
    const data1 = {
      timestamp: '2023-12-01',
      amount: '500',
      asset: 'ETH',
      tx_type: 'BUY'
    } as any

    const data2 = {
      timestamp: '2023-12-01',
      amount: '500',
      asset: 'ETH',
      tx_type: 'buy' // case difference
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
      amount: '500',
      asset: 'ETH',
      tx_type: 'BUY'
    } as any

    const data2 = {
      timestamp: '2023-12-02',
      amount: '500',
      asset: 'ETH',
      tx_type: 'BUY'
    } as any

    const hash1 = await generateIdHash(data1)
    const hash2 = await generateIdHash(data2)

    expect(hash1).not.toEqual(hash2)
  })

  it('should generate same hash for raw asset/amount and directional/symbol fallbacks', async () => {
    const dataRaw = {
      timestamp: '2023-12-01T12:00:00Z',
      amount: '500',
      asset: 'ETH',
      tx_type: 'BUY'
    } as any

    const dataDirectional = {
      timestamp: '2023-12-01T12:00:00Z',
      amount_in: '500',
      asset_in: 'ETH',
      tx_type: 'BUY'
    } as any

    const dataSymbol = {
      timestamp: '2023-12-01T12:00:00Z',
      amount_out: '500',
      symbol: 'ETH',
      tx_type: 'BUY'
    } as any

    const hashRaw = await generateIdHash(dataRaw)
    const hashDirectional = await generateIdHash(dataDirectional)
    const hashSymbol = await generateIdHash(dataSymbol)

    expect(hashRaw).toEqual(hashDirectional)
    expect(hashRaw).toEqual(hashSymbol)
  })
})
