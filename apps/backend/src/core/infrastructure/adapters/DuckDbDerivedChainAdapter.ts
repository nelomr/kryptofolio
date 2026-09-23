import type { IAnalyticalDatabasePort } from '@kryptofolio/database';
import type { IDerivedChainPort } from '../../domain/ports/IDerivedChainPort.js';
import type { FifoBuildId, FifoChainState } from '../../domain/models/FifoChainState.js';

/**
 * DuckDbDerivedChainAdapter — implements IDerivedChainPort over the analytical database.
 *
 * All DuckDB SQL for the rebuild itself lives in `packages/database`'s `DuckDbAdapter`; this
 * adapter's only job is translating that port's plain-object results into the domain's
 * discriminated `FifoChainState` — the domain never sees a bare `{ buildId, builtAt }`.
 */
export class DuckDbDerivedChainAdapter implements IDerivedChainPort {
  private readonly db: IAnalyticalDatabasePort;

  constructor(db: IAnalyticalDatabasePort) {
    this.db = db;
  }

  public async rebuild(): Promise<FifoBuildId> {
    const { buildId } = await this.db.rebuildDerivedChain();
    return buildId as FifoBuildId;
  }

  public async describe(): Promise<FifoChainState> {
    const build = await this.db.describeDerivedChain();
    if (!build) {
      return { kind: 'stale', reason: 'never-built' };
    }
    return { kind: 'fresh', buildId: build.buildId as FifoBuildId, builtAt: build.builtAt };
  }
}
