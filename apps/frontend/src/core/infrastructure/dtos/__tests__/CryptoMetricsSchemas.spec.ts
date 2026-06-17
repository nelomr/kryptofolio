import { AssetAllocationItemSchema, AssetAllocationResponseSchema, DrawdownPointSchema } from '../CryptoMetricsSchemas'

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

  describe('DrawdownPointSchema', () => {
    it('should correctly parse and transform a valid drawdown point', () => {
      const raw = {
        ts: 1672531200,
        drawdown_percent: -12.34
      }
      const result = DrawdownPointSchema.parse(raw)
      expect(result).toEqual({
        timestamp: 1672531200,
        drawdownPercent: -12.34
      })
    })

    it('should bound drawdownPercent to max 0', () => {
      const raw = {
        ts: 1672531200,
        drawdown_percent: 0.5
      }
      const result = DrawdownPointSchema.parse(raw)
      expect(result.drawdownPercent).toBe(0)
    })
  })
})
