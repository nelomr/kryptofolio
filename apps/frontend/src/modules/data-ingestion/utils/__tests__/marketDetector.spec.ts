import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { SOURCE_FORMAT_PROFILES } from '@kryptofolio/core-domain'
import { SOURCE_PROFILE_IDS } from '@kryptofolio/shared-types'
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

/**
 * The scope this guess is now confined to.
 *
 * It reads a file name, so it is wrong whenever the name says nothing true about the export — a real
 * Kraken futures ledger saved as `enero.csv` reads as spot, and every one of its rows would then be
 * ingested into the wrong market. A profile knows its market as a declared fact, so wherever one is
 * recognised this function is not consulted at all. Leaving both mechanisms live for the same file
 * would leave two detections free to disagree, and this is the one whose reasoning the user cannot see.
 */
describe('the filename guess is the unrecognised-source fallback and nothing more', () => {
  it('is wrong about a real futures export whose name does not say so', () => {
    // Recorded rather than fixed: the profile is what decides this now.
    expect(detectMarketTypeFromFile('enero-movimientos.csv')).toBe('SPOT')
  })

  it('is not consulted for any source whose profile declares a market', () => {
    const declared = Object.values(SOURCE_FORMAT_PROFILES).filter(
      (profile) => profile.market.kind !== 'UNDECLARED',
    )
    // Every measured source declares one, so only `generic` can ever reach the guess.
    expect(declared).toHaveLength(SOURCE_PROFILE_IDS.length - 1)
    expect(SOURCE_FORMAT_PROFILES.generic.market.kind).toBe('UNDECLARED')
  })

  it('is reached from exactly one place in the wizard', async () => {
    const wizardSource = await readFile(
      resolve(process.cwd(), 'src/modules/data-ingestion/composables/useCsvImportWizard.ts'),
      'utf8',
    )
    expect(wizardSource.match(/detectMarketTypeFromFile\(/g)).toHaveLength(1)
  })
})
