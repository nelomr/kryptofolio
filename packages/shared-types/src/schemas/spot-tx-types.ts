/**
 * The spot transaction vocabulary, in a module of its own because both `ledger.ts` and
 * `fifo-policy.ts` need it and they cannot both be the owner: `ledger.ts` reads the flag vocabularies
 * from `fifo-policy.ts`, so `fifo-policy.ts` reading the type list back from `ledger.ts` closed a cycle
 * that the ESM loader resolved only in the order vitest happened to enter it, and that threw a
 * temporal-dead-zone error in every script loading the package's own entry point.
 *
 * These MUST match the SQL CHECK constraints in 002_ledger_schema.sql exactly.
 */

export const SPOT_TX_TYPES = [
  'BUY',
  'SELL',
  'SWAP',
  'DEPOSIT',
  'WITHDRAWAL',
  'STAKING',
  'AIRDROP',
  'REWARD',
  'MINING',
  'SPEND',
  'FEE',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'MIGRATION_SWAP',
  /**
   * A credit the venue grants for taking part in a campaign — Bitvavo's
   * `campaign_new_user_incentive`. Its own type because the alternatives all state something untrue:
   * a `DEPOSIT` is indistinguishable from the user's own money, and an `AIRDROP` would mix
   * promotions into real airdrop history for good.
   */
  'PROMOTION',
] as const;

export type SpotTxType = typeof SPOT_TX_TYPES[number];
