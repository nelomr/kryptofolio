import type { FifoBuildId, FifoChainState } from '../models/FifoChainState.js';

/**
 * IDerivedChainPort — rebuilds and describes the six materialized FIFO derived relations.
 *
 * Lives in the DOMAIN layer. All DuckDB SQL implementing it stays in the adapter
 * (`packages/database` / `core/infrastructure/adapters`) — this interface carries no SQL.
 */
export interface IDerivedChainPort {
  rebuild(): Promise<FifoBuildId>;
  describe(): Promise<FifoChainState>;
}
