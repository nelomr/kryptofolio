import { describe, it, expect } from 'vitest'
import { detectMarketTypeFromFile } from '../marketDetector'

describe('detectMarketTypeFromFile', () => {
  it('should detect FUTURES when file name contains "future"', () => {
    expect(detectMarketTypeFromFile('Kraken_Futures_2023.csv')).toBe('FUTURES')
  })

  it('should detect FUTURES when file name contains "futuro"', () => {
    expect(detectMarketTypeFromFile('operaciones_futuros_binance.xlsx')).toBe('FUTURES')
  })

  it('should detect FUTURES when file name contains "deriv"', () => {
    expect(detectMarketTypeFromFile('binance_derivatives_statement.csv')).toBe('FUTURES')
  })

  it('should default to SPOT when no futures keywords are present', () => {
    expect(detectMarketTypeFromFile('kraken_spot.csv')).toBe('SPOT')
    expect(detectMarketTypeFromFile('trades.xlsx')).toBe('SPOT')
    expect(detectMarketTypeFromFile('my_wallet_txs.csv')).toBe('SPOT')
  })

  it('should handle empty or undefined file names gracefully', () => {
    expect(detectMarketTypeFromFile('')).toBe('SPOT')
    expect(detectMarketTypeFromFile(null)).toBe('SPOT')
    expect(detectMarketTypeFromFile(undefined)).toBe('SPOT')
  })

  it('should handle case insensitivity correctly', () => {
    expect(detectMarketTypeFromFile('FUTUROS_2023.CSV')).toBe('FUTURES')
    expect(detectMarketTypeFromFile('DeRiVaTiVeS.xlsx')).toBe('FUTURES')
  })
})
