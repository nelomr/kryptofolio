import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { findRouteLogicLeaks, readSource } from '../../ai/__tests__/support/advisorSourceScan.js';

// Assembled so this file does not itself look like an import inside the Mastra import zone scan.
const MASTRA_AGENT_MODULE = ['@mastra', 'core', 'agent'].join('/');
const ROUTE_FILE = join(import.meta.dirname, '..', 'advisor.ts');

describe('advisor route delegates only', () => {
  it('reaches no model, tool, prompt, or monetary figure from the route source', () => {
    const source = readSource(ROUTE_FILE);
    expect(source).toContain('createAdvisorApi');
    expect(findRouteLogicLeaks(source)).toEqual([]);
  });

  it.each([
    ['an agent-graph import', 'import { advisor } from "../ai/agents/advisor.js";', 'import of ../ai/agents/advisor.js'],
    ['a tool import', 'import { t } from "../ai/tools/index.js";', 'import of ../ai/tools/index.js'],
    ['a Mastra import', `import { Agent } from ${JSON.stringify(MASTRA_AGENT_MODULE)};`, `import of ${MASTRA_AGENT_MODULE}`],
    ['a direct model call', 'await port.ask(request);', 'call to .ask()'],
    ['a price lookup', 'await prices.getLatest("BTC", "EUR");', 'call to .getLatest()'],
    ['prompt construction', 'const p = buildTaxAnalystInstructions();', 'reference to buildTaxAnalystInstructions'],
    ['a figure computation', 'const v = Number(total).toFixed(2);', 'toFixed'],
  ])('detects %s', (_label, source, rule) => {
    expect(findRouteLogicLeaks(source).map((v) => v.rule)).toContain(rule);
  });

  it('does not flag the delegating call to the use case', () => {
    expect(findRouteLogicLeaks('for await (const e of deps.askAdvisorUC.execute({ message })) {}')).toEqual([]);
  });
});
