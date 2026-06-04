import type { IWalletRepository } from '@/core/domain/ports/IWalletRepository';
import type { LogicalWalletEntity } from '@/core/domain/models/PortfolioEntities';
import type { IHttpClient } from '@/core/domain/ports/IHttpClient';

export class RestWalletRepository implements IWalletRepository {
  private readonly httpClient: IHttpClient;

  constructor(httpClient: IHttpClient) {
    this.httpClient = httpClient;
  }

  async getWallets(): Promise<LogicalWalletEntity[]> {
    const response = await this.httpClient.get<LogicalWalletEntity[]>('/api/v1/wallets');
    return response.data;
  }

  async uploadWalletCsv(file: File): Promise<LogicalWalletEntity[]> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.httpClient.postForm<LogicalWalletEntity[]>('/api/v1/wallets/upload', formData);
    return response.data;
  }
}
