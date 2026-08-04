/**
 * Identifier determinism on the live ingestion path.
 *
 * Three CSV parsers (`KrakenSpotCsvParser`, `BitvavoCsvParser`, `BitUnixCsvParser`) fall back to
 * `Math.random()` when a row carries no source identifier — but all three are unreachable
 * (deleted in a later group; nothing imports them outside their own tests). The identifier every
 * real submission actually gets is `generateIdHash` over the mapped record, called from
 * `useImportProcessor.processAndSubmit`. This file proves — rather than assumes — that the live
 * path is already deterministic, using the real `generateIdHash`, not a mock.
 *
 * @see openspec/changes/fix-fifo-transfer-traceability/specs/domain-anti-corruption/spec.md
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useImportProcessor } from '../useImportProcessor'
import * as taxMutations from '@/composables/queries/useTaxMutations'

vi.mock('@/composables/queries/useTaxMutations', () => ({
  useSubmitIngestionMutation: vi.fn(),
}))

// Deliberately NOT mocking '@kryptofolio/core-domain' — the real generateIdHash is what this
// file exists to exercise.

function submittedIdHash(mockMutateAsync: ReturnType<typeof vi.fn>, callIndex: number): string {
  const call = mockMutateAsync.mock.calls[callIndex][0] as { rows: Array<{ id_hash: string }> }
  return call.rows[0].id_hash
}

describe('Identifier determinism — the live ingestion path', () => {
  it('ingesting the same row twice yields the same id_hash', async () => {
    const mockMutateAsync = vi.fn().mockResolvedValue(true)
    vi.mocked(taxMutations.useSubmitIngestionMutation).mockReturnValue({
      mutateAsync: mockMutateAsync,
    } as unknown as ReturnType<typeof taxMutations.useSubmitIngestionMutation>)

    const { processAndSubmit } = useImportProcessor()
    const accountId = '10000000-0000-0000-0000-000000000001'
    const row = () => [
      {
        id: '1',
        mappedData: {
          date: '2024-06-01',
          time: '10:00:00',
          tx_type: 'BUY',
          amount_in: '500',
          asset_in: 'ETH',
        },
      },
    ] as unknown as Parameters<typeof processAndSubmit>[0]

    await processAndSubmit(row(), 'spot', accountId, 'kraken-spot')
    await processAndSubmit(row(), 'spot', accountId, 'kraken-spot')

    const firstHash = submittedIdHash(mockMutateAsync, 0)
    const secondHash = submittedIdHash(mockMutateAsync, 1)

    expect(firstHash).toBeTruthy()
    expect(secondHash).toBe(firstHash)
  })

  it('two rows differing in a mapped field never collide', async () => {
    const mockMutateAsync = vi.fn().mockResolvedValue(true)
    vi.mocked(taxMutations.useSubmitIngestionMutation).mockReturnValue({
      mutateAsync: mockMutateAsync,
    } as unknown as ReturnType<typeof taxMutations.useSubmitIngestionMutation>)

    const { processAndSubmit } = useImportProcessor()
    const accountId = '10000000-0000-0000-0000-000000000001'

    await processAndSubmit(
      [
        {
          id: '1',
          mappedData: { date: '2024-06-01', time: '10:00:00', tx_type: 'BUY', amount_in: '500', asset_in: 'ETH' },
        },
      ] as unknown as Parameters<typeof processAndSubmit>[0],
      'spot',
      accountId,
      'kraken-spot',
    )
    await processAndSubmit(
      [
        {
          id: '2',
          mappedData: { date: '2024-06-01', time: '10:00:00', tx_type: 'BUY', amount_in: '501', asset_in: 'ETH' },
        },
      ] as unknown as Parameters<typeof processAndSubmit>[0],
      'spot',
      accountId,
      'kraken-spot',
    )

    const firstHash = submittedIdHash(mockMutateAsync, 0)
    const secondHash = submittedIdHash(mockMutateAsync, 1)

    expect(firstHash).not.toBe(secondHash)
  })
})

describe('No random fallback on the live identifier path', () => {
  it('TransactionHashService and useImportProcessor contain no Math.random()', () => {
    // Resolved from the frontend package root — the cwd vitest runs this suite from.
    const hashServicePath = resolve(
      process.cwd(),
      '../../packages/core-domain/src/domain/services/TransactionHashService.ts',
    )
    const importProcessorPath = resolve(
      process.cwd(),
      'src/modules/data-ingestion/composables/useImportProcessor.ts',
    )

    for (const path of [hashServicePath, importProcessorPath]) {
      const source = readFileSync(path, 'utf-8')
      expect(source).not.toContain('Math.random()')
    }
  })
})
