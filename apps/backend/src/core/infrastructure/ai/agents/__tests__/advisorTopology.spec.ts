import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Memory } from '@mastra/memory';
import { MastraLanguageModelV2Mock } from '@mastra/core/test-utils/llm-mock';
import { buildAdvisorAgent } from '../advisor.js';
import { buildTaxAnalystAgent } from '../taxAnalyst.js';
import { buildInvestmentAnalystAgent } from '../investmentAnalyst.js';

function textOnlyModel(text: string) {
  return new MastraLanguageModelV2Mock({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    }),
  });
}

const aiSubtreeRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

function everySourceFile(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) return everySourceFile(entryPath);
    return entry.name.endsWith('.ts') ? [entryPath] : [];
  });
}

describe('Supervisor Agent With Phased Sub-Agents', () => {
  it('constructs advisor with agents: { taxAnalyst }, leaves investmentAnalyst absent from that map, and only advisor holds Memory', async () => {
    const taxAnalyst = buildTaxAnalystAgent({}, textOnlyModel('irrelevant'), 'metered');
    const investmentAnalyst = buildInvestmentAnalystAgent(textOnlyModel('irrelevant'));
    const advisor = buildAdvisorAgent({
      model: textOnlyModel('irrelevant'),
      memory: new Memory(),
      taxAnalyst,
    });

    const registeredAgents = await advisor.listAgents();
    expect(Object.keys(registeredAgents)).toEqual(['taxAnalyst']);
    expect(registeredAgents.taxAnalyst).toBe(taxAnalyst);

    expect(advisor.hasOwnMemory()).toBe(true);
    expect(taxAnalyst.hasOwnMemory()).toBe(false);
    expect(investmentAnalyst.hasOwnMemory()).toBe(false);
  });

  it('never calls .network() anywhere in the AI subtree — the deprecated agent-network pattern is rejected', () => {
    const offenders = everySourceFile(aiSubtreeRoot).filter(
      (file) => !file.endsWith('.spec.ts') && readFileSync(file, 'utf8').includes('.network('),
    );

    expect(offenders).toEqual([]);
  });
});
