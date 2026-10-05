export interface NamedAccount {
  readonly id: string;
  readonly name: string;
  readonly parentAccountId: string | null;
}

export type AccountNameResolution<A extends NamedAccount> =
  | { kind: "resolved"; account: A }
  | { kind: "ambiguous"; candidates: string[] }
  | { kind: "not_found"; available: string[] };

const MAX_CANDIDATES = 10;
const MAX_AVAILABLE = 20;

/**
 * An exact case-insensitive name wins outright; a prefix is consulted only when no name equals the
 * input, and a prefix shared by several accounts is reported, never guessed. Callers pass accounts
 * that are already non-synthetic.
 */
export function resolveAccountByName<A extends NamedAccount>(
  accounts: readonly A[],
  input: string,
): AccountNameResolution<A> {
  const wanted = input.toLowerCase();

  const exact = accounts.find((account) => account.name.toLowerCase() === wanted);
  if (exact !== undefined) return { kind: "resolved", account: exact };

  const prefixed = accounts.filter((account) => account.name.toLowerCase().startsWith(wanted));
  const [only] = prefixed;
  if (prefixed.length === 1 && only !== undefined) return { kind: "resolved", account: only };
  if (prefixed.length > 1) {
    return { kind: "ambiguous", candidates: prefixed.slice(0, MAX_CANDIDATES).map((account) => account.name) };
  }

  return {
    kind: "not_found",
    available: accounts
      .filter((account) => account.parentAccountId === null)
      .slice(0, MAX_AVAILABLE)
      .map((account) => account.name),
  };
}

/** The account followed by every descendant, so a parent venue expands to the child accounts that actually hold its assets. */
export function accountSubtree<A extends NamedAccount>(accounts: readonly A[], rootId: string): A[] {
  const included = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const account of accounts) {
      if (account.parentAccountId !== null && included.has(account.parentAccountId) && !included.has(account.id)) {
        included.add(account.id);
        grew = true;
      }
    }
  }
  return accounts.filter((account) => included.has(account.id));
}
