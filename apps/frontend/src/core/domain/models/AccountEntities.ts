/**
 * Account Domain Entities — the ledger accounts a user can name.
 *
 * Only accounts the user owns as a concept appear here. Synthetic custody counterparties are
 * excluded by the endpoint that serves them, so a `SelectableAccountEntity` is by construction an
 * account it is meaningful to offer as an import target or a movement destination.
 *
 * @see openspec/specs/account-hierarchy/spec.md
 */

/** An account offered in a user-facing selector. */
export interface SelectableAccountEntity {
  id: string
  name: string
  /** The venue kind as the ledger records it (`exchange`, `wallet`, …). */
  type: string
  /** The venue this account hangs under, for staking sub-wallets; `null` for a top-level venue. */
  parentAccountId: string | null
}
