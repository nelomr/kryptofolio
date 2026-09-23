export type FifoBuildId = string & { readonly __brand: 'FifoBuildId' };

export type FifoChainState =
  | { readonly kind: 'fresh'; readonly buildId: FifoBuildId; readonly builtAt: string }
  | { readonly kind: 'stale'; readonly reason: 'ledger-mutated' | 'never-built' }
  | { readonly kind: 'rebuilding'; readonly buildId: FifoBuildId; readonly startedAt: string };

export type FreshChain = Extract<FifoChainState, { kind: 'fresh' }>;
