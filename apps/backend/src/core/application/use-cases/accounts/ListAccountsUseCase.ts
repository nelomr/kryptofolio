import type { ILedgerPort } from '../../../domain/ports/ILedgerPort.js';

export interface ListedAccount {
  id: string;
  name: string;
  type: string;
  parentAccountId: string | null;
}

/**
 * Synthetic accounts (`ownwallet-<ASSET>`) exist only as custody counterparties, so no selector
 * and no advisor lookup may offer them; the filter lives here so there is one place that decides it.
 */
export class ListAccountsUseCase {
  private readonly ledgerPort: Pick<ILedgerPort, 'getAccounts'>;

  constructor(ledgerPort: Pick<ILedgerPort, 'getAccounts'>) {
    this.ledgerPort = ledgerPort;
  }

  async execute(): Promise<ListedAccount[]> {
    const accounts = await this.ledgerPort.getAccounts();
    return accounts
      .filter((account) => !account.isSynthetic)
      .map((account) => ({
        id: account.id,
        name: account.name,
        type: account.type,
        parentAccountId: account.parentAccountId ?? null,
      }));
  }
}
