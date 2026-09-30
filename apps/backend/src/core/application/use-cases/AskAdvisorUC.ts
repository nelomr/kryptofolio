import { randomUUID } from 'node:crypto';
import type { IAdvisorPort } from '../../domain/ports/IAdvisorPort.js';
import type { IAdvisorRunLogPort } from '../../domain/ports/IAdvisorRunLogPort.js';
import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort.js';
import type { AdvisorEvent } from '../../domain/models/AdvisorEvent.js';
import type { AdvisorRequest } from '../../domain/models/AdvisorRequest.js';
import type { AdvisorRunOutcome } from '../../domain/models/AdvisorRunReceipt.js';

export interface AskAdvisorInput {
  readonly message: string;
  readonly threadId?: string;
}

function outcomeFor(event: Extract<AdvisorEvent, { kind: 'completed' | 'refused' | 'failed' }>): AdvisorRunOutcome {
  switch (event.kind) {
    case 'completed':
      return { kind: 'completed' };
    case 'refused':
      return { kind: 'refused', reason: event.reason };
    case 'failed':
      return { kind: 'failed', code: event.code };
  }
}

/**
 * AskAdvisorUC — orchestrates one advisor run: the Functional Sandwich at stream scale.
 *
 * Resolves context impurely (locale/base currency via `IUserSettingsPort`), delegates the entire
 * run through `IAdvisorPort`, and persists the audit row via `IAdvisorRunLogPort` — on whichever
 * terminal event the port yields, or from `finally` when the consumer stops iterating before one
 * ever arrives. Never touches SQLite, the ledger, or any port beyond these three; a receipt is the
 * only thing this use case ever writes anywhere.
 *
 * `threadId` is always resolved here, even when the caller omits one, so the aborted-run row below
 * always has a real thread to point at. Every `AdvisorEvent` — terminal or not — carries the `runId`
 * the port assigned when the run started, so the cancellation path can reuse the real id instead of
 * inventing one: an event has to have been yielded for the loop to abandon iteration at all, so by
 * the time `finally` runs there is always at least one real `runId` to fall back on unless the port
 * threw before yielding anything.
 */
export class AskAdvisorUC {
  private readonly advisorPort: IAdvisorPort;
  private readonly advisorRunLogPort: IAdvisorRunLogPort;
  private readonly userSettingsPort: IUserSettingsPort;

  constructor(advisorPort: IAdvisorPort, advisorRunLogPort: IAdvisorRunLogPort, userSettingsPort: IUserSettingsPort) {
    this.advisorPort = advisorPort;
    this.advisorRunLogPort = advisorRunLogPort;
    this.userSettingsPort = userSettingsPort;
  }

  async *execute(input: AskAdvisorInput): AsyncIterable<AdvisorEvent> {
    const locale = (await this.userSettingsPort.getSetting('language')) ?? 'en';
    const baseCurrency = (await this.userSettingsPort.getSetting('base_currency')) ?? 'USD';
    const threadId = input.threadId ?? randomUUID();
    const startedAt = new Date().toISOString();

    const request: AdvisorRequest = { message: input.message, threadId, locale, baseCurrency };

    let persisted = false;
    let lastSeenRunId: string | undefined;
    try {
      for await (const event of this.advisorPort.ask(request)) {
        lastSeenRunId = event.runId;
        yield event;
        if (event.kind === 'completed' || event.kind === 'refused' || event.kind === 'failed') {
          await this.advisorRunLogPort.appendRun(event.receipt, outcomeFor(event));
          persisted = true;
        }
      }
    } finally {
      if (!persisted) {
        await this.advisorRunLogPort.appendRun(
          { runId: lastSeenRunId ?? randomUUID(), threadId, startedAt, toolsCalled: [] },
          { kind: 'aborted' },
        );
      }
    }
  }
}
