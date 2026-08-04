/**
 * Loaded by `no-import-cycle.spec.ts` through tsx, whose CJS transform evaluates a module cycle in a
 * different order than the ESM loader. Kept as a real file so the probe exercises the package's own
 * entry point exactly as `packages/database`'s seed scripts do.
 */

import { SPOT_TX_TYPES, FIFO_EVENT_POLICY, FIFO_QUALITY_FLAGS } from '../../src/index.js';

process.stdout.write(
  JSON.stringify({
    spotTxTypes: SPOT_TX_TYPES.length,
    policyKeys: Object.keys(FIFO_EVENT_POLICY).length,
    qualityFlags: FIFO_QUALITY_FLAGS.length,
  }),
);
