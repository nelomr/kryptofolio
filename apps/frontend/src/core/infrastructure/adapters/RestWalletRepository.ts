import type { IWalletRepository } from '@/core/domain/ports/IWalletRepository';
import type { LogicalWalletEntity } from '@/core/domain/models/PortfolioEntities';
import { bffClient } from '../http/BffClient';

export class RestWalletRepository implements IWalletRepository {
  async getWallets(): Promise<LogicalWalletEntity[]> {
    const res = await bffClient.api.wallets.$get();
    return await res.json() as LogicalWalletEntity[];
  }

  async uploadWalletCsv(file: File): Promise<LogicalWalletEntity[]> {
    const res = await bffClient.api.wallets.upload.$post({ form: { file } });
    return await res.json() as LogicalWalletEntity[];
  }
}
