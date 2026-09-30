import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  AI_PROVIDER_IDS,
  advisorStreamEventSchema,
  modelChainEntrySchema,
  executionProfilesSchema,
} from '@kryptofolio/shared-types';
import type { AiProviderId } from '@kryptofolio/shared-types';
import { bffLogger } from '../../utils/logger.js';
import type { AskAdvisorUC } from '../../application/use-cases/AskAdvisorUC.js';
import type { AdvisorEvent } from '../../domain/models/AdvisorEvent.js';
import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort.js';
import type { IVaultCredentialsPort } from '../../domain/ports/IVaultCredentialsPort.js';
import type { ICryptographyPort } from '../../domain/ports/ICryptographyPort.js';
import { readModelChain, writeModelChain } from '../ai/models/resolveModelChain.js';
import { readExecutionProfiles, writeExecutionProfiles } from '../ai/models/executionProfilesSettings.js';
import { toWireEvent, askAdvisorRequestSchema, advisorConfigSchema, advisorAnswerSchema } from '../dtos/advisor.js';
import type { AdvisorAnswer } from '../dtos/advisor.js';

type Env = { Bindings: { MODE?: string; SECRET_API_KEY?: string } };

const KEEP_ALIVE_INTERVAL_MS = 15_000;

/**
 * The routes' own dependency shape, deliberately narrower than the full composition root — this
 * file is testable with a handful of stand-ins, and the real `container` wiring is a later
 * concern (tool factories, `Memory`, the Mastra agent graph) that belongs to `AskAdvisorUC` itself.
 */
export interface AdvisorRouteDeps {
  readonly askAdvisorUC: Pick<AskAdvisorUC, 'execute'>;
  readonly userSettingsPort: IUserSettingsPort;
  readonly vaultCredentialsPort: IVaultCredentialsPort;
  readonly cryptographyPort: ICryptographyPort;
}

async function credentialStateFor(
  providerId: AiProviderId,
  deps: AdvisorRouteDeps,
): Promise<{ kind: 'present' } | { kind: 'absent' } | { kind: 'locked' }> {
  if (providerId === 'ollama') {
    // A local Ollama daemon call needs no vault-held secret at all.
    return { kind: 'present' };
  }
  const configured = await deps.vaultCredentialsPort.getConfiguredServices();
  if (!configured.includes(providerId)) {
    return { kind: 'absent' };
  }
  return deps.cryptographyPort.isUnlocked() ? { kind: 'present' } : { kind: 'locked' };
}

function isTerminal(event: AdvisorEvent): event is Extract<AdvisorEvent, { kind: 'completed' | 'refused' | 'failed' }> {
  return event.kind === 'completed' || event.kind === 'refused' || event.kind === 'failed';
}

function answerFrom(event: Extract<AdvisorEvent, { kind: 'completed' | 'refused' | 'failed' }>, text: string): AdvisorAnswer {
  switch (event.kind) {
    case 'completed':
      return { outcome: 'completed', text, receipt: event.receipt };
    case 'refused':
      return { outcome: 'refused', reason: event.reason, processorId: event.processorId };
    case 'failed':
      return { outcome: 'failed', code: event.code };
  }
}

export function createAdvisorApi(deps: AdvisorRouteDeps) {
  return new Hono<Env>()
    .post('/ask', zValidator('json', askAdvisorRequestSchema), async (c) => {
      const { message, threadId } = c.req.valid('json');
      let text = '';
      let answer: AdvisorAnswer = { outcome: 'failed', code: 'INTERNAL_ERROR' };
      const signal = c.req.raw.signal;
      const iterator = deps.askAdvisorUC.execute({ message, threadId })[Symbol.asyncIterator]();
      const hangup = new Promise<'hangup'>((resolve) => {
        if (signal.aborted) resolve('hangup');
        else signal.addEventListener('abort', () => resolve('hangup'), { once: true });
      });
      try {
        while (true) {
          const pending = iterator.next();
          const step = await Promise.race([pending, hangup]);
          if (step === 'hangup') {
            // A generator queues return() behind an in-flight next(); swallow that next()'s outcome
            // so a rejection after the hang-up is not reported as unhandled.
            pending.catch(() => undefined);
            await iterator.return?.();
            break;
          }
          if (step.done) break;
          const event = step.value;
          if (event.kind === 'token') {
            text += event.text;
          }
          if (isTerminal(event)) {
            answer = answerFrom(event, text);
          }
        }
      } catch (err) {
        bffLogger.error({ err }, 'Advisor ask route failed unexpectedly');
        answer = { outcome: 'failed', code: 'INTERNAL_ERROR' };
      }
      return c.json(advisorAnswerSchema.parse(answer));
    })

    .post('/stream', zValidator('json', askAdvisorRequestSchema), async (c) => {
      const { message, threadId } = c.req.valid('json');

      return streamSSE(c, async (stream) => {
        const iterable = deps.askAdvisorUC.execute({ message, threadId });
        const iterator = iterable[Symbol.asyncIterator]();
        let aborted = false;

        stream.onAbort(() => {
          aborted = true;
          void iterator.return?.();
        });

        const keepAlive = setInterval(() => {
          void stream.write(': keep-alive\n\n');
        }, KEEP_ALIVE_INTERVAL_MS);

        try {
          // The use case persists the run receipt after it yields the terminal event, so the
          // iterator must be resumed to completion; stopping at the terminal frame would leave the
          // run unrecorded.
          let terminalSent = false;
          while (!aborted) {
            const next = await iterator.next();
            if (next.done) break;
            if (terminalSent) continue;

            const wire = advisorStreamEventSchema.parse(toWireEvent(next.value));
            await stream.writeSSE({ data: JSON.stringify(wire), event: wire.kind });

            terminalSent = wire.kind === 'done' || wire.kind === 'refused' || wire.kind === 'failed';
          }
        } catch (err) {
          bffLogger.error({ err }, 'Advisor stream route failed unexpectedly');
          if (!aborted) {
            const wire = advisorStreamEventSchema.parse({
              kind: 'failed',
              runId: 'unknown',
              code: 'INTERNAL_ERROR',
            });
            await stream.writeSSE({ data: JSON.stringify(wire), event: wire.kind });
          }
        } finally {
          clearInterval(keepAlive);
        }
      });
    })

    .get('/config', async (c) => {
      const chain = (await readModelChain(deps.userSettingsPort)) ?? [];
      const providers = await Promise.all(
        AI_PROVIDER_IDS.map(async (id) => ({
          id,
          category: { kind: 'ai-model' as const },
          credential: await credentialStateFor(id, deps),
        })),
      );
      return c.json(advisorConfigSchema.parse({ chain, providers }));
    })

    .put('/config/model-chain', zValidator('json', z.array(modelChainEntrySchema).min(1)), async (c) => {
      const chain = c.req.valid('json');
      await writeModelChain(deps.userSettingsPort, chain);
      return c.json({ success: true });
    })

    .get('/config/execution-profiles', async (c) => {
      const profiles = await readExecutionProfiles(deps.userSettingsPort);
      return c.json(profiles);
    })

    .put('/config/execution-profiles', zValidator('json', executionProfilesSchema), async (c) => {
      const profiles = c.req.valid('json');
      await writeExecutionProfiles(deps.userSettingsPort, profiles);
      return c.json(profiles);
    });
}

export type AdvisorApi = ReturnType<typeof createAdvisorApi>;
