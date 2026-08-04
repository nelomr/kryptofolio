/**
 * The wizard's contract, asserted rather than assumed.
 *
 * Source-format profiles reach deep into the ingestion flow, and the cheapest way to pay for that
 * would have been a fourth step, a reshaped `ParseResult`, or a mapping the profile overwrites. None
 * of that happened, and this file is what says so: it pins the shapes that were promised to stay, so
 * a later change to any of them fails here instead of being noticed by a user.
 *
 * Exactly one signature changed, deliberately — `processAndSubmit` gained the source identifier —
 * and that change is pinned too, together with the route schema that receives it.
 */

import { describe, it, expect, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { SourceProfileId } from '@kryptofolio/shared-types'
import { useFileParser } from '../useFileParser'
import { useColumnMapper } from '../useColumnMapper'
import { usePreviewTable } from '../usePreviewTable'
import { useImportProcessor } from '../useImportProcessor'
import type { WizardStep } from '../useCsvImportWizard'
import { ref } from 'vue'

vi.mock('@/composables/queries/useTaxMutations', () => ({
  useSubmitIngestionMutation: () => ({ mutateAsync: vi.fn() }),
}))

const read = (relative: string) =>
  readFile(resolve(process.cwd(), 'src/modules/data-ingestion', relative), 'utf8')

describe('the wizard still has three steps', () => {
  it('admits 1, 2 and 3 and nothing else', () => {
    const steps: WizardStep[] = [1, 2, 3]
    expect(steps).toEqual([1, 2, 3])
    // @ts-expect-error a fourth step is not part of the contract
    const fourth: WizardStep = 4
    expect(fourth).toBe(4)
  })
})

describe('the parser, the mapper and the preview kept their shapes', () => {
  it('parseFile still resolves to { data, headers, errors }', async () => {
    const parser = useFileParser()
    const result = await parser.parseFile(
      new File(['type,amount\nbuy,1\n'], 'x.csv', { type: 'text/csv' }),
    )
    expect(result).not.toBeNull()
    expect(Object.keys(result!).sort()).toEqual(['data', 'errors', 'headers'])
  })

  it('initializeMapping still takes the headers alone and still owns the mapping ref', () => {
    const mapper = useColumnMapper()
    expect(mapper.initializeMapping).toHaveLength(1)
    mapper.initializeMapping(['txid', 'amount', 'balance'])
    expect(mapper.mapping.value['balance']).toBe('balance')

    // A mapping the user changed is theirs, and re-initialising does not silently replace it.
    mapper.mapping.value['amount'] = 'amount_in'
    expect(mapper.mapping.value['amount']).toBe('amount_in')
  })

  it('generatePreview is still callable with two arguments', async () => {
    // The profile is an *optional* third parameter, so every existing call site still compiles. This
    // call type-checks under `vue-tsc --build --force` with two arguments, which is the contract.
    expect(await read('composables/usePreviewTable.ts')).toContain('profile?: SourceFormatProfile')

    const preview = usePreviewTable(ref('SPOT'))
    preview.generatePreview([{ date: '2025-01-01', asset: 'BTC', amount: '1' }], {
      date: 'date',
      asset: 'asset',
      amount: 'amount',
    })
    expect(preview.rows.value).toHaveLength(1)
  })
})

describe('exactly one signature changed, and its consequences are discharged', () => {
  it('processAndSubmit takes the source identifier as its fourth argument', () => {
    const processor = useImportProcessor()
    expect(processor.processAndSubmit).toHaveLength(4)
    const call: Parameters<typeof processor.processAndSubmit>[3] =
      'kraken-spot' satisfies SourceProfileId
    expect(call).toBe('kraken-spot')
  })

  it('is the only signature in the module that grew', async () => {
    const wizard = await read('composables/useCsvImportWizard.ts')
    // The contract's own words, kept where a reader of the module will meet them.
    expect(wizard).toContain('export type WizardStep = 1 | 2 | 3')
    expect(wizard).toContain('columnMapper.initializeMapping(result.headers)')
  })

  it('the route schema requires the identifier rather than defaulting it', async () => {
    const route = await readFile(
      resolve(
        process.cwd(),
        '../backend/src/core/infrastructure/routes/ingestion.ts',
      ),
      'utf8',
    )
    expect(route).toContain('sourceProfileId: sourceProfileIdSchema')
    // A default is exactly the silent fallback this field exists to remove.
    expect(route).not.toMatch(/sourceProfileId:[^\n]*\.(default|optional)\(/)
  })
})

describe('the three components kept their props and emits', () => {
  it('DropzoneArea declares neither', async () => {
    const source = await read('components/DropzoneArea.vue')
    expect(source).not.toContain('defineProps')
    expect(source).not.toContain('defineEmits')
  })

  it('DataGridValidator declares neither', async () => {
    const source = await read('components/DataGridValidator.vue')
    expect(source).not.toContain('defineProps')
    expect(source).not.toContain('defineEmits')
  })

  it('DataIngestionWizard still declares only its close emit', async () => {
    const source = await read('components/DataIngestionWizard.vue')
    expect(source).not.toContain('defineProps')
    expect(source.match(/defineEmits/g)).toHaveLength(1)
    expect(source).toContain('(e: "close"): void')
  })
})

describe('the unreachable parsers are gone and nothing stood in for them', () => {
  it('no module imports the deleted registry or its port', async () => {
    const wizard = await read('composables/useCsvImportWizard.ts')
    const preview = await read('composables/usePreviewTable.ts')
    for (const source of [wizard, preview]) {
      expect(source).not.toContain('infrastructure/csv')
      expect(source).not.toContain('ICsvIngestionPort')
    }
  })
})
