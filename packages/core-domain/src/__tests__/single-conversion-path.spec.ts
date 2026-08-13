/**
 * One way to multiply money by a rate, not three.
 *
 * Two already exist and are both legitimate: the DuckDB views, which convert
 * set-based inside SQL, and `CurrencyConverter`, which converts a single figure in
 * TypeScript. Adding a third — a local `amount * rate` helper next to whichever
 * call site needed one — is the patch-over-fix this project forbids, and it is how
 * the rate-date rule would end up with no single definition.
 *
 * This suite is a guard, so it scans source rather than behaviour.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CurrencyConverter } from '../application/CurrencyConverter';
import { createFiatMoney, type ExchangeRate } from '../domain/models/MoneyEntities';
import { Money } from '../value-objects/Money';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

/** The packages whose TypeScript may convert a single figure. */
const SCANNED = [
  'packages/core-domain/src',
  'packages/shared-types/src',
  'apps/backend/src',
  'apps/frontend/src',
];

/**
 * The only TypeScript site permitted to multiply a monetary amount by an exchange
 * rate. Everything else either goes through it or converts set-based in SQL.
 */
const SANCTIONED = path.join('packages', 'core-domain', 'src', 'application', 'CurrencyConverter.ts');

/**
 * Comments are stripped before scanning. A JSDoc line reads `* @param rate`, which
 * a "multiplied by something rate-shaped" pattern matches perfectly — the assertion
 * would then be reporting on prose rather than on code.
 */
function strippedSource(file: string): string {
  return fs
    .readFileSync(path.join(REPO_ROOT, file), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function sourceFiles(dir: string): readonly string[] {
  const absolute = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(absolute)) return [];
  return fs
    .readdirSync(absolute, { recursive: true, encoding: 'utf-8' })
    .filter((entry) => entry.endsWith('.ts') || entry.endsWith('.vue'))
    .filter((entry) => !entry.includes('__tests__') && !entry.includes('.spec.'))
    .map((entry) => path.join(dir, entry));
}

describe('CurrencyConverter is the single TypeScript conversion path', () => {
  it('converts a single figure exactly, without rounding', () => {
    const basis = createFiatMoney('1234.567890123456', 'EUR');
    const rate: ExchangeRate = {
      from: 'EUR',
      to: 'USD',
      rate: new Money('1.0825'),
      timestamp: '2023-06-15T00:00:00Z',
    };

    const converted = CurrencyConverter.convert(basis, rate);

    expect(converted.currency).toBe('USD');
    // Exact to the last place: the DOUBLE product is 1336.4197410586412.
    expect(converted.amount.toString()).toBe('1336.41974105864112');
  });

  it('refuses a rate that does not start from the money it is given', () => {
    const basis = createFiatMoney('100', 'EUR');
    const wrongWay: ExchangeRate = {
      from: 'USD',
      to: 'EUR',
      rate: new Money('0.9'),
      timestamp: '2023-06-15T00:00:00Z',
    };

    expect(() => CurrencyConverter.convert(basis, wrongWay)).toThrow(/Currency mismatch/);
  });

  it('is the identity when the rate is 1, to the last place', () => {
    const basis = createFiatMoney('1234.567890123456', 'USD');
    const identity: ExchangeRate = {
      from: 'USD',
      to: 'USD',
      rate: new Money('1'),
      timestamp: '2023-06-15T00:00:00Z',
    };

    expect(CurrencyConverter.convert(basis, identity).amount.toString()).toBe('1234.567890123456');
  });

  it('has no rival rate-multiplication helper anywhere in the scanned packages', () => {
    // Deliberately syntactic: any expression multiplying something rate-shaped.
    const RATE_MULTIPLICATION = /\b\w*[rR]ate\w*\s*\.\s*mul\s*\(|\*\s*\w*(?:fx|Fx|FX)?[rR]ate\b/;

    const offenders = SCANNED.flatMap(sourceFiles)
      .filter((file) => file !== SANCTIONED)
      .filter((file) => RATE_MULTIPLICATION.test(strippedSource(file)));

    expect(offenders).toEqual([]);
  });

  it('proves that scan would catch a rival helper', () => {
    // Without this the assertion above passes just as well against a broken regex.
    const RATE_MULTIPLICATION = /\b\w*[rR]ate\w*\s*\.\s*mul\s*\(|\*\s*\w*(?:fx|Fx|FX)?[rR]ate\b/;

    expect(RATE_MULTIPLICATION.test('const out = amount.mul(fxRate);')).toBe(false);
    expect(RATE_MULTIPLICATION.test('const out = new Decimal(amount).times(fxRate);')).toBe(false);
    expect(RATE_MULTIPLICATION.test('const converted = exchangeRate.mul(basis);')).toBe(true);
    expect(RATE_MULTIPLICATION.test('const converted = basis * fxRate;')).toBe(true);
    expect(RATE_MULTIPLICATION.test('return costBasis * rate;')).toBe(true);
  });
});
