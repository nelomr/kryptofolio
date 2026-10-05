import { describe, it, expect, vi } from 'vitest';
import { ListAccountsUseCase } from '../ListAccountsUseCase.js';
import type { ILedgerPort } from '../../../../domain/ports/ILedgerPort.js';

type LedgerAccount = Awaited<ReturnType<ILedgerPort['getAccounts']>>[number];

function ledgerReturning(accounts: LedgerAccount[]): Pick<ILedgerPort, 'getAccounts'> {
  return { getAccounts: vi.fn().mockResolvedValue(accounts) };
}

describe('ListAccountsUseCase', () => {
  it('returns only non-synthetic accounts', async () => {
    const useCase = new ListAccountsUseCase(
      ledgerReturning([
        { id: 'acc-kraken', name: 'Kraken', type: 'EXCHANGE', parentAccountId: null, isSynthetic: false },
        { id: 'ownwallet-BTC', name: 'ownwallet-BTC', type: 'WALLET', parentAccountId: null, isSynthetic: true },
        { id: 'acc-kraken-spot', name: 'Kraken:spot', type: 'EXCHANGE', parentAccountId: 'acc-kraken', isSynthetic: false },
      ]),
    );

    const accounts = await useCase.execute();

    expect(accounts.map((a) => a.id)).toEqual(['acc-kraken', 'acc-kraken-spot']);
  });

  it('projects id, name, type and a null parent when none is declared', async () => {
    const useCase = new ListAccountsUseCase(
      ledgerReturning([
        { id: 'acc-a', name: 'A', type: 'WALLET', isSynthetic: false },
        { id: 'acc-b', name: 'B', type: 'EXCHANGE', parentAccountId: 'acc-a', isSynthetic: false },
      ]),
    );

    expect(await useCase.execute()).toEqual([
      { id: 'acc-a', name: 'A', type: 'WALLET', parentAccountId: null },
      { id: 'acc-b', name: 'B', type: 'EXCHANGE', parentAccountId: 'acc-a' },
    ]);
  });
});
