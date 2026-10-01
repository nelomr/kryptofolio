import {
  AssetAllocationItemSchema,
  AssetAllocationResponseSchema,
  DrawdownPointSchema,
  PerformancePointSchema,
  PerformanceHistoryResponseSchema,
} from '../CryptoMetricsSchemas'

describe('CryptoMetricsSchemas', () => {
  describe('AssetAllocationItemSchema', () => {
    it('still parses the backend item shapes that now carry a quantity and a value kind', () => {
      const valued = AssetAllocationItemSchema.parse({
        kind: 'valued',
        assetId: 'BTC',
        symbol: 'BTC',
        amount: '0.5',
        allocationPct: '88.89',
        valueFiat: '2400.00',
        currency: 'USD',
      })
      const unvalued = AssetAllocationItemSchema.parse({
        kind: 'unvalued',
        assetId: 'XYZ',
        symbol: 'XYZ',
        amount: '3',
        currency: 'USD',
      })

      expect(valued.valueFiat).toBe(2400)
      expect(unvalued.symbol).toBe('XYZ')
      expect(unvalued.valueFiat).toBe(0)
    })

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

  describe('PerformancePointSchema', () => {
    it('parses a null portfolioValue to a null valueFiat, never 0', () => {
      const point = PerformancePointSchema.parse({ date: '2024-01-01', portfolioValue: null, drawdownPct: '0.0000' })

      expect(point.valueFiat).toBeNull()
    })

    it('parses an absent portfolioValue to a null valueFiat', () => {
      const point = PerformancePointSchema.parse({ date: '2024-01-01', drawdownPct: '0.0000' })

      expect(point.valueFiat).toBeNull()
    })

    it('keeps a genuine zero as 0, distinct from null', () => {
      const point = PerformancePointSchema.parse({ date: '2024-01-01', portfolioValue: '0.00' })

      expect(point.valueFiat).toBe(0)
    })

    it('no longer carries a cost basis the backend never sends', () => {
      const point = PerformancePointSchema.parse({ date: '2024-01-01', portfolioValue: '10.00', costBasisFiat: '5', cost: '5' })

      expect(point).not.toHaveProperty('costBasisFiat')
    })
  })

  describe('PerformanceHistoryResponseSchema summary', () => {
    const series = (values: Array<string | null>) =>
      values.map((portfolioValue, i) => ({ date: `2024-01-0${i + 1}`, portfolioValue, drawdownPct: '0.0000' }))

    it('derives the return from the first and last non-null points', () => {
      const { metrics } = PerformanceHistoryResponseSchema.parse(series(['100.00', '110.00', '150.00']))

      expect(metrics.returnFiat).toBe(50)
      expect(metrics.returnPercent).toBe(50)
    })

    it('skips a leading run of nulls', () => {
      const { metrics, history } = PerformanceHistoryResponseSchema.parse(series([null, null, '100.00', '120.00']))

      expect(history).toHaveLength(4)
      expect(metrics.returnFiat).toBe(20)
      expect(metrics.returnPercent).toBe(20)
    })

    it('reports a null return when fewer than two points are non-null', () => {
      const one = PerformanceHistoryResponseSchema.parse(series([null, '100.00']))
      const none = PerformanceHistoryResponseSchema.parse(series([null, null]))

      expect(one.metrics.returnFiat).toBeNull()
      expect(one.metrics.returnPercent).toBeNull()
      expect(none.metrics.returnFiat).toBeNull()
      expect(none.metrics.returnPercent).toBeNull()
    })

    it('does not divide by a zero first value', () => {
      const { metrics } = PerformanceHistoryResponseSchema.parse(series(['0.00', '50.00']))

      expect(metrics.returnFiat).toBe(50)
      expect(metrics.returnPercent).toBe(0)
    })
  })
})
