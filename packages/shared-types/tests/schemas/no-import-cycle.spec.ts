import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SPOT_TX_TYPES } from '../../src/schemas/spot-tx-types.js';
import { FIFO_EVENT_POLICY, FIFO_QUALITY_FLAGS } from '../../src/schemas/fifo-policy.js';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..');
const MONOREPO_ROOT = path.resolve(PACKAGE_ROOT, '../..');
const TSX = path.join(MONOREPO_ROOT, 'node_modules/.bin/tsx');
const PROBE = path.join(PACKAGE_ROOT, 'tests/fixtures/cjsImportProbe.ts');

/**
 * Vitest resolves each module through Vite, so a cycle between two schema modules can stay invisible
 * to the rest of this suite while breaking every script that runs outside it — which is how the seed
 * scripts in `packages/database` came to fail. The probe therefore runs in a real Node process.
 */
describe('shared-types entry point under a non-vitest loader', () => {
  it('loads through tsx without a temporal-dead-zone error', () => {
    const stdout = execFileSync(TSX, [PROBE], {
      cwd: MONOREPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Counted against the constants themselves: a literal here would have to be edited every time
    // the vocabulary grows, and the property under test is that the probe sees the same vocabulary
    // this process does — not that it has a particular size.
    expect(JSON.parse(stdout)).toEqual({
      spotTxTypes: SPOT_TX_TYPES.length,
      policyKeys: Object.keys(FIFO_EVENT_POLICY).length,
      qualityFlags: FIFO_QUALITY_FLAGS.length,
    });
  });
});
