import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const aiSubtreeRoot = join(backendRoot, 'src/core/infrastructure/ai');

function everySourceFile(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) return everySourceFile(entryPath);
    return entry.name.endsWith('.ts') ? [entryPath] : [];
  });
}

describe('no telemetry leaves the machine', () => {
  it('has no `@mastra/observability` dependency installed, so no exporter can be registered', () => {
    const packageJson = JSON.parse(readFileSync(join(backendRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.['@mastra/observability']).toBeUndefined();
    expect(packageJson.devDependencies?.['@mastra/observability']).toBeUndefined();
  });

  it('imports no `@mastra/observability` module anywhere in the AI subtree', () => {
    const importPattern = /from\s+['"]@mastra\/observability['"]/;
    const offenders = everySourceFile(aiSubtreeRoot).filter(
      (file) => !file.endsWith('.spec.ts') && importPattern.test(readFileSync(file, 'utf8')),
    );

    expect(offenders).toEqual([]);
  });
});
