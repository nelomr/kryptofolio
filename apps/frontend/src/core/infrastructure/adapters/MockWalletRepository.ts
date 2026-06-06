import Papa from 'papaparse';
import type { IWalletRepository } from '@/core/domain/ports/IWalletRepository';
import type { LogicalWalletEntity, WalletType } from '@/core/domain/models/PortfolioEntities';
import { WalletCsvRowSchema } from '@/core/infrastructure/dtos/WalletDtos';

export class MockWalletRepository implements IWalletRepository {
  private wallets: LogicalWalletEntity[] = [];

  async getWallets(): Promise<LogicalWalletEntity[]> {
    return Promise.resolve(this.wallets);
  }

  async uploadWalletCsv(file: File): Promise<LogicalWalletEntity[]> {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const newWalletsMap = new Map<string, LogicalWalletEntity>();

          results.data.forEach((row) => {
            const parsedRow = WalletCsvRowSchema.safeParse(row);
            if (parsedRow.success) {
              const { wallet_name, wallet_type, blockchain, address } = parsedRow.data;
              
              if (!newWalletsMap.has(wallet_name)) {
                newWalletsMap.set(wallet_name, {
                  name: wallet_name,
                  type: wallet_type as WalletType,
                  chainAddresses: []
                });
              }

              newWalletsMap.get(wallet_name)?.chainAddresses.push({
                blockchain,
                address
              });
            } else {
              console.warn('Invalid CSV row skipped:', row, parsedRow.error);
            }
          });

          this.wallets = Array.from(newWalletsMap.values());
          resolve(this.wallets);
        },
        error: (error: Error) => {
          console.error('PapaParse error:', error);
          reject(error);
        }
      });
    });
  }
}
