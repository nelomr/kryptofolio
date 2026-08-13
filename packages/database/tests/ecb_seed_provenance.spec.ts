import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DAILY_EXCHANGE_RATE_SOURCES } from '@kryptofolio/shared-types';
import { classifyEcbBackupRecord } from '../scripts/ecbBackupRecord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('the ECB backup seeder — provenance', () => {
  it('accepts a row whose source is one the port defines', () => {
    for (const source of DAILY_EXCHANGE_RATE_SOURCES) {
      expect(
        classifyEcbBackupRecord({ date: '2025-04-17', pair: 'USD/EUR', rate: '0.89', source }),
      ).toEqual({ kind: 'accepted', row: { date: '2025-04-17', pair: 'USD/EUR', rate: '0.89', source } });
    }
  });

  it('rejects a row whose source is outside that set instead of copying it into the ledger', () => {
    const outcome = classifyEcbBackupRecord({
      date: '2025-04-17',
      pair: 'USD/EUR',
      rate: '0.89',
      source: 'manual',
    });

    expect(outcome.kind).toBe('rejected');
    if (outcome.kind === 'rejected') expect(outcome.reason).toContain('manual');
  });

  it('rejects a row with no source rather than attributing it to the ECB', () => {
    const outcome = classifyEcbBackupRecord({ date: '2025-04-17', pair: 'USD/EUR', rate: '0.89' });

    expect(outcome.kind).toBe('rejected');
  });

  it('rejects a row missing a date, pair or rate', () => {
    expect(
      classifyEcbBackupRecord({ date: '', pair: 'USD/EUR', rate: '0.89', source: 'ECB' }).kind,
    ).toBe('rejected');
    expect(
      classifyEcbBackupRecord({ date: '2025-04-17', pair: '', rate: '0.89', source: 'ECB' }).kind,
    ).toBe('rejected');
    expect(
      classifyEcbBackupRecord({ date: '2025-04-17', pair: 'USD/EUR', rate: '', source: 'ECB' }).kind,
    ).toBe('rejected');
  });
});

describe('the exchange_rates schema documentation', () => {
  it('documents exactly the provenance values the port accepts', () => {
    const migration = fs.readFileSync(
      path.join(__dirname, '..', 'migrations', 'sqlite', '003_currency_schema.sql'),
      'utf8',
    );
    const sourceColumn = migration
      .split('\n')
      .find((line) => /^\s*source\s+TEXT/.test(line));

    expect(sourceColumn).toBeDefined();
    const documented = [...(sourceColumn ?? '').matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);

    expect(documented).toEqual([...DAILY_EXCHANGE_RATE_SOURCES]);
  });
});
