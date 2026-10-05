/**
 * Wire contract for the AI portfolio advisor's SSE stream, and the closed vocabularies it shares
 * with the model-chain configuration and the vault registry.
 *
 * The domain speaks `completed | refused | failed`; only this file and the frontend speak the wire
 * names `done | refused | failed`. `AdvisorEvent` (domain) and `AdvisorStreamEvent`
 * (this file) are deliberately distinct types — `infrastructure/dtos/advisor.ts` owns the single
 * mapping between them.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------------------

/** The full read-only tool catalogue. */
export const ADVISOR_TOOL_NAMES = [
  'portfolio_summary',
  'fiscal_integrity',
  'token_history',
  'asset_allocation',
  'risk_metrics',
  'drawdown_curve',
  'performance_history',
  'kpis',
  'volatility_heatmap',
  'spanish_tax_report',
  'live_prices',
  'fiscal_integrity_rows',
  'token_lots',
  'holding_detail',
  'account_holdings',
  'tax_year_comparison',
  'derivatives_pnl',
  'custody_locations',
  'data_gaps',
  'explain_metric',
  'scenario_position_value',
  'breakeven_price',
  'scenario_portfolio_shock',
  'concentration_risk',
  'tx_search',
] as const;
export type AdvisorToolName = (typeof ADVISOR_TOOL_NAMES)[number];

/**
 * `core` is what a small local model is shown; `extended` adds the detail and drill-down tools that
 * only metered and mixed runs expose. Static on purpose: a per-tool setting would be a persisted
 * choice the user cannot judge well.
 */
export const ADVISOR_TOOL_TIER_VALUES = ['core', 'extended'] as const;
export type AdvisorToolTier = (typeof ADVISOR_TOOL_TIER_VALUES)[number];

export const ADVISOR_TOOL_TIERS: Record<AdvisorToolName, AdvisorToolTier> = {
  portfolio_summary: 'core',
  fiscal_integrity: 'core',
  token_history: 'core',
  asset_allocation: 'core',
  risk_metrics: 'extended',
  drawdown_curve: 'extended',
  performance_history: 'extended',
  kpis: 'core',
  volatility_heatmap: 'extended',
  spanish_tax_report: 'core',
  live_prices: 'core',
  fiscal_integrity_rows: 'extended',
  token_lots: 'extended',
  holding_detail: 'core',
  account_holdings: 'core',
  tax_year_comparison: 'core',
  derivatives_pnl: 'extended',
  custody_locations: 'extended',
  data_gaps: 'core',
  explain_metric: 'core',
  scenario_position_value: 'core',
  breakeven_price: 'core',
  scenario_portfolio_shock: 'extended',
  concentration_risk: 'extended',
  tx_search: 'extended',
} satisfies Record<AdvisorToolName, AdvisorToolTier>;

export const ADVISOR_FAILURE_CODES = [
  'NO_MODEL_AVAILABLE',
  'VAULT_LOCKED',
  'ALL_PROVIDERS_FAILED',
  'INTERNAL_ERROR',
] as const;
export type AdvisorFailureCode = (typeof ADVISOR_FAILURE_CODES)[number];

/**
 * Why the last provider of an exhausted chain failed, as a closed vocabulary: the wire carries this
 * classification and never the provider's own error text, which can embed URLs and account details.
 */
export const ADVISOR_PROVIDER_FAILURE_KINDS = [
  'auth-rejected',
  'model-not-found',
  'rate-limited',
  'provider-unavailable',
  'network',
  'unknown',
] as const;
export type AdvisorProviderFailureKind = (typeof ADVISOR_PROVIDER_FAILURE_KINDS)[number];

export const ADVISOR_TOOL_ERROR_CODES = ['INVALID_TOOL_INPUT', 'USE_CASE_FAILED'] as const;
export type AdvisorToolErrorCode = (typeof ADVISOR_TOOL_ERROR_CODES)[number];

/**
 * A model-supplied asset ticker symbol (`token_history`, `token_lots`, `live_prices`), bounded to
 * the alphanumeric-plus-dot shapes this ledger's own symbols use (e.g. `BTC`, `WBTC.E`) — rejected
 * at the tool's `inputSchema` boundary before the wrapped use case is ever invoked.
 */
export const SYMBOL_REGEX = /^[A-Z0-9.]{1,20}$/;

/**
 * Phase 0's closed provider set. Also the exact set of `category: { kind: 'ai-model' }` entries in
 * the vault registry — a provider can never exist in a model chain and be absent from the
 * registry, or vice versa.
 */
export const AI_PROVIDER_IDS = [
  'openai',
  'anthropic',
  'google',
  'opencode',
  'ollama',
  'ollama-cloud',
] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export const EXECUTION_PROFILE_KINDS = ['local', 'metered'] as const;
export type ExecutionProfileKind = (typeof EXECUTION_PROFILE_KINDS)[number];

/** The audit row's three-way value: `mixed` only when a resolved chain combined both kinds. */
export const RUN_EXECUTION_PROFILES = ['local', 'metered', 'mixed'] as const;
export type RunExecutionProfile = (typeof RUN_EXECUTION_PROFILES)[number];

// ---------------------------------------------------------------------------
// SSE wire contract
// ---------------------------------------------------------------------------

const toolNameSchema = z.enum(ADVISOR_TOOL_NAMES);

const tokenEventSchema = z.object({
  kind: z.literal('token'),
  runId: z.string(),
  text: z.string(),
});

const toolStartEventSchema = z.object({
  kind: z.literal('tool-start'),
  runId: z.string(),
  callId: z.string(),
  tool: toolNameSchema,
});

const toolResultEventSchema = z.object({
  kind: z.literal('tool-result'),
  runId: z.string(),
  callId: z.string(),
  tool: toolNameSchema,
});

const toolErrorEventSchema = z.object({
  kind: z.literal('tool-error'),
  runId: z.string(),
  callId: z.string(),
  tool: toolNameSchema,
  code: z.enum(ADVISOR_TOOL_ERROR_CODES),
});

const doneEventSchema = z.object({
  kind: z.literal('done'),
  runId: z.string(),
  threadId: z.string(),
  providerId: z.enum(AI_PROVIDER_IDS),
  modelId: z.string(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }),
  toolsCalled: z.array(toolNameSchema),
  executionProfile: z.enum(RUN_EXECUTION_PROFILES),
  stepsUsed: z.number().int().nonnegative(),
  maxSteps: z.number().int().positive(),
  /** The answer touches investment content, so the client shows its own disclaimer footer. */
  disclaimer: z.boolean(),
  /** A tool result of this run reported a partial total, so the answer's figures may be incomplete. */
  figuresIncomplete: z.boolean(),
});

const refusedEventSchema = z.object({
  kind: z.literal('refused'),
  runId: z.string(),
  threadId: z.string(),
  reason: z.string(),
  processorId: z.string(),
});

export const advisorProviderFailureCauseSchema = z
  .object({
    kind: z.enum(ADVISOR_PROVIDER_FAILURE_KINDS),
    providerId: z.enum(AI_PROVIDER_IDS),
    modelId: z.string(),
  })
  .strict();
export type AdvisorProviderFailureCause = z.infer<typeof advisorProviderFailureCauseSchema>;

const failedEventBase = {
  kind: z.literal('failed'),
  runId: z.string(),
  // Absent only when the failure happened before a receipt existed (an unanticipated throw on a
  // brand-new conversation), so the server has no thread id to report yet.
  threadId: z.string().optional(),
};

export const ADVISOR_CAUSELESS_FAILURE_CODES = ['NO_MODEL_AVAILABLE', 'VAULT_LOCKED', 'INTERNAL_ERROR'] as const satisfies
  readonly AdvisorFailureCode[];
export type AdvisorCauselessFailureCode = (typeof ADVISOR_CAUSELESS_FAILURE_CODES)[number];

/**
 * Only an exhausted provider chain has a cause to report; the other codes fail before any provider
 * is called, so a cause on them would name a provider that no run ever tried. Both members are
 * strict so that combination is rejected rather than silently stripped.
 */
const failedEventSchema = z.union([
  z
    .object({ ...failedEventBase, code: z.literal('ALL_PROVIDERS_FAILED'), cause: advisorProviderFailureCauseSchema })
    .strict(),
  z.object({ ...failedEventBase, code: z.enum(ADVISOR_CAUSELESS_FAILURE_CODES) }).strict(),
]);

/**
 * The `kind`-discriminated wire union. Deliberately has no `transport-lost` member: that state
 * is a stream closing with no terminal frame, which the frontend synthesizes locally — it must stay
 * unrepresentable here, or the discriminator between a guardrail refusal and a dropped connection
 * stops being sound.
 */
export const advisorStreamEventSchema = z.union([
  z.discriminatedUnion('kind', [
    tokenEventSchema,
    toolStartEventSchema,
    toolResultEventSchema,
    toolErrorEventSchema,
    doneEventSchema,
    refusedEventSchema,
  ]),
  failedEventSchema,
]);
export type AdvisorStreamEvent = z.infer<typeof advisorStreamEventSchema>;

// ---------------------------------------------------------------------------
// Model chain
// ---------------------------------------------------------------------------

/**
 * A model served through the local Ollama daemon runs in the cloud when its id carries a cloud
 * suffix: the app documents `:cloud`, and the daemon still exposes the older `-cloud` aliases
 * (for example `gpt-oss:120b-cloud`), all proxied to ollama.com. A genuinely local model that
 * happens to be named `something-cloud` is classified cloud too; that false positive is deliberate,
 * because it errs toward the metered limits and the "leaves the machine" label instead of
 * promising privacy that a cloud-proxied model does not have.
 */
export function isOllamaCloudModelId(modelId: string): boolean {
  return modelId.endsWith(':cloud') || modelId.endsWith('-cloud');
}

const localOllamaEntrySchema = z
  .object({
    providerId: z.literal('ollama'),
    modelId: z
      .string()
      .min(1)
      .refine((id) => !isOllamaCloudModelId(id), 'cloud models use the metered shape'),
    contextWindow: z.number().int().positive(),
  })
  .strict();

const meteredEntrySchema = z
  .object({
    providerId: z.enum(AI_PROVIDER_IDS),
    modelId: z.string().min(1),
  })
  .strict()
  // A plain (non-cloud-suffixed) `ollama` entry must carry `contextWindow` and therefore belongs to
  // `localOllamaEntrySchema` only — without this refinement it would fall through into this shape
  // whenever `contextWindow` was simply omitted, silently treating a local model as metered.
  .refine(
    (entry) => entry.providerId !== 'ollama' || isOllamaCloudModelId(entry.modelId),
    'a local ollama entry requires contextWindow',
  );

/**
 * Content-discriminated, not `kind`-discriminated — the discriminant is the field's presence:
 * a local `ollama` entry requires `contextWindow`, a metered entry forbids it. An `ollama` entry
 * whose `modelId` carries a cloud suffix fails the local refinement and validates as metered instead, which
 * is what keeps this in lockstep with `classifyExecutionProfile` below.
 */
export const modelChainEntrySchema = z.union([localOllamaEntrySchema, meteredEntrySchema]);
export type ModelChainEntry = z.infer<typeof modelChainEntrySchema>;

export const modelChainSchema = z.array(modelChainEntrySchema).min(1);
export type ModelChain = z.infer<typeof modelChainSchema>;

/**
 * Derived, never user-toggled: there is no field on a chain entry a user can flip to claim "local"
 * for a cloud model. Every case other than a non-cloud-suffixed `ollama` entry is `metered`, including an
 * `ollama` entry whose model id carries a cloud suffix — such a request still leaves
 * the machine via Ollama Cloud even though no vault credential exists for it.
 */
export function classifyExecutionProfile(entry: ModelChainEntry): ExecutionProfileKind {
  return entry.providerId === 'ollama' && !isOllamaCloudModelId(entry.modelId) ? 'local' : 'metered';
}

// ---------------------------------------------------------------------------
// Execution profile settings
// ---------------------------------------------------------------------------

const METERED_TOOL_BUDGETS = {
  portfolio_summary: 4000,
  fiscal_integrity: 6000,
  token_history: 6000,
  asset_allocation: 3000,
  risk_metrics: 1500,
  drawdown_curve: 4000,
  performance_history: 4000,
  kpis: 3000,
  volatility_heatmap: 4000,
  spanish_tax_report: 5000,
  live_prices: 2000,
  fiscal_integrity_rows: 4000,
  token_lots: 4000,
  holding_detail: 3000,
  account_holdings: 5000,
  tax_year_comparison: 4000,
  derivatives_pnl: 4000,
  custody_locations: 4000,
  data_gaps: 4000,
  explain_metric: 2000,
  scenario_position_value: 1500,
  breakeven_price: 1500,
  scenario_portfolio_shock: 4000,
  concentration_risk: 2000,
  tx_search: 5000,
} as const satisfies Record<AdvisorToolName, number>;

const MAX_STEPS_CEILING = 30;
const LAST_MESSAGES_CEILING = 200;
const PAGE_SIZE_CEILING = 200;

const toolBudgetsSchema = z.object(
  Object.fromEntries(ADVISOR_TOOL_NAMES.map((name) => [name, z.number().int().positive()])) as Record<
    AdvisorToolName,
    z.ZodNumber
  >,
);

const meteredProfileSchema = z.object({
  maxSteps: z.number().int().positive().max(MAX_STEPS_CEILING),
  lastMessages: z.number().int().positive().max(LAST_MESSAGES_CEILING),
  topNHoldings: z.number().int().positive(),
  lotsPageSize: z.number().int().positive().max(PAGE_SIZE_CEILING),
  rowsPageSize: z.number().int().positive().max(PAGE_SIZE_CEILING),
  toolBudgets: toolBudgetsSchema,
});

const localProfileSchema = z.object({
  maxSteps: z.number().int().positive().max(MAX_STEPS_CEILING),
  lastMessages: z.number().int().positive().max(LAST_MESSAGES_CEILING),
  topNHoldings: z.number().int().positive(),
  lotsPageSize: z.number().int().positive().max(PAGE_SIZE_CEILING),
  rowsPageSize: z.number().int().positive().max(PAGE_SIZE_CEILING),
});

export const executionProfilesSchema = z.object({
  metered: meteredProfileSchema,
  local: localProfileSchema,
});
export type ExecutionProfileSettings = z.infer<typeof localProfileSchema>;
export type MeteredExecutionProfileSettings = z.infer<typeof meteredProfileSchema>;
export type ExecutionProfiles = z.infer<typeof executionProfilesSchema>;

const CHARS_PER_TOKEN = 4;
const LOCAL_TOOL_SHARE = 0.15;
const LOCAL_RUN_SHARE = 0.6;

/**
 * Local budgets are never stored: they follow from the model's declared `contextWindow`, so the
 * limit the advisor applies and the window the user declared cannot drift apart. Shared so the
 * Settings screen shows exactly the number the backend enforces.
 */
export function deriveLocalToolBudget(contextWindow: number): number {
  return Math.floor(contextWindow * CHARS_PER_TOKEN * LOCAL_TOOL_SHARE);
}

export function deriveLocalRunBudget(contextWindow: number): number {
  return Math.floor(contextWindow * CHARS_PER_TOKEN * LOCAL_RUN_SHARE);
}

/** Code-supplied defaults used whenever `ai_advisor_execution_profiles` is unset. */
export function defaultExecutionProfiles(): ExecutionProfiles {
  return {
    metered: {
      maxSteps: 5,
      lastMessages: 20,
      topNHoldings: 15,
      lotsPageSize: 20,
      rowsPageSize: 25,
      toolBudgets: { ...METERED_TOOL_BUDGETS },
    },
    local: {
      maxSteps: 15,
      lastMessages: 50,
      topNHoldings: 50,
      lotsPageSize: 100,
      rowsPageSize: 100,
    },
  };
}
