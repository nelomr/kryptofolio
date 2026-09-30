import { Agent } from '@mastra/core/agent';
import type { ModelWithRetries } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { Memory } from '@mastra/memory';
import { ToolCallFilter } from '@mastra/core/processors';
import type { OutputProcessorOrWorkflow } from '@mastra/core/processors';
import { advisorRequestContextSchema } from '../advisorRequestContext.js';
import { createGroundingDetector } from '../guardrails/groundingDetector.js';
import { createDisclaimerProcessor } from '../guardrails/disclaimerProcessor.js';
import type { buildTaxAnalystAgent } from './taxAnalyst.js';

/**
 * The stable prefix of `advisor`'s own instructions — byte-identical across requests, matching the
 * same "Dynamic Instructions" discipline applied to `taxAnalyst`. `advisor` never
 * calls a tool itself — it only ever sees `taxAnalyst` as its one delegate in Phase 0 — and it never
 * restates the tax/tool-usage guidance `taxAnalyst`'s own instructions already carry; only the
 * discipline that applies to *its own* output: never originate a figure, and relay what the
 * delegate reported verbatim.
 */
const STABLE_PREFIX = `Role & scope: You are the supervisor for the user's own local, self-hosted portfolio and tax
advisor. In Phase 0 you have exactly one specialist available: taxAnalyst, for holdings, fiscal
data quality, and per-asset history/analytics questions. Delegate to it for any such question.

Data rules: You never produce or compute a figure yourself. When relaying taxAnalyst's answer,
preserve every figure exactly as it reported them, including any incompleteness caveat.`;

export interface AdvisorAgentConfig {
  /**
   * A single resolved model or a resolved fallback array — the adapter builds a fresh array from
   * `buildModelChainConfig` per request, since retry policy and credentials are per-request facts.
   */
  model: MastraModelConfig | ModelWithRetries[];
  memory: Memory;
  taxAnalyst: ReturnType<typeof buildTaxAnalystAgent>;
  /**
   * Guardrails — defaults to a fresh grounding detector plus disclaimer
   * processor when omitted, since every earlier construction site built `advisor`
   * with none at all. Overridable only so a test can substitute a scripted processor.
   */
  outputProcessors?: OutputProcessorOrWorkflow[];
}

/**
 * The supervisor `Agent`: sub-agents are exposed as tools through the `agents` map
 * (`agents: { taxAnalyst }`), the documented replacement for Mastra's deprecated agent-network
 * primitive. Only `advisor` is constructed with `Memory` — neither `taxAnalyst` nor the
 * declared-but-inactive `investmentAnalyst` carries its own.
 *
 * `ToolCallFilter` is attached here, not on `taxAnalyst`, because it is `advisor`'s own recalled
 * history that a later turn replays. Its documented default (`exclude`/`filterAfterToolSteps` both
 * omitted) already filters only prior-turn tool-call/tool-result pairs while leaving the current
 * run's own tool calls untouched, so no explicit value is passed for either.
 */
export function buildAdvisorAgent({ model, memory, taxAnalyst, outputProcessors }: AdvisorAgentConfig) {
  return new Agent({
    id: 'advisor',
    name: 'advisor',
    requestContextSchema: advisorRequestContextSchema,
    instructions: ({ requestContext }) =>
      `${STABLE_PREFIX}\n\nResponse format: answer in ${requestContext.get('locale')}.`,
    model,
    memory,
    agents: { taxAnalyst },
    inputProcessors: [new ToolCallFilter({ preserveModelOutput: true })],
    outputProcessors: outputProcessors ?? [createGroundingDetector(), createDisclaimerProcessor()],
  });
}
