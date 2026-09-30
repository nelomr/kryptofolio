import { computed, reactive, ref, type Ref } from 'vue'
import { defaultExecutionProfiles, type AdvisorToolName, type ExecutionProfiles } from '@kryptofolio/shared-types'
import { useSetExecutionProfilesMutation } from '@/composables/queries/useAdvisorMutations'
import {
  draftFromProfiles,
  errorsForProfile,
  validateProfilesDraft,
  type ExecutionProfilesDraft,
  type LimitErrors,
  type LimitField,
  type ProfileName,
  type SaveState,
} from '../advisorSettingsModel'

/** The stored profiles seed the draft once; a refetch after saving never overwrites live edits. */
export function useExecutionProfilesEditor(stored: Ref<ExecutionProfiles | undefined>) {
  const mutation = useSetExecutionProfilesMutation()

  const draft = reactive<ExecutionProfilesDraft>(draftFromProfiles(defaultExecutionProfiles()))
  const hydrated = ref(false)
  const selected = ref<ProfileName>('metered')
  const lastSubmitted = ref<string>()

  function hydrateOnce(): void {
    if (hydrated.value || stored.value === undefined) return
    Object.assign(draft, draftFromProfiles(stored.value))
    hydrated.value = true
  }

  const signature = computed(() => JSON.stringify(draft))
  const validation = computed(() => validateProfilesDraft(draft))
  const errors = computed<LimitErrors>(() => (validation.value.kind === 'invalid' ? validation.value.errors : new Map()))

  const saveState = computed<SaveState>(() => {
    if (mutation.isLoading.value) return { kind: 'saving' }
    if (lastSubmitted.value !== signature.value) return { kind: 'idle' }
    if (mutation.status.value === 'success') return { kind: 'saved' }
    if (mutation.status.value === 'error') return { kind: 'failed' }
    return { kind: 'idle' }
  })

  function select(profile: ProfileName): void {
    selected.value = profile
  }

  function setLimit(profile: ProfileName, field: LimitField, value: string): void {
    draft[profile][field] = value
  }

  function setToolBudget(tool: AdvisorToolName, value: string): void {
    draft.metered.toolBudgets[tool] = value
  }

  function resetSelected(): void {
    const defaults = draftFromProfiles(defaultExecutionProfiles())
    if (selected.value === 'metered') draft.metered = defaults.metered
    else draft.local = defaults.local
  }

  function save(): void {
    if (validation.value.kind === 'invalid') {
      const failing = validation.value.errors
      if (!errorsForProfile(failing, selected.value)) {
        selected.value = selected.value === 'metered' ? 'local' : 'metered'
      }
      return
    }
    lastSubmitted.value = signature.value
    mutation.mutate(validation.value.profiles)
  }

  return { draft, hydrateOnce, selected, select, setLimit, setToolBudget, resetSelected, save, errors, saveState }
}
