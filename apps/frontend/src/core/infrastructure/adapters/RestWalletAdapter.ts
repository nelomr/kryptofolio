import type { IWalletPort } from '@/core/domain/ports/IWalletPort';
import type { LogicalWalletEntity } from '@/core/domain/models/PortfolioEntities';
import { bffClient } from '../http/BffClient';

export class RestWalletAdapter implements IWalletPort {
  async getWallets(): Promise<LogicalWalletEntity[]> {
    const res = await bffClient.api.wallets.$get();
    return await res.json() as LogicalWalletEntity[];
  }

  async uploadWalletCsv(file: File): Promise<LogicalWalletEntity[]> {
    const res = await bffClient.api.wallets.upload.$post({ form: { file } });
    return await res.json() as LogicalWalletEntity[];
  }
}
