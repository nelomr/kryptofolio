import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyMigrations } from '@kryptofolio/database';
import {
  composeAskAdvisor,
  lateBoundToolUseCases,
  readAdvisorEnv,
  type ToolUseCaseSource,
} from '../advisorComposition.js';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort.js';
import type { ICryptographyPort } from '../../../domain/ports/ICryptographyPort.js';
import type { IVaultCredentialsPort } from '../../../domain/ports/IVaultCredentialsPort.js';
import type { AdvisorEvent } from '../../../domain/models/AdvisorEvent.js';

class SettingsStub implements IUserSettingsPort {
  private readonly values = new Map<string, string>();
  async getSetting(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async setSetting(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

const cryptographyStub: ICryptographyPort = {
  isUnlocked: () => false,
} as unknown as ICryptographyPort;

const vaultStub: IVaultCredentialsPort = {
  getConfiguredServices: async () => [],
} as unknown as IVaultCredentialsPort;

const SOURCE_KEYS = [
  'getPortfolioSummaryUseCase',
  'getFiscalIntegrityUseCase',
  'getTokenHistoryUseCase',
  'getAssetAllocationUseCase',
  'getRiskMetricsUseCase',
  'getKpisUseCase',
  'getDrawdownCurveUseCase',
  'getPerformanceHistoryUseCase',
  'getVolatilityHeatmapUseCase',
  'getSpanishTaxReportUseCase',
  'priceHistoryPort',
] as const satisfies readonly (keyof ToolUseCaseSource)[];

/** Every entry throws when read unless overridden, so a test proves which ones it actually touches. */
function sourceWith(overrides: Partial<Record<keyof ToolUseCaseSource, () => unknown>> = {}): ToolUseCaseSource {
  const source = {};
  for (const key of SOURCE_KEYS) {
    Object.defineProperty(source, key, {
      get:
        overrides[key] ??
        (() => {
          throw new Error(`${key} is not used in this test`);
        }),
    });
  }
  return source as ToolUseCaseSource;
}

describe('advisor composition', () => {
  let dir: string;
  let ledgerPath: string;
  let advisorDbPath: string;
  let ledgerDb: DatabaseSync;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'advisor-composition-'));
    ledgerPath = path.join(dir, 'ledger.db');
    advisorDbPath = path.join(dir, 'ai-advisor.db');
    ledgerDb = new DatabaseSync(ledgerPath);
    ledgerDb.exec('PRAGMA foreign_keys = ON;');
    applyMigrations(ledgerDb);
  });

  afterEach(() => {
    ledgerDb.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('builds a use case whose run is audited in the ledger and whose memory lives in its own file', async () => {
    const askAdvisorUC = composeAskAdvisor({
      ledgerDb,
      advisorDbPath,
      userSettingsPort: new SettingsStub(),
      cryptographyPort: cryptographyStub,
      vaultPort: vaultStub,
      toolUseCases: lateBoundToolUseCases(sourceWith()),
    });

    const events: AdvisorEvent[] = [];
    for await (const event of askAdvisorUC.execute({ message: 'hello' })) events.push(event);

    const terminal = events[events.length - 1];
    expect(terminal?.kind).toBe('failed');
    expect(terminal?.kind === 'failed' ? terminal.code : undefined).toBe('NO_MODEL_AVAILABLE');

    const rows = ledgerDb.prepare('SELECT outcome, failure_code FROM ai_advisor_runs').all();
    expect(rows).toEqual([{ outcome: 'failed', failure_code: 'NO_MODEL_AVAILABLE' }]);
    expect(fs.existsSync(advisorDbPath)).toBe(true);
    expect(advisorDbPath).not.toBe(ledgerPath);
  });

  it('resolves each tool use case from the source at read time, so a rebound analytical adapter is seen', () => {
    const first = { tag: 'first' };
    const second = { tag: 'second' };
    let current: object = first;
    const toolUseCases = lateBoundToolUseCases(sourceWith({ getKpisUseCase: () => current }));

    expect(toolUseCases.kpis).toBe(first);
    current = second;
    expect(toolUseCases.kpis).toBe(second);
  });

  it('maps the same use case onto both tools that share it', () => {
    const shared = { tag: 'shared' };
    const toolUseCases = lateBoundToolUseCases(
      sourceWith({ getFiscalIntegrityUseCase: () => shared, getTokenHistoryUseCase: () => shared }),
    );

    expect(toolUseCases.fiscalIntegrity).toBe(toolUseCases.fiscalIntegrityRows);
    expect(toolUseCases.tokenHistory).toBe(toolUseCases.tokenLots);
  });
});

describe('readAdvisorEnv', () => {
  it('leaves the Ollama base URL undefined when the variable is absent or blank', () => {
    expect(readAdvisorEnv({}).ollamaBaseURL).toBeUndefined();
    expect(readAdvisorEnv({ OLLAMA_BASE_URL: '   ' }).ollamaBaseURL).toBeUndefined();
  });

  it('passes a configured Ollama base URL through trimmed', () => {
    expect(readAdvisorEnv({ OLLAMA_BASE_URL: ' http://gpu-box:11434/api ' }).ollamaBaseURL).toBe(
      'http://gpu-box:11434/api',
    );
  });
});
