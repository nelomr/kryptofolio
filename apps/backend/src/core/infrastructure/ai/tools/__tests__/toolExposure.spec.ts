import { describe, it, expect } from 'vitest';
import { ADVISOR_TOOL_NAMES, ADVISOR_TOOL_TIERS, type AdvisorToolName } from '@kryptofolio/shared-types';
import { exposedToolNames, selectExposedTools } from '../toolExposure.js';

const CORE_NAMES = ADVISOR_TOOL_NAMES.filter((name) => ADVISOR_TOOL_TIERS[name] === 'core');

function everyTool(): Record<AdvisorToolName, { id: string }> {
  return Object.fromEntries(ADVISOR_TOOL_NAMES.map((name) => [name, { id: name }])) as Record<
    AdvisorToolName,
    { id: string }
  >;
}

describe('tool exposure per execution profile', () => {
  it('a local profile exposes exactly the core tier', () => {
    expect([...exposedToolNames('local')].sort()).toEqual([...CORE_NAMES].sort());
    expect(Object.keys(selectExposedTools(everyTool(), 'local')).sort()).toEqual([...CORE_NAMES].sort());
  });

  it('a metered profile exposes every tool, and so does a mixed run, which resolves to metered', () => {
    expect([...exposedToolNames('metered')].sort()).toEqual([...ADVISOR_TOOL_NAMES].sort());
    expect(Object.keys(selectExposedTools(everyTool(), 'metered')).sort()).toEqual([...ADVISOR_TOOL_NAMES].sort());
  });

  it('keeps the tool objects themselves, not copies', () => {
    const tools = everyTool();

    expect(selectExposedTools(tools, 'local').portfolio_summary).toBe(tools.portfolio_summary);
  });

  it('never exposes an extended tool to a local run', () => {
    const exposed = Object.keys(selectExposedTools(everyTool(), 'local'));

    for (const name of ADVISOR_TOOL_NAMES) {
      if (ADVISOR_TOOL_TIERS[name] === 'extended') expect(exposed).not.toContain(name);
    }
  });
});
