import { container } from '../core/infrastructure/di/container.js';
import { DuckDbAdapter } from '@kryptofolio/database';

async function run() {
  console.log('Initializing ledger...');
  await container.initializeLedgerUseCase.execute();
  console.log('Initializing DuckDB...');
  const duckDb = new DuckDbAdapter();
  await duckDb.initialize();
  container.setDuckDbAdapter(duckDb);

  console.log('Starting full FIFO rebuild...');
  const result = await container.fifoMaterializerService.recalculate();
  console.log('Rebuild complete. Result:', JSON.stringify(result, null, 2));
  
  process.exit(0);
}

run().catch(err => {
  console.error('Rebuild failed:', err);
  process.exit(1);
});
