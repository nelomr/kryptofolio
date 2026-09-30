import { z } from 'zod';
import {
  advisorStreamEventSchema,
  modelChainSchema,
  modelChainEntrySchema,
  ADVISOR_FAILURE_CODES,
  AI_PROVIDER_IDS,
  type AdvisorStreamEvent,
} from '@kryptofolio/shared-types';
import type { AdvisorEvent } from '../../domain/models/AdvisorEvent.js';

/**
 * The single conversion site between the domain vocabulary (`AdvisorEvent`) and the wire vocabulary
 * (`AdvisorStreamEvent`). No route or adapter file constructs a `done`/`refused`/`failed` object of
 * its own — every terminal frame passes through here, and the output is always validated against
 * `advisorStreamEventSchema` before it can leave this function.
 */
export function toWireEvent(event: AdvisorEvent): AdvisorStreamEvent {
  switch (event.kind) {
    case 'token':
      return advisorStreamEventSchema.parse({ kind: 'token', runId: event.runId, text: event.text });
    case 'tool-start':
      return advisorStreamEventSchema.parse({
        kind: 'tool-start',
        runId: event.runId,
        callId: event.callId,
        tool: event.tool,
      });
    case 'tool-result':
      return advisorStreamEventSchema.parse({
        kind: 'tool-result',
        runId: event.runId,
        callId: event.callId,
        tool: event.tool,
      });
    case 'tool-error':
      return advisorStreamEventSchema.parse({
        kind: 'tool-error',
        runId: event.runId,
        callId: event.callId,
        tool: event.tool,
        code: event.code,
      });
    case 'completed':
      return advisorStreamEventSchema.parse(doneFrom(event));
    case 'refused':
      return advisorStreamEventSchema.parse({
        kind: 'refused',
        runId: event.runId,
        threadId: event.receipt.threadId,
        reason: event.reason,
        processorId: event.processorId,
      });
    case 'failed':
      return advisorStreamEventSchema.parse({
        kind: 'failed',
        runId: event.runId,
        threadId: event.receipt.threadId,
        code: event.code,
        ...(event.code === 'ALL_PROVIDERS_FAILED' ? { cause: event.cause } : {}),
      });
  }
}

function doneFrom(event: Extract<AdvisorEvent, { kind: 'completed' }>) {
  const { runId, receipt } = event;
  return {
    kind: 'done' as const,
    runId,
    threadId: receipt.threadId,
    providerId: receipt.providerId,
    modelId: receipt.modelId,
    usage: receipt.usage,
    toolsCalled: receipt.toolsCalled,
    executionProfile: receipt.executionProfile,
    stepsUsed: receipt.stepsUsed,
    maxSteps: receipt.maxSteps,
    disclaimer: event.disclaimer,
    figuresIncomplete: event.figuresIncomplete,
  };
}

// ---------------------------------------------------------------------------
// Boundary A — HTTP inbound
// ---------------------------------------------------------------------------

export const askAdvisorRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  threadId: z.string().uuid().optional(),
});
export type AskAdvisorRequest = z.infer<typeof askAdvisorRequestSchema>;

export { modelChainSchema };

// ---------------------------------------------------------------------------
// Boundary A — HTTP outbound
// ---------------------------------------------------------------------------

const credentialStateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('present') }),
  z.object({ kind: z.literal('absent') }),
  z.object({ kind: z.literal('locked') }),
]);
export type CredentialState = z.infer<typeof credentialStateSchema>;

const advisorConfigProviderSchema = z
  .object({
    id: z.enum(AI_PROVIDER_IDS),
    category: z.object({ kind: z.literal('ai-model') }),
    credential: credentialStateSchema,
  })
  .strict();

export const advisorConfigSchema = z.object({
  chain: z.array(modelChainEntrySchema),
  providers: z.array(advisorConfigProviderSchema),
});
export type AdvisorConfig = z.infer<typeof advisorConfigSchema>;

const advisorReceiptSchema = z.object({
  runId: z.string(),
  threadId: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  providerId: z.enum(AI_PROVIDER_IDS).optional(),
  modelId: z.string().optional(),
  toolsCalled: z.array(z.string()).readonly(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }),
  executionProfile: z.enum(['local', 'metered', 'mixed']),
  stepsUsed: z.number().int().nonnegative(),
  maxSteps: z.number().int().positive(),
});

export const advisorAnswerSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('completed'), text: z.string(), receipt: advisorReceiptSchema }),
  z.object({ outcome: z.literal('refused'), reason: z.string(), processorId: z.string() }),
  z.object({ outcome: z.literal('failed'), code: z.enum(ADVISOR_FAILURE_CODES) }),
]);
export type AdvisorAnswer = z.infer<typeof advisorAnswerSchema>;
