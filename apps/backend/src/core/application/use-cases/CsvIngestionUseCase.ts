import type { ILedgerPort, LedgerSpotTransaction, LedgerFuturesTransaction } from '../../domain/ports/ILedgerPort';
import type { TransactionMappedData } from '@kryptofolio/shared-types';
import type { SpotTxType, FuturesTxType } from '@kryptofolio/shared-types';
import { SPOT_TX_TYPES, FUTURES_TX_TYPES } from '@kryptofolio/shared-types';
import Decimal from 'decimal.js';
import crypto from 'node:crypto';
import type { IPriceProviderPort } from '../../domain/ports/IPriceProviderPort.js';

export type IngestibleTransaction = TransactionMappedData & {
  account_id: string;
  /** REQUIRED: deterministic hash from @kryptofolio/core-domain generateIdHash — never optional */
  id_hash: string;
};



function toSpotTxType(raw: string | null | undefined): SpotTxType {
  const upper = (raw ?? '').toUpperCase() as SpotTxType;
  if (SPOT_TX_TYPES.includes(upper)) return upper;
  // Attempt common remappings from CSV field values
  const map: Record<string, SpotTxType> = {
    BUY: 'BUY', SELL: 'SELL', TRADE: 'BUY',
    DEPOSIT: 'DEPOSIT', WITHDRAWAL: 'WITHDRAWAL',
    TRANSFER: 'TRANSFER_IN', TRANSFER_IN: 'TRANSFER_IN', TRANSFER_OUT: 'TRANSFER_OUT',
    FEE: 'FEE', REWARD: 'REWARD', AIRDROP: 'AIRDROP',
    STAKING: 'STAKING', MINING: 'MINING', SPEND: 'SPEND',
    SWAP: 'SWAP', MIGRATION_SWAP: 'MIGRATION_SWAP',
  };
  return map[upper] ?? 'BUY';
}

function toFuturesTxType(raw: string | null | undefined): FuturesTxType {
  const upper = (raw ?? '').toUpperCase() as FuturesTxType;
  if (FUTURES_TX_TYPES.includes(upper)) return upper;
  const map: Record<string, FuturesTxType> = {
    TRADE: 'TRADE', REALIZED_PNL: 'SETTLEMENT', SETTLEMENT: 'SETTLEMENT',
    FUNDING_FEE: 'FUNDING_FEE', FUNDING: 'FUNDING_FEE',
    LIQUIDATION: 'LIQUIDATION', COMMISSION: 'FUNDING_FEE',
    TRANSFER: 'TRADE',
  };
  return map[upper] ?? 'TRADE';
}

export class CsvIngestionUseCase {
  private ledgerPort: ILedgerPort;
  private priceProvider: IPriceProviderPort;

  constructor(ledgerPort: ILedgerPort, priceProvider: IPriceProviderPort) {
    this.ledgerPort = ledgerPort;
    this.priceProvider = priceProvider;
  }

  async execute(rows: IngestibleTransaction[], market: 'spot' | 'futures'): Promise<void> {
    for (const row of rows) {
      // 4.2 Orchestrate resolution of Asset and Account foreign keys.
      const accountId = row.account_id;
      if (!accountId) {
        throw new Error('Account ID is required for ingestion. The frontend MUST inject it before calling this use case.');
      }

      // C-7 fix: id_hash MUST come from the frontend's generateIdHash. It is never optional.
      if (!row.id_hash) {
        throw new Error(
          `id_hash is required for idempotent ingestion (tx at ${row.timestamp}). ` +
          'The frontend must call generateIdHash() before submitting rows.'
        );
      }

      await this.ensureAccountExists(accountId);

      if (row.asset_in) await this.ensureAssetExists(row.asset_in);
      if (row.asset_out) await this.ensureAssetExists(row.asset_out);
      if (row.fee_currency) await this.ensureAssetExists(row.fee_currency);

      // 4.3 Map valid TransactionMappedData payloads to Domain command via Adapter
      const id = crypto.randomUUID();

      let total_fiat = new Decimal(row.total_fiat || '0');
      let price_fiat = new Decimal(row.price_fiat || '0');

      // 4.4 Fiat Price Fetching fallback — only when genuinely missing
      if (total_fiat.isZero() || price_fiat.isZero()) {
        const primaryAsset = row.asset_in || row.asset_out;
        if (primaryAsset) {
          price_fiat = await this.priceProvider.getHistoricalPrice(primaryAsset, 'EUR', row.timestamp!);
          const primaryAmount = new Decimal(row.amount_in || row.amount_out || '0');
          total_fiat = price_fiat.mul(primaryAmount);
        }
      }

      if (market === 'spot') {
        const tx: LedgerSpotTransaction = {
          id,
          id_hash: row.id_hash,
          account_id: accountId,
          timestamp: row.timestamp!,
          tx_type: toSpotTxType(row.tx_type),
          amount_in: row.amount_in ? new Decimal(row.amount_in).abs() : undefined,
          asset_in_id: row.asset_in || undefined,
          amount_out: row.amount_out ? new Decimal(row.amount_out).abs() : undefined,
          asset_out_id: row.asset_out || undefined,
          fee_amount: row.fee_amount && !new Decimal(row.fee_amount).isZero() ? new Decimal(row.fee_amount).abs() : undefined,
          fee_asset_id: (row.fee_amount && !new Decimal(row.fee_amount).isZero()) ? (row.fee_currency || undefined) : undefined,
          total_fiat,
          price_fiat,
          status: 'COMPLETED',
        };
        await this.ledgerPort.saveSpotTransaction(tx);
      } else {
        const tx: LedgerFuturesTransaction = {
          id,
          id_hash: row.id_hash,
          account_id: accountId,
          timestamp: row.timestamp!,
          tx_type: toFuturesTxType(row.tx_type),
          symbol: row.symbol ?? row.asset_in ?? row.asset_out ?? 'UNKNOWN',
          amount: row.amount_in ? new Decimal(row.amount_in).abs() : row.amount_out ? new Decimal(row.amount_out).abs() : undefined,
          realized_pnl: row.realized_pnl ? new Decimal(row.realized_pnl) : undefined,
          funding_amount: row.funding_amount ? new Decimal(row.funding_amount) : undefined,
          fee_amount: row.fee_amount && !new Decimal(row.fee_amount).isZero() ? new Decimal(row.fee_amount).abs() : undefined,
          fee_asset_id: (row.fee_amount && !new Decimal(row.fee_amount).isZero()) ? (row.fee_currency || undefined) : undefined,
          status: 'COMPLETED',
        };
        await this.ledgerPort.saveFuturesTransaction(tx);
      }
    }
  }

  private async ensureAssetExists(asset: string): Promise<void> {
    await this.ledgerPort.ensureAssetExists(asset);
  }

  private async ensureAccountExists(accountId: string): Promise<void> {
    await this.ledgerPort.ensureAccountExists(accountId);
  }
}
