import { describe, it, expect, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import { defaultExecutionProfiles } from '@kryptofolio/shared-types';
import { streamWithAdvisor } from '../runAdvisor.js';
import type { AdvisorRequestContextValues } from '../../advisorRequestContext.js';
import type { ResolvedExecutionProfile } from '../../models/resolveExecutionProfile.js';

const requestContext = new RequestContext<AdvisorRequestContextValues>([
  ['locale', 'en'],
  ['baseCurrency', 'EUR'],
]);

/**
 * `maxSteps` deliberately set to values no plausible hardcoded literal (5 metered / 15 local, the
 * profile's own defaults) would coincidentally match — a break that hardcodes either default must
 * still be caught here, unlike testing against `defaultExecutionProfiles()`'s own numbers directly.
 */
const meteredProfile: ResolvedExecutionProfile = {
  runProfile: 'metered',
  kind: 'metered',
  settings: { ...defaultExecutionProfiles().metered, maxSteps: 7 },
};

const localProfile: ResolvedExecutionProfile = {
  runProfile: 'local',
  kind: 'local',
  settings: { ...defaultExecutionProfiles().local, maxSteps: 22 },
  contextWindow: 8192,
};

/**
 * `maxSteps` is passed explicitly on every `advisor.stream(...)` call site, resolved from the
 * run's execution profile — never a bare literal and never the library default.
 */
describe('maxSteps is resolved from the execution profile on every advisor call site', () => {
  it('passes the metered profile maxSteps to stream, not a hardcoded literal', async () => {
    const advisor = { stream: vi.fn(async () => 'ok') };

    await streamWithAdvisor(advisor, 'hello', { requestContext, executionProfile: meteredProfile });

    expect(advisor.stream).toHaveBeenCalledWith('hello', { requestContext, maxSteps: 7 });
  });

  it('passes the local profile maxSteps to stream, not a hardcoded literal', async () => {
    const advisor = { stream: vi.fn(async () => 'ok') };

    await streamWithAdvisor(advisor, 'hello', { requestContext, executionProfile: localProfile });

    expect(advisor.stream).toHaveBeenCalledWith('hello', { requestContext, maxSteps: 22 });
  });
});
