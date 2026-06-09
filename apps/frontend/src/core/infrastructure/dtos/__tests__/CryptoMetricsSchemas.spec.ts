import { describe, it, expect } from 'vitest'
import { AssetAllocationItemSchema, AssetAllocationResponseSchema } from '../CryptoMetricsSchemas'

describe('CryptoMetricsSchemas', () => {
  describe('AssetAllocationItemSchema', () => {
    it('should correctly parse and transform a valid item payload', () => {
      const raw = {
        symbol: 'BTC',
        name: 'Bitcoin',
        color: '#1e3a8a',
        allocation_pct: 45.5,
        value_fiat: 64161.2
      }
      const result = AssetAllocationItemSchema.parse(raw)
      expect(result).toEqual({
        symbol: 'BTC',
        name: 'Bitcoin',
        colorHex: '#1e3a8a',
        allocationPercent: 45.5,
        valueFiat: 64161.2
      })
    })

    it('should throw error for invalid color format', () => {
      const raw = {
        symbol: 'BTC',
        name: 'Bitcoin',
        color: 'invalid',
        allocation_pct: 45.5,
        value_fiat: 64161.2
      }
      expect(() => AssetAllocationItemSchema.parse(raw)).toThrow()
    })
  })

  describe('AssetAllocationResponseSchema', () => {
    it('should correctly parse and transform a valid response payload', () => {
      const raw = {
        assets: [
          {
            symbol: 'BTC',
            name: 'Bitcoin',
            color: '#1e3a8a',
            allocation_pct: 45.5,
            value_fiat: 64161.2
          }
        ],
        total_assets: 1,
        hhi: 3150
      }
      const result = AssetAllocationResponseSchema.parse(raw)
      expect(result).toEqual({
        items: [
          {
            symbol: 'BTC',
            name: 'Bitcoin',
            colorHex: '#1e3a8a',
            allocationPercent: 45.5,
            valueFiat: 64161.2
          }
        ],
        totalAssets: 1,
        hhiScore: 3150
      })
    })
  })
})
