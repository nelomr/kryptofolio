/**
 * The advisor's domain files must stay isolated exactly like the rest of `core/domain`: no import
 * outside sibling domain modules, and no mention of `AbortSignal` — the platform global this design
 * explicitly keeps out of the port, since cancellation is expressed by the consumer ceasing to
 * iterate, never by a signal threaded through the domain contract.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const domainDir = path.join(import.meta.dirname, '..');

const FILES = [
  'ports/IAdvisorPort.ts',
  'ports/IAdvisorRunLogPort.ts',
  'models/AdvisorEvent.ts',
  'models/AdvisorRunReceipt.ts',
  'models/AdvisorRequest.ts',
];

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importRegex = /import\s+(?:type\s+)?(?:[^'"]+from\s+)?['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(importRegex)) {
    specifiers.push(match[1] as string);
  }
  return specifiers;
}

describe('advisor domain files stay isolated', () => {
  it('import nothing outside sibling domain modules', () => {
    const offenders: { file: string; specifier: string }[] = [];
    for (const relativeFile of FILES) {
      const source = fs.readFileSync(path.join(domainDir, relativeFile), 'utf-8');
      for (const specifier of importSpecifiers(source)) {
        const isSiblingDomainModule = specifier.startsWith('.') || specifier.startsWith('..');
        const isSharedTypes = specifier === '@kryptofolio/shared-types';
        if (!isSiblingDomainModule && !isSharedTypes) {
          offenders.push({ file: relativeFile, specifier });
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never mentions AbortSignal', () => {
    const offenders: string[] = [];
    for (const relativeFile of FILES) {
      const source = fs.readFileSync(path.join(domainDir, relativeFile), 'utf-8');
      if (source.includes('AbortSignal')) offenders.push(relativeFile);
    }
    expect(offenders).toEqual([]);
  });
});
