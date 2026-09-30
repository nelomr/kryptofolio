import { Agent } from '@mastra/core/agent';
import type { ToolsInput, ModelWithRetries } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { advisorRequestContextSchema } from '../advisorRequestContext.js';
import { buildTaxAnalystInstructions } from '../prompts/buildTaxAnalystInstructions.js';

/**
 * `taxAnalyst` holds every Phase 0 read-only tool and is invoked only as a tool inside
 * `advisor`'s own tool-call loop — never directly by a route or use case. It carries no `Memory` of
 * its own; that's reserved for `advisor` alone. Takes Mastra's own `ToolsInput` rather than the
 * full `AdvisorTools` catalogue shape — the composition root is what guarantees all
 * thirteen tools are actually supplied; this factory only needs a valid tool map.
 *
 * `model` accepts a resolved fallback array too — `taxAnalyst` answers
 * through the same resolved chain `advisor` does, not a separately-configured single model.
 */
export function buildTaxAnalystAgent(tools: ToolsInput, model: MastraModelConfig | ModelWithRetries[]) {
  return new Agent({
    id: 'tax-analyst',
    name: 'taxAnalyst',
    requestContextSchema: advisorRequestContextSchema,
    instructions: ({ requestContext }) =>
      buildTaxAnalystInstructions({
        locale: requestContext.get('locale'),
        baseCurrency: requestContext.get('baseCurrency'),
      }),
    model,
    tools,
  });
}
