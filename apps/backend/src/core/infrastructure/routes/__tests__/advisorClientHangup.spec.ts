import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createAdvisorApi, type AdvisorRouteDeps } from '../advisor.js';
import { AskAdvisorUC } from '../../../application/use-cases/AskAdvisorUC.js';
import type { IAdvisorPort } from '../../../domain/ports/IAdvisorPort.js';
import type { IAdvisorRunLogPort } from '../../../domain/ports/IAdvisorRunLogPort.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import type { AdvisorEvent } from '../../../domain/models/AdvisorEvent.js';
import type { AdvisorRunOutcome } from '../../../domain/models/AdvisorRunReceipt.js';
import type { IVaultCredentialsPort } from '../../../domain/ports/IVaultCredentialsPort.js';
import type { ICryptographyPort } from '../../../domain/ports/ICryptographyPort.js';

const settings: IUserSettingsPort = {
  getSetting: async () => null,
  setSetting: async () => undefined,
};

describe('POST /ask — client hang-up', () => {
  it('stops the run, closes the port iterator and records exactly one aborted row', async () => {
    const outcomes: AdvisorRunOutcome[] = [];
    const runLog: IAdvisorRunLogPort = {
      appendRun: async (_receipt, outcome) => {
        outcomes.push(outcome);
      },
    };
    let portFinallyRan = false;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const port: IAdvisorPort = {
      ask: async function* (): AsyncGenerator<AdvisorEvent> {
        try {
          yield { kind: 'token', runId: 'run-1', text: 'partial' };
          await gate;
          yield {
            kind: 'failed',
            runId: 'run-1',
            code: 'INTERNAL_ERROR',
            receipt: {
              kind: 'pre-run',
              runId: 'run-1',
              threadId: 't',
              startedAt: '2026-01-01T00:00:00.000Z',
              finishedAt: '2026-01-01T00:00:01.000Z',
              toolsCalled: [],
              usage: { inputTokens: 0, outputTokens: 0 },
            },
          };
        } finally {
          portFinallyRan = true;
        }
      },
    };
    const deps: AdvisorRouteDeps = {
      askAdvisorUC: new AskAdvisorUC(port, runLog, settings),
      userSettingsPort: settings,
      vaultCredentialsPort: {} as IVaultCredentialsPort,
      cryptographyPort: {} as ICryptographyPort,
    };
    const app = new Hono().route('/api/advisor', createAdvisorApi(deps));
    const controller = new AbortController();

    const response = app.request('/api/advisor/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
      signal: controller.signal,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();
    release();
    await response;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(outcomes).toEqual([{ kind: 'aborted' }]);
    expect(portFinallyRan).toBe(true);
  });
});
