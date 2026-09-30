import type { MessageListInput } from '@mastra/core/agent/message-list';
import type { AgentMemoryOption } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import type { AdvisorRequestContextValues } from '../advisorRequestContext.js';
import type { ResolvedExecutionProfile } from '../models/resolveExecutionProfile.js';

export interface AdvisorRunOptions {
  requestContext: RequestContext<AdvisorRequestContextValues>;
  executionProfile: ResolvedExecutionProfile;
  /** Thread/resource selection for this call — omitted only by a test double with no memory. */
  memory?: AgentMemoryOption;
  /** The adapter's own per-run `AbortController.signal` — never a domain `AbortSignal`. */
  abortSignal?: AbortSignal;
}

type AdvisorRunCallOptions = {
  requestContext: RequestContext<AdvisorRequestContextValues>;
  maxSteps: number;
  memory?: AgentMemoryOption;
  abortSignal?: AbortSignal;
};

/**
 * The exact call shape every `advisor.stream` call site must use — narrow enough that the real
 * `advisor` `Agent` instance satisfies it structurally, without importing Mastra's full overloaded
 * `stream` signature here. Generic over the result type so a real `Agent`'s precise return type
 * (`Promise<MastraModelOutput<TOutput>>`) survives through this wrapper instead of collapsing to
 * `unknown` — the adapter needs `.fullStream`.
 */
export interface AdvisorRunTarget<TStreamResult = unknown> {
  stream(messages: MessageListInput, options: AdvisorRunCallOptions): TStreamResult;
}

function toCallOptions(options: AdvisorRunOptions): AdvisorRunCallOptions {
  return {
    requestContext: options.requestContext,
    maxSteps: options.executionProfile.settings.maxSteps,
    ...(options.memory ? { memory: options.memory } : {}),
    ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
  };
}

/**
 * `maxSteps` is resolved from the run's execution profile (5 metered / 15 local) on every
 * call — never a bare literal and never left to Mastra's own library default. The
 * adapter is the only intended caller.
 */
export function streamWithAdvisor<TResult>(
  advisor: AdvisorRunTarget<TResult>,
  messages: MessageListInput,
  options: AdvisorRunOptions,
): TResult {
  return advisor.stream(messages, toCallOptions(options));
}
