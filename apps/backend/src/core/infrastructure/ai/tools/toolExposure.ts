import {
  ADVISOR_TOOL_NAMES,
  ADVISOR_TOOL_TIERS,
  type AdvisorToolName,
  type ExecutionProfileKind,
} from '@kryptofolio/shared-types';

/**
 * A metered or mixed run sees the whole catalogue; a local run sees the `core` tier only, because
 * small local models pick measurably worse from a long tool list. Static by design: there is no
 * setting that toggles an individual tool.
 */
export function exposedToolNames(kind: ExecutionProfileKind): readonly AdvisorToolName[] {
  return kind === 'local'
    ? ADVISOR_TOOL_NAMES.filter((name) => ADVISOR_TOOL_TIERS[name] === 'core')
    : ADVISOR_TOOL_NAMES;
}

export function selectExposedTools<T extends Record<AdvisorToolName, unknown>>(
  tools: T,
  kind: ExecutionProfileKind,
): Partial<T> {
  const selected: Partial<T> = {};
  for (const name of exposedToolNames(kind)) {
    selected[name] = tools[name];
  }
  return selected;
}
