/**
 * 14.28's second half: no monetary or quantity field on the ingestion path from the column mapper to
 * the ledger is typed as a bare `number`. Every one of them is a decimal string — `PreciseAmount` in
 * the backend, an unbranded string everywhere upstream of it — because `number` is IEEE-754 and a fee
 * derived as `2.236429 − 1.536429` in float64 is `0.7000000000000002`.
 *
 * A test that only reads the type it expects to find would agree with itself; this reads the actual
 * files on disk (`readFileSync`, not a TypeScript import) so a `number` slipped onto one of these
 * fields fails here rather than silently passing review.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..', '..');

/** Every file that touches an amount, a fee or a quantity between the parser and the ledger. */
const MONEY_PATH_FILES = [
  'apps/backend/src/core/application/use-cases/CsvIngestionUseCase.ts',
  'apps/backend/src/core/domain/ports/ILedgerPort.ts',
  'apps/backend/src/core/domain/value-objects/PreciseAmount.ts',
  'apps/backend/src/core/infrastructure/adapters/SQLiteLedgerAdapter.ts',
  'packages/core-domain/src/domain/services/sourceProfile/appliers.ts',
  'packages/core-domain/src/domain/services/sourceProfile/types.ts',
  'packages/core-domain/src/domain/services/normalizer/rowAggregator.ts',
  'packages/core-domain/src/domain/services/normalizer/ingestionPipeline.ts',
  'packages/core-domain/src/domain/services/normalizer/tradeDirection.ts',
  'packages/core-domain/src/domain/services/normalizer/handlers/crypto.ts',
  'packages/core-domain/src/domain/services/normalizer/handlers/trade.ts',
  'packages/core-domain/src/domain/services/normalizer/handlers/transfer.ts',
  'packages/shared-types/src/ingestion/TransactionMappedData.ts',
  'packages/shared-types/src/schemas/ledger.ts',
] as const;

/**
 * A monetary or quantity field name, immediately typed `number` (optionally through `?:` or a union
 * member). Deliberately narrow to named fields rather than banning `number` outright in these files —
 * a loop index or a row count is a legitimate `number` and is not what this test exists to catch.
 */
const MONEY_FIELD_TYPED_NUMBER =
  /\b(amount|amount_in|amount_out|fee_amount|fee|total_fiat|price_fiat|quantity|qty_delta|realized_pnl|funding_amount|gross|net)\s*\??\s*:\s*number\b/;

describe('no monetary or quantity field on the ingestion path is typed as a native number', () => {
  it.each(MONEY_PATH_FILES)('%s', (relativePath) => {
    const source = readFileSync(join(REPO_ROOT, relativePath), 'utf8');
    const offender = source
      .split('\n')
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .find(({ line }) => MONEY_FIELD_TYPED_NUMBER.test(line));

    expect(
      offender,
      offender ? `${relativePath}:${offender.number} — "${offender.line}"` : undefined,
    ).toBeUndefined();
  });

  it('the check itself can fail: a money field typed number is caught', () => {
    expect(MONEY_FIELD_TYPED_NUMBER.test('  amount: number;')).toBe(true);
    expect(MONEY_FIELD_TYPED_NUMBER.test('  fee_amount?: number;')).toBe(true);
    // A loop index or an unrelated count is not what this test polices.
    expect(MONEY_FIELD_TYPED_NUMBER.test('  index: number;')).toBe(false);
    expect(MONEY_FIELD_TYPED_NUMBER.test('  year: number;')).toBe(false);
  });
});
