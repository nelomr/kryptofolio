import type { LogicalWalletEntity } from '@/core/domain/models/PortfolioEntities';

export interface IWalletPort {
  /**
   * Retrieves the current list of manually configured wallets.
   */
  getWallets(): Promise<LogicalWalletEntity[]>;

  /**
   * Uploads a CSV file containing wallet configurations.
   * Returns the updated list of logical wallets.
   * 
   * @param file - The CSV File object containing wallet rows
   */
  uploadWalletCsv(file: File): Promise<LogicalWalletEntity[]>;
}
