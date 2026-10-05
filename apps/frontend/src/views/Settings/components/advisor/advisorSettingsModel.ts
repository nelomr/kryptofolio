import {
  ADVISOR_TOOL_NAMES,
  classifyExecutionProfile,
  executionProfilesSchema,
  isOllamaCloudModelId,
  modelChainSchema,
  type AdvisorToolName,
  type AiProviderId,
  type ExecutionProfileKind,
  type ExecutionProfiles,
  type ModelChain,
  type ModelChainEntry,
} from '@kryptofolio/shared-types'
import type { AdvisorProviderStatus } from '@/core/domain/models/AdvisorEntities'

/**
 * Form state is text, not numbers: a half-typed or cleared number input has no numeric value, and
 * coercing it early would either lose the keystroke or turn an empty field into a valid `0`.
 */

export type SaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved' }
  | { readonly kind: 'failed' }

export interface ChainDraftRow {
  readonly key: number
  providerId: AiProviderId
  modelId: string
  contextWindow: string
}

export type ChainRowError = 'model_required' | 'context_window_required'

export type ChainValidation =
  | { readonly kind: 'valid'; readonly chain: ModelChain }
  | {
      readonly kind: 'invalid'
      readonly rowErrors: ReadonlyMap<number, ChainRowError>
      readonly chainError: 'empty' | 'invalid' | undefined
    }

export function draftRowsFromChain(chain: readonly ModelChainEntry[], nextKey: () => number): ChainDraftRow[] {
  return chain.map((entry) => ({
    key: nextKey(),
    providerId: entry.providerId,
    modelId: entry.modelId,
    contextWindow: 'contextWindow' in entry ? String(entry.contextWindow) : '',
  }))
}

/** What the row would be before any context window is attached: enough for the shared classifier. */
function classificationProbe(row: ChainDraftRow): ModelChainEntry {
  return { providerId: row.providerId, modelId: row.modelId.trim() }
}

export function rowProfile(row: ChainDraftRow): ExecutionProfileKind {
  return classifyExecutionProfile(classificationProbe(row))
}

/**
 * `ollama-cloud` talks to ollama.com's API directly, which only knows the plain model names; the
 * suffixed aliases exist only in the local daemon, so this combination fails at request time.
 */
export function hasDaemonOnlySuffix(row: ChainDraftRow): boolean {
  return row.providerId === 'ollama-cloud' && isOllamaCloudModelId(row.modelId.trim())
}

function parsePositiveInteger(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  const value = Number(trimmed)
  return Number.isInteger(value) && value > 0 ? value : undefined
}

export function validateChainDraft(rows: readonly ChainDraftRow[]): ChainValidation {
  if (rows.length === 0) return { kind: 'invalid', rowErrors: new Map(), chainError: 'empty' }

  const rowErrors = new Map<number, ChainRowError>()
  const entries: ModelChainEntry[] = []
  for (const row of rows) {
    const modelId = row.modelId.trim()
    if (modelId === '') {
      rowErrors.set(row.key, 'model_required')
      continue
    }
    if (rowProfile(row) === 'local') {
      const contextWindow = parsePositiveInteger(row.contextWindow)
      if (contextWindow === undefined) {
        rowErrors.set(row.key, 'context_window_required')
        continue
      }
      entries.push({ providerId: row.providerId, modelId, contextWindow })
    } else {
      entries.push({ providerId: row.providerId, modelId })
    }
  }
  if (rowErrors.size > 0) return { kind: 'invalid', rowErrors, chainError: undefined }

  const parsed = modelChainSchema.safeParse(entries)
  if (!parsed.success) return { kind: 'invalid', rowErrors, chainError: 'invalid' }
  return { kind: 'valid', chain: parsed.data }
}

export type CredentialFlag = 'absent' | 'locked'

/**
 * An `ollama` entry never reads the vault, local or `:cloud`, so a missing credential there is not
 * a problem. A provider the server did not report at all is treated as having no credential:
 * showing a warning that turns out to be unnecessary costs less than a silently skipped entry.
 */
export function credentialFlag(
  row: ChainDraftRow,
  providers: readonly AdvisorProviderStatus[],
): CredentialFlag | undefined {
  if (row.providerId === 'ollama') return undefined
  const status = providers.find((provider) => provider.id === row.providerId)
  if (status === undefined || status.credential.kind === 'absent') return 'absent'
  return status.credential.kind === 'locked' ? 'locked' : undefined
}

/** Declared windows of the local entries, for the read-only derived budgets. */
export function localContextWindows(rows: readonly ChainDraftRow[]): { key: number; modelId: string; contextWindow: number }[] {
  const windows: { key: number; modelId: string; contextWindow: number }[] = []
  for (const row of rows) {
    if (rowProfile(row) !== 'local') continue
    const contextWindow = parsePositiveInteger(row.contextWindow)
    if (contextWindow !== undefined) windows.push({ key: row.key, modelId: row.modelId.trim(), contextWindow })
  }
  return windows
}

export const LIMIT_FIELDS = ['maxSteps', 'lastMessages', 'topNHoldings', 'lotsPageSize', 'rowsPageSize'] as const
export type LimitField = (typeof LIMIT_FIELDS)[number]

export type ProfileName = keyof ExecutionProfiles

export type LimitsDraft = Record<LimitField, string>
export type MeteredDraft = LimitsDraft & { toolBudgets: Record<AdvisorToolName, string> }
export interface ExecutionProfilesDraft {
  metered: MeteredDraft
  local: LimitsDraft
}

function limitsToText(source: Record<LimitField, number>): LimitsDraft {
  return {
    maxSteps: String(source.maxSteps),
    lastMessages: String(source.lastMessages),
    topNHoldings: String(source.topNHoldings),
    lotsPageSize: String(source.lotsPageSize),
    rowsPageSize: String(source.rowsPageSize),
  }
}

function toolBudgetsToText(budgets: Record<AdvisorToolName, number>): Record<AdvisorToolName, string> {
  return Object.fromEntries(ADVISOR_TOOL_NAMES.map((tool) => [tool, String(budgets[tool])])) as Record<
    AdvisorToolName,
    string
  >
}

export function draftFromProfiles(profiles: ExecutionProfiles): ExecutionProfilesDraft {
  return {
    metered: { ...limitsToText(profiles.metered), toolBudgets: toolBudgetsToText(profiles.metered.toolBudgets) },
    local: limitsToText(profiles.local),
  }
}

/** An empty or non-numeric field becomes `NaN`, which the schema rejects rather than reading as `0`. */
function toNumber(text: string): number {
  return text.trim() === '' ? Number.NaN : Number(text)
}

function limitsToNumbers(draft: LimitsDraft): Record<LimitField, number> {
  return {
    maxSteps: toNumber(draft.maxSteps),
    lastMessages: toNumber(draft.lastMessages),
    topNHoldings: toNumber(draft.topNHoldings),
    lotsPageSize: toNumber(draft.lotsPageSize),
    rowsPageSize: toNumber(draft.rowsPageSize),
  }
}

export type LimitFieldError =
  | { readonly kind: 'whole_number' }
  | { readonly kind: 'max'; readonly max: number }

/** Keyed `metered.maxSteps`, `metered.toolBudgets.kpis`, `local.lastMessages`, … */
export type LimitErrors = ReadonlyMap<string, LimitFieldError>

export type ProfilesValidation =
  | { readonly kind: 'valid'; readonly profiles: ExecutionProfiles }
  | { readonly kind: 'invalid'; readonly errors: LimitErrors }

export function limitErrorKey(profile: ProfileName, field: LimitField): string {
  return `${profile}.${field}`
}

export function toolBudgetErrorKey(tool: AdvisorToolName): string {
  return `metered.toolBudgets.${tool}`
}

/**
 * The ceilings come from `executionProfilesSchema` itself, so what is reported here is exactly what
 * the server would enforce and there is no second copy of the numbers to drift.
 */
export function validateProfilesDraft(draft: ExecutionProfilesDraft): ProfilesValidation {
  const toolBudgets = Object.fromEntries(
    ADVISOR_TOOL_NAMES.map((tool) => [tool, toNumber(draft.metered.toolBudgets[tool])]),
  )

  const parsed = executionProfilesSchema.safeParse({
    metered: { ...limitsToNumbers(draft.metered), toolBudgets },
    local: limitsToNumbers(draft.local),
  })
  if (parsed.success) return { kind: 'valid', profiles: parsed.data }

  const errors = new Map<string, LimitFieldError>()
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.')
    if (errors.has(key)) continue
    errors.set(key, issue.code === 'too_big' ? { kind: 'max', max: Number(issue.maximum) } : { kind: 'whole_number' })
  }
  return { kind: 'invalid', errors }
}

export function errorsForProfile(errors: LimitErrors, profile: ProfileName): boolean {
  for (const key of errors.keys()) if (key.startsWith(`${profile}.`)) return true
  return false
}
