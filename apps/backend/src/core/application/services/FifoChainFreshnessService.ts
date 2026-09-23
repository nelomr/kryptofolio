import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort.js';
import type { IDerivedChainPort } from '../../domain/ports/IDerivedChainPort.js';
import type { FreshChain } from '../../domain/models/FifoChainState.js';
import type { FifoMaterializerService, MaterializationSummary } from './FifoMaterializerService.js';

const NEEDS_RECALCULATION_KEY = 'needs_recalculation';

/** A derived-state refresh failed. The cause is the error the rebuild or reconciliation raised. */
export class RebuildFailedError extends Error {
  constructor(cause: unknown) {
    super('Derived-state refresh failed', { cause });
    this.name = 'RebuildFailedError';
  }
}

export interface DerivedStateRefresh {
  readonly chain: FreshChain;
  readonly materialization: MaterializationSummary;
}

type DerivedTableReconciler = Pick<FifoMaterializerService, 'recalculate'>;

type PipelineRun =
  | { readonly kind: 'unchanged'; readonly chain: FreshChain }
  | ({ readonly kind: 'refreshed' } & DerivedStateRefresh);

/**
 * FifoChainFreshnessService — the single owner of the derived-state pipeline (design D4/D4a):
 * rebuild the DuckDB chain, reconcile the SQLite derived tables from it, and only then clear
 * `needs_recalculation`.
 *
 * A singleton in the DI composition root: that is what makes "one pipeline in flight per
 * process" true. The reconciliation is a full set difference, so running it against a chain
 * that was not rebuilt in the same run retires valid rows — which is why nothing else in the
 * process may invoke it, and why nothing else may clear the flag.
 */
export class FifoChainFreshnessService {
  private readonly userSettingsPort: IUserSettingsPort;
  private readonly derivedChainPort: IDerivedChainPort;
  private readonly reconciler: DerivedTableReconciler;

  /**
   * The coalescence memo. Assigned synchronously, before any `await`, so that every call
   * arriving in the same microtask turn observes it already set and shares this exact
   * promise. Cleared in a `finally` only while it is still the current memo — a `refresh()`
   * queued behind it must not be forgotten when the earlier run settles — so a rejected run
   * leaves no poisoned promise behind.
   */
  private inFlight: Promise<PipelineRun> | null = null;

  /**
   * Consecutive failed runs. A short backoff proportional to this count means a persistently
   * failing pipeline does not have every subsequent request immediately pay for its own doomed
   * attempt; the flag is never cleared on failure, so stale data is never served regardless.
   */
  private consecutiveFailures = 0;

  private readonly delay: (ms: number) => Promise<void>;

  constructor(
    userSettingsPort: IUserSettingsPort,
    derivedChainPort: IDerivedChainPort,
    reconciler: DerivedTableReconciler,
    delay: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    this.userSettingsPort = userSettingsPort;
    this.derivedChainPort = derivedChainPort;
    this.reconciler = reconciler;
    this.delay = delay;
  }

  /**
   * Resolves only to the fresh variant — a caller has nothing else to hold, so "query a
   * chain that isn't fresh" is uninhabitable by construction (design D6). Joins whatever
   * pipeline is already in flight.
   */
  public async ensureFresh(): Promise<FreshChain> {
    const run = this.inFlight ?? this.track(this.settleIfStale());
    return (await run).chain;
  }

  /**
   * Always runs the pipeline. For explicit triggers — an import, an override, the manual
   * rebuild — which must observe their own mutation, so it queues behind any run already in
   * flight instead of resolving with that run's (possibly pre-mutation) result.
   */
  public refresh(): Promise<DerivedStateRefresh> {
    const previous = this.inFlight;
    const refreshed = (previous ? previous.then(noop, noop) : Promise.resolve()).then(() =>
      this.runPipeline(),
    );
    this.track(refreshed.then((result): PipelineRun => ({ kind: 'refreshed', ...result })));
    return refreshed;
  }

  private track(run: Promise<PipelineRun>): Promise<PipelineRun> {
    const tracked = run.finally(() => {
      if (this.inFlight === tracked) this.inFlight = null;
    });
    this.inFlight = tracked;
    // The memo itself must never surface an unhandled rejection; callers observe failures
    // through the promise they were handed.
    tracked.catch(noop);
    return tracked;
  }

  private async settleIfStale(): Promise<PipelineRun> {
    const needsRecalculation = await this.userSettingsPort.getSetting(NEEDS_RECALCULATION_KEY);
    if (needsRecalculation !== 'true') {
      const state = await this.derivedChainPort.describe();
      if (state.kind === 'fresh') {
        return { kind: 'unchanged', chain: state };
      }
      // Clean flag but never built — a fresh install, or a restart that reset the
      // materialised tables. Stale/never-built is never served.
    }
    return { kind: 'refreshed', ...(await this.runPipeline()) };
  }

  private async runPipeline(): Promise<DerivedStateRefresh> {
    if (this.consecutiveFailures > 0) {
      await this.delay(Math.min(400 * this.consecutiveFailures, 5_000));
    }

    let materialization: MaterializationSummary;
    try {
      await this.derivedChainPort.rebuild();
      materialization = await this.reconciler.recalculate();
    } catch (cause) {
      this.consecutiveFailures += 1;
      throw new RebuildFailedError(cause);
    }

    this.consecutiveFailures = 0;
    await this.userSettingsPort.setSetting(NEEDS_RECALCULATION_KEY, 'false');

    const state = await this.derivedChainPort.describe();
    if (state.kind !== 'fresh') {
      throw new RebuildFailedError(
        new Error(`describe() reported '${state.kind}' immediately after a successful rebuild`),
      );
    }
    return { chain: state, materialization };
  }
}

function noop(): void {}
