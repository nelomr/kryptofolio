import { isValidationError } from '@mastra/core/tools';
import { ADVISOR_TOOL_NAMES, type AdvisorToolName } from '@kryptofolio/shared-types';
import type { AdvisorProviderFailureCause } from '@kryptofolio/shared-types';
import type { AdvisorEvent } from '../../domain/models/AdvisorEvent.js';
import type { AdvisorRunReceipt, AdvisorRunReceiptDraft } from '../../domain/models/AdvisorRunReceipt.js';
import type { ResolvedChainEntry } from './models/resolvedChainEntry.js';
import { classifyProviderError, sanitizeProviderErrorMessage } from './classifyProviderError.js';
import { reportsIncompleteFigures } from './tools/reportsIncompleteFigures.js';

/**
 * `Agent.stream(...).fullStream`'s real element shape: every chunk carries a `type`
 * discriminant and a provider-shaped `payload` this file treats as `unknown` and narrows field by
 * field — never a cast. This is a structural subset of Mastra's own `ChunkType`,
 * declared locally rather than imported, since every helper below only ever reads `type`/`payload`.
 */
export interface StreamChunkLike {
  readonly type: string;
  readonly payload?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isStreamChunkLike(value: unknown): value is StreamChunkLike {
  return isRecord(value) && typeof value.type === 'string';
}

const ADVISOR_TOOL_NAME_SET = new Set<string>(ADVISOR_TOOL_NAMES);

export function isAdvisorToolName(name: string): name is AdvisorToolName {
  return ADVISOR_TOOL_NAME_SET.has(name);
}

/** `text-delta`'s `TextDeltaPayload.text`, verified against the installed `.d.ts`. */
export function getTextDelta(payload: unknown): string | undefined {
  if (!isRecord(payload) || typeof payload.text !== 'string') return undefined;
  return payload.text;
}

export interface ToolCallInfo {
  readonly toolCallId: string;
  readonly toolName: string;
}

/** `tool-call`/`tool-error`'s shared identity fields (`ToolCallPayload`/`ToolErrorPayload`). */
export function getToolCallInfo(payload: unknown): ToolCallInfo | undefined {
  if (!isRecord(payload) || typeof payload.toolCallId !== 'string' || typeof payload.toolName !== 'string') {
    return undefined;
  }
  return { toolCallId: payload.toolCallId, toolName: payload.toolName };
}

export interface ToolResultInfo extends ToolCallInfo {
  readonly result: unknown;
}

/**
 * `tool-result`'s `ToolResultPayload` — `result` stays `unknown`: it is Mastra's own tool-output
 * validation raising a `ValidationError` when a tool's `inputSchema` rejects the model's arguments
 * (empirically confirmed — an invalid tool call never reaches a `tool-error` chunk at all, it
 * surfaces here instead), or the tool's own real output otherwise. `isValidationError` (imported
 * from `@mastra/core/tools`, never re-implemented) is the narrowing check the caller uses.
 */
export function getToolResultInfo(payload: unknown): ToolResultInfo | undefined {
  const base = getToolCallInfo(payload);
  if (!base || !isRecord(payload) || !('result' in payload)) return undefined;
  return { ...base, result: payload.result };
}

/**
 * The `tool-output` wrapper Mastra uses when a tool call is itself a sub-agent delegation under the
 * supervisor pattern — empirically confirmed: `taxAnalyst`'s own tool-call/tool-result chunks never
 * reach `advisor`'s `fullStream` directly, they arrive nested as `{ output: <chunk> }` on a
 * `tool-output` chunk keyed by the *delegate* call. Unwrapping this is what lets the chat panel show
 * real tool activity (`portfolio_summary`, etc.) instead of only the opaque `agent-taxAnalyst` call.
 */
export function getToolOutputInner(payload: unknown): StreamChunkLike | undefined {
  if (!isRecord(payload) || !isStreamChunkLike(payload.output)) return undefined;
  return payload.output;
}

export interface TripwireInfo {
  readonly reason: string;
  readonly processorId: string;
}

const UNKNOWN_PROCESSOR_ID = 'unknown-processor';

/** `tripwire`'s `TripwirePayload` — `processorId` is optional on the type but always set in practice
 * (Mastra's `TripWire` constructor fills it from the aborting `Processor`, confirmed empirically);
 * the fallback only guards a payload shape Mastra's own contract says should not occur. */
export function getTripwireInfo(payload: unknown): TripwireInfo | undefined {
  if (!isRecord(payload) || typeof payload.reason !== 'string') return undefined;
  const processorId = typeof payload.processorId === 'string' ? payload.processorId : UNKNOWN_PROCESSOR_ID;
  return { reason: payload.reason, processorId };
}

export interface FinishInfo {
  readonly reason: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly modelId?: string;
  readonly disclaimer: boolean;
}

/**
 * Shared by `finish` and `step-finish` (`FinishPayload`/`StepFinishPayload` — identical shape for
 * every field this adapter reads). `metadata.modelMetadata` is not a named field of either installed
 * type (it falls under their own `[key: string]: unknown` index signature) but is present on every
 * real streamed chunk observed empirically (confirmed by a spike) — it is what lets the adapter learn
 * which resolved chain entry actually answered, from inside the run, before any terminal event.
 */
export function getFinishInfo(payload: unknown): FinishInfo | undefined {
  if (!isRecord(payload)) return undefined;
  const stepResult = payload.stepResult;
  if (!isRecord(stepResult) || typeof stepResult.reason !== 'string') return undefined;

  const output = payload.output;
  const usage = isRecord(output) ? output.usage : undefined;
  const inputTokens = isRecord(usage) && typeof usage.inputTokens === 'number' ? usage.inputTokens : 0;
  const outputTokens = isRecord(usage) && typeof usage.outputTokens === 'number' ? usage.outputTokens : 0;

  const metadata = payload.metadata;
  const modelMetadata = isRecord(metadata) ? metadata.modelMetadata : undefined;
  const modelId = isRecord(modelMetadata) && typeof modelMetadata.modelId === 'string' ? modelMetadata.modelId : undefined;

  const disclaimer = typeof payload.disclaimer === 'string' && payload.disclaimer.length > 0;

  return { reason: stepResult.reason, inputTokens, outputTokens, modelId, disclaimer };
}

/**
 * Maps a `tool-call` / `tool-result` / `tool-error` chunk — top-level or unwrapped from a
 * `tool-output` wrapper — onto the matching `AdvisorEvent`, or `undefined` when it is not one of
 * `ADVISOR_TOOL_NAMES` (the sub-agent delegation call itself, e.g. `agent-taxAnalyst`, is never a
 * real tool and never surfaces as tool activity) or the payload does not match the expected shape.
 */
export function mapToolActivityChunk(chunk: StreamChunkLike, runId: string): AdvisorEvent | undefined {
  if (chunk.type === 'tool-call') {
    const info = getToolCallInfo(chunk.payload);
    if (!info || !isAdvisorToolName(info.toolName)) return undefined;
    return { kind: 'tool-start', callId: info.toolCallId, tool: info.toolName, runId };
  }

  if (chunk.type === 'tool-result') {
    const info = getToolResultInfo(chunk.payload);
    if (!info || !isAdvisorToolName(info.toolName)) return undefined;
    if (isValidationError(info.result)) {
      return { kind: 'tool-error', callId: info.toolCallId, tool: info.toolName, code: 'INVALID_TOOL_INPUT', runId };
    }
    return { kind: 'tool-result', callId: info.toolCallId, tool: info.toolName, runId };
  }

  if (chunk.type === 'tool-error') {
    const info = getToolCallInfo(chunk.payload);
    if (!info || !isAdvisorToolName(info.toolName)) return undefined;
    return { kind: 'tool-error', callId: info.toolCallId, tool: info.toolName, code: 'USE_CASE_FAILED', runId };
  }

  return undefined;
}

export function matchResolvedEntry(
  resolvedChain: readonly ResolvedChainEntry[],
  modelId: string | undefined,
): ResolvedChainEntry | undefined {
  if (modelId === undefined) return undefined;
  return resolvedChain.find((entry) => entry.modelId === modelId);
}

export interface ApplyChunkContext {
  readonly draft: AdvisorRunReceiptDraft;
  readonly resolvedChain: readonly ResolvedChainEntry[];
  readonly primaryEntry: ResolvedChainEntry;
  readonly now: () => string;
}

/** What a failed run is logged with: the wire cause plus the status and a sanitized message. */
export interface ProviderFailureDiagnostic extends AdvisorProviderFailureCause {
  readonly statusCode: number | undefined;
  readonly message: string | undefined;
}

export interface ApplyChunkResult {
  readonly events: readonly AdvisorEvent[];
  readonly terminal: boolean;
  readonly diagnostic?: ProviderFailureDiagnostic;
}

const NO_EVENTS: ApplyChunkResult = { events: [], terminal: false };

function noteIncompleteFigures(chunk: StreamChunkLike, draft: AdvisorRunReceiptDraft): void {
  if (chunk.type !== 'tool-result') return;
  const info = getToolResultInfo(chunk.payload);
  if (info && isAdvisorToolName(info.toolName) && reportsIncompleteFigures(info.result)) {
    draft.figuresIncomplete = true;
  }
}

/** The error object of an `error` chunk (`{ error }`), or `undefined` when the payload has none. */
export function getErrorChunkError(payload: unknown): unknown {
  return isRecord(payload) ? payload.error : undefined;
}

function secretsOf(resolvedChain: readonly ResolvedChainEntry[]): string[] {
  return resolvedChain.flatMap((entry) => ('apiKey' in entry ? [entry.apiKey] : []));
}

/**
 * Mastra only surfaces the last failure once every chain entry is exhausted, so the entry reported
 * is the last one tried — or the one that already answered, when the run broke after a step.
 */
function failingEntry(context: ApplyChunkContext): Pick<ResolvedChainEntry, 'providerId' | 'modelId'> {
  const { draft, resolvedChain, primaryEntry } = context;
  if (draft.providerId !== undefined && draft.modelId !== undefined) {
    return { providerId: draft.providerId, modelId: draft.modelId };
  }
  return resolvedChain.at(-1) ?? primaryEntry;
}

function allProvidersFailed(error: unknown, context: ApplyChunkContext): ApplyChunkResult {
  const { draft, primaryEntry, resolvedChain, now } = context;
  const { kind, statusCode } = classifyProviderError(error);
  const { providerId, modelId } = failingEntry(context);
  const receipt = freezeReceipt(draft, primaryEntry, now());
  const message =
    error instanceof Error ? sanitizeProviderErrorMessage(error.message, secretsOf(resolvedChain)) : undefined;
  return {
    events: [
      {
        kind: 'failed',
        runId: draft.runId,
        code: 'ALL_PROVIDERS_FAILED',
        cause: { kind, providerId, modelId },
        receipt,
      },
    ],
    terminal: true,
    diagnostic: { kind, providerId, modelId, statusCode, message },
  };
}

function toolActivityResult(event: AdvisorEvent | undefined, draft: AdvisorRunReceiptDraft): ApplyChunkResult {
  if (!event) return NO_EVENTS;
  if (event.kind === 'tool-result' || event.kind === 'tool-error') {
    draft.toolsCalled.push(event.tool);
  }
  return { events: [event], terminal: false };
}

/**
 * The single per-chunk reducer `MastraAdvisorAdapter`'s generator drives, via a deliberately
 * non-exhaustive switch, factored out so the draft's mid-run state is directly inspectable in a
 * test without needing a terminal chunk to ever arrive — a run that never terminates
 * still has something to audit. Mutates `context.draft` in place and returns the `AdvisorEvent`s
 * (zero or more) this one chunk produces, plus whether the run is now over.
 */
export function applyChunk(chunk: StreamChunkLike, context: ApplyChunkContext): ApplyChunkResult {
  const { draft, resolvedChain, primaryEntry, now } = context;

  switch (chunk.type) {
    case 'text-delta': {
      const text = getTextDelta(chunk.payload);
      return text === undefined ? NO_EVENTS : { events: [{ kind: 'token', text, runId: draft.runId }], terminal: false };
    }

    case 'tool-call':
    case 'tool-result':
    case 'tool-error':
      noteIncompleteFigures(chunk, draft);
      return toolActivityResult(mapToolActivityChunk(chunk, draft.runId), draft);

    case 'tool-output': {
      const inner = getToolOutputInner(chunk.payload);
      if (inner) noteIncompleteFigures(inner, draft);
      return toolActivityResult(inner ? mapToolActivityChunk(inner, draft.runId) : undefined, draft);
    }

    case 'step-finish': {
      draft.stepsUsed = (draft.stepsUsed ?? 0) + 1;
      // "The moment a chain entry is chosen" is the first step that actually answers — set
      // once, never re-evaluated on a later step of the same run.
      if (draft.providerId === undefined) {
        const info = getFinishInfo(chunk.payload);
        const matched = (info ? matchResolvedEntry(resolvedChain, info.modelId) : undefined) ?? primaryEntry;
        draft.providerId = matched.providerId;
        draft.modelId = matched.modelId;
      }
      return NO_EVENTS;
    }

    case 'tripwire': {
      const info = getTripwireInfo(chunk.payload);
      const receipt = freezeReceipt(draft, primaryEntry, now());
      return {
        events: [
          {
            kind: 'refused',
            runId: draft.runId,
            reason: info?.reason ?? 'Refused by a guardrail.',
            processorId: info?.processorId ?? UNKNOWN_PROCESSOR_ID,
            receipt,
          },
        ],
        terminal: true,
      };
    }

    case 'error': {
      // Empirically confirmed by a spike: Mastra only surfaces a visible `error` chunk on
      // `fullStream` once every fallback entry has been exhausted — an intermediate retry never
      // reaches the stream as its own chunk. Seeing one here means the run has genuinely failed.
      return allProvidersFailed(getErrorChunkError(chunk.payload), context);
    }

    case 'finish': {
      const info = getFinishInfo(chunk.payload);
      draft.usage = { inputTokens: info?.inputTokens ?? 0, outputTokens: info?.outputTokens ?? 0 };
      const receipt = freezeReceipt(draft, primaryEntry, now());
      // A run that streamed to completion always resolved its profile first; a finish chunk without
      // one cannot honestly be reported as completed, since that event's receipt requires it.
      if (info?.reason === 'error' || receipt.kind !== 'profiled') {
        return allProvidersFailed(undefined, context);
      }
      return {
        events: [
          {
            kind: 'completed',
            runId: draft.runId,
            receipt,
            disclaimer: info?.disclaimer ?? false,
            figuresIncomplete: draft.figuresIncomplete ?? false,
          },
        ],
        terminal: true,
      };
    }

    case 'abort':
      // Cancellation produces no terminal event — the consumer already stopped iterating, which
      // is what triggered this in the first place.
      return { events: [], terminal: true };

    default:
      // A chunk type this adapter does not recognize is dropped silently, so a future
      // Mastra minor adding a chunk kind cannot break a run.
      return NO_EVENTS;
  }
}

/**
 * Freezes a draft into the receipt a terminal `AdvisorEvent` carries. `primaryEntry` is
 * `undefined` only for a chain-resolution failure before any model call was ever attempted
 * (`NO_MODEL_AVAILABLE` / `VAULT_LOCKED`) — the one case `providerId`/`modelId` can genuinely have no
 * value.
 *
 * A draft that never received its execution profile and step ceiling freezes into a pre-run
 * receipt rather than a defaulted one: no profile was resolved, so none is recorded. A resolved
 * profile with no step-finish chunk seen yet genuinely took zero steps.
 */
export function freezeReceipt(
  draft: AdvisorRunReceiptDraft,
  primaryEntry: ResolvedChainEntry | undefined,
  finishedAt: string,
): AdvisorRunReceipt {
  const common = {
    runId: draft.runId,
    threadId: draft.threadId,
    startedAt: draft.startedAt,
    finishedAt,
    providerId: draft.providerId ?? primaryEntry?.providerId,
    modelId: draft.modelId ?? primaryEntry?.modelId,
    toolsCalled: [...draft.toolsCalled],
    usage: draft.usage ?? { inputTokens: 0, outputTokens: 0 },
  };
  if (draft.executionProfile === undefined || draft.maxSteps === undefined) {
    return { kind: 'pre-run', ...common };
  }
  return {
    kind: 'profiled',
    ...common,
    executionProfile: draft.executionProfile,
    stepsUsed: draft.stepsUsed ?? 0,
    maxSteps: draft.maxSteps,
  };
}
