import { computed, ref, type Ref } from 'vue'
import type { ModelChainEntry } from '@kryptofolio/shared-types'
import { useSetModelChainMutation } from '@/composables/queries/useAdvisorMutations'
import {
  draftRowsFromChain,
  validateChainDraft,
  type ChainDraftRow,
  type ChainRowError,
  type SaveState,
} from '../advisorSettingsModel'

export type RowPatch = Partial<Pick<ChainDraftRow, 'providerId' | 'modelId' | 'contextWindow'>>

const NEW_ENTRY: Omit<ChainDraftRow, 'key'> = { providerId: 'openai', modelId: '', contextWindow: '' }

/**
 * The stored chain seeds the draft once, when it first arrives. Later refetches (after a save, or a
 * window refocus) must not overwrite what the user is typing.
 */
export function useModelChainEditor(stored: Ref<readonly ModelChainEntry[] | undefined>) {
  const mutation = useSetModelChainMutation()

  let counter = 0
  const nextKey = () => counter++

  const rows = ref<ChainDraftRow[]>([])
  const hydrated = ref(false)
  const attempted = ref(false)
  const lastSubmitted = ref<string>()

  function hydrateOnce(): void {
    if (hydrated.value || stored.value === undefined) return
    rows.value = draftRowsFromChain(stored.value, nextKey)
    hydrated.value = true
  }

  const signature = computed(() =>
    JSON.stringify(rows.value.map(({ providerId, modelId, contextWindow }) => [providerId, modelId, contextWindow])),
  )

  const validation = computed(() => validateChainDraft(rows.value))
  const rowErrors = computed<ReadonlyMap<number, ChainRowError>>(() =>
    attempted.value && validation.value.kind === 'invalid' ? validation.value.rowErrors : new Map(),
  )
  const chainError = computed(() =>
    attempted.value && validation.value.kind === 'invalid' ? validation.value.chainError : undefined,
  )

  const saveState = computed<SaveState>(() => {
    if (mutation.isLoading.value) return { kind: 'saving' }
    if (lastSubmitted.value !== signature.value) return { kind: 'idle' }
    if (mutation.status.value === 'success') return { kind: 'saved' }
    if (mutation.status.value === 'error') return { kind: 'failed' }
    return { kind: 'idle' }
  })

  function add(): void {
    rows.value.push({ key: nextKey(), ...NEW_ENTRY })
  }

  function remove(key: number): void {
    rows.value = rows.value.filter((row) => row.key !== key)
  }

  function move(key: number, offset: -1 | 1): void {
    const from = rows.value.findIndex((row) => row.key === key)
    const to = from + offset
    if (from < 0 || to < 0 || to >= rows.value.length) return
    const next = [...rows.value]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    rows.value = next
  }

  function update(key: number, patch: RowPatch): void {
    const row = rows.value.find((candidate) => candidate.key === key)
    if (row !== undefined) Object.assign(row, patch)
  }

  function save(): void {
    attempted.value = true
    if (validation.value.kind === 'invalid') return
    lastSubmitted.value = signature.value
    mutation.mutate(validation.value.chain)
  }

  return { rows, hydrateOnce, add, remove, move, update, save, rowErrors, chainError, saveState }
}
