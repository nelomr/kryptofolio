/**
 * Identifier determinism on the live ingestion path.
 *
 * The identifier is no longer computed here. It is derived behind the ingestion boundary, from the row
 * that is actually persisted, because the legs of one operation are reunited on that side: a key the
 * client computed would key a record the client had already restructured, and would make re-ingesting
 * one file depend on the client version that submitted it. The derivation itself is exercised in
 * `apps/backend/.../__tests__/ingestionBoundary.spec.ts` against the real `generateIdHash`.
 *
 * What this file covers is the client's half of that guarantee: the payload it submits for one file is
 * itself deterministic, since a server-derived key over a varying payload would vary with it.
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

// Deliberately NOT mocking '@kryptofolio/core-domain': the timestamp normalisation the payload
// carries is real, and it is the one thing here the identifier is derived over.

function submittedRows(mockMutateAsync: ReturnType<typeof vi.fn>, callIndex: number): unknown {
  return (mockMutateAsync.mock.calls[callIndex][0] as { rows: unknown }).rows
}

function mutation(): ReturnType<typeof vi.fn> {
  const mockMutateAsync = vi.fn().mockResolvedValue(true)
  vi.mocked(taxMutations.useSubmitIngestionMutation).mockReturnValue({
    mutateAsync: mockMutateAsync,
  } as unknown as ReturnType<typeof taxMutations.useSubmitIngestionMutation>)
  return mockMutateAsync
}

const ACCOUNT = '10000000-0000-0000-0000-000000000001'

function rows(amountIn: string): Parameters<ReturnType<typeof useImportProcessor>['processAndSubmit']>[0] {
  return [
    {
      id: '1',
      mappedData: {
        date: '2024-06-01',
        time: '10:00:00',
        tx_type: 'BUY',
        amount_in: amountIn,
        asset_in: 'ETH',
      },
    },
  ] as unknown as Parameters<ReturnType<typeof useImportProcessor>['processAndSubmit']>[0]
}

describe('Identifier determinism — the live ingestion path', () => {
  it('submits the identical payload for the same row twice', async () => {
    const mockMutateAsync = mutation()
    const { processAndSubmit } = useImportProcessor()

    await processAndSubmit(rows('500'), 'spot', ACCOUNT, 'kraken-spot')
    await processAndSubmit(rows('500'), 'spot', ACCOUNT, 'kraken-spot')

    expect(submittedRows(mockMutateAsync, 0)).toEqual(submittedRows(mockMutateAsync, 1))
  })

  it('submits a distinguishable payload for two rows differing in a mapped field', async () => {
    const mockMutateAsync = mutation()
    const { processAndSubmit } = useImportProcessor()

    await processAndSubmit(rows('500'), 'spot', ACCOUNT, 'kraken-spot')
    await processAndSubmit(rows('501'), 'spot', ACCOUNT, 'kraken-spot')

    expect(submittedRows(mockMutateAsync, 0)).not.toEqual(submittedRows(mockMutateAsync, 1))
  })

  it('carries no identifier of its own, so nothing downstream can prefer a client-supplied one', async () => {
    const mockMutateAsync = mutation()
    const { processAndSubmit } = useImportProcessor()

    await processAndSubmit(rows('500'), 'spot', ACCOUNT, 'kraken-spot')

    const submitted = submittedRows(mockMutateAsync, 0) as Array<Record<string, unknown>>
    expect(submitted[0].id_hash).toBeUndefined()
  })
})

describe('No random fallback on the live identifier path', () => {
  it('the hash service, the pipeline and the submitting composable contain no Math.random()', () => {
    // Resolved from the frontend package root — the cwd vitest runs this suite from.
    const paths = [
      resolve(process.cwd(), '../../packages/core-domain/src/domain/services/TransactionHashService.ts'),
      resolve(
        process.cwd(),
        '../../packages/core-domain/src/domain/services/normalizer/ingestionPipeline.ts',
      ),
      resolve(process.cwd(), 'src/modules/data-ingestion/composables/useImportProcessor.ts'),
    ]

    for (const path of paths) {
      const source = readFileSync(path, 'utf-8')
      expect(source).not.toContain('Math.random()')
    }
  })
})
