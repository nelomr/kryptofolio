import type { ICryptographyPort } from '../../domain/ports/ICryptographyPort.js';
import type { IVaultCredentialsPort } from '../../domain/ports/IVaultCredentialsPort.js';
import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort.js';
import type { IPriceHistoryPort } from '../../domain/ports/IPriceHistoryPort.js';
import type { IMarketDataProvider } from '../../domain/ports/IMarketDataProvider.js';
import type { IExchangeRatePort } from '../../domain/ports/IExchangeRatePort.js';
import type { ILedgerPort } from '../../domain/ports/ILedgerPort.js';
import type { IPriceIngestionPort } from '../../domain/ports/IPriceIngestionPort.js';
import type { IDatabasePort, IAnalyticalDatabasePort } from '@kryptofolio/database';
import { NodeSqliteAdapter } from '@kryptofolio/database';
import { getLedgerDb } from '@kryptofolio/database';
import { EcbExchangeRateAdapter } from '../adapters/EcbExchangeRateAdapter.js';
import { AesGcmCryptographyAdapter } from '../adapters/AesGcmCryptographyAdapter.js';
import { SqliteVaultPortAdapter } from '../adapters/SqliteVaultPortAdapter.js';
import { InMemoryPriceHistoryAdapter } from '../adapters/InMemoryPriceHistoryAdapter.js';
import { SQLiteLedgerAdapter } from '../adapters/SQLiteLedgerAdapter.js';
import { DuckDbParquetPriceAdapter } from '../adapters/DuckDbParquetPriceAdapter.js';
import { UnlockVaultUseCase } from '../../application/use-cases/vault/UnlockVaultUseCase.js';
import { StoreServiceCredentialUseCase } from '../../application/use-cases/vault/StoreServiceCredentialUseCase.js';
import { GetVaultStatusUseCase } from '../../application/use-cases/vault/GetVaultStatusUseCase.js';
import { GetAvailableProvidersUseCase } from '../../application/use-cases/vault/GetAvailableProvidersUseCase.js';
import { ToggleVaultProviderUseCase } from '../../application/use-cases/vault/ToggleVaultProviderUseCase.js';
import { MarketDataOrchestrator } from '../../application/services/MarketDataOrchestrator.js';
import { KrakenMarketDataAdapter } from '../adapters/KrakenMarketDataAdapter.js';
import { CoinGeckoMarketDataAdapter } from '../adapters/CoinGeckoMarketDataAdapter.js';
import { BinanceMarketDataAdapter } from '../adapters/BinanceMarketDataAdapter.js';
import { CoinbaseMarketDataAdapter } from '../adapters/CoinbaseMarketDataAdapter.js';
import { Bit2MeMarketDataAdapter } from '../adapters/Bit2MeMarketDataAdapter.js';
import { UpdateActiveMarketProviderUseCase } from '../../application/use-cases/UpdateActiveMarketProviderUseCase.js';
import { CsvIngestionUseCase } from '../../application/use-cases/CsvIngestionUseCase.js';
import { KrakenPriceProviderAdapter } from '../adapters/KrakenPriceProviderAdapter.js';
import { IngestDailyPricesUseCase } from '../../application/use-cases/IngestDailyPricesUseCase.js';


/**
 * DIContainer — Composes the application layer.
 *
 * This is the ONLY place that knows about concrete implementations.
 * The domain and application layers only see Port interfaces.
 *
 * To swap the database engine (e.g., to PostgreSQL), replace SqliteVaultPortAdapter
 * with a new PostgresVaultPortAdapter implementing the same interfaces.
 */
export class DIContainer {
  public readonly sqlitePort: IDatabasePort;
  public readonly cryptographyPort: ICryptographyPort;
  public readonly vaultCredentialsPort: IVaultCredentialsPort;
  public readonly userSettingsPort: IUserSettingsPort;
  public readonly unlockVaultUseCase: UnlockVaultUseCase;
  public readonly storeServiceCredentialUseCase: StoreServiceCredentialUseCase;
  public readonly getVaultStatusUseCase: GetVaultStatusUseCase;
  public readonly getAvailableProvidersUseCase: GetAvailableProvidersUseCase;
  public readonly toggleVaultProviderUseCase: ToggleVaultProviderUseCase;

  /** Exchange Rates */
  public readonly exchangeRatePort: IExchangeRatePort;

  /** Market data */
  public readonly priceHistoryPort: IPriceHistoryPort;
  public readonly marketDataOrchestrator: MarketDataOrchestrator;
  public readonly krakenMarketDataAdapter: KrakenMarketDataAdapter;
  public readonly coinGeckoMarketDataAdapter: CoinGeckoMarketDataAdapter;
  public readonly binanceMarketDataAdapter: BinanceMarketDataAdapter;
  public readonly coinbaseMarketDataAdapter: CoinbaseMarketDataAdapter;
  public readonly bit2meMarketDataAdapter: Bit2MeMarketDataAdapter;
  public readonly marketProviders: Record<string, IMarketDataProvider>;
  public readonly updateActiveMarketProviderUseCase: UpdateActiveMarketProviderUseCase;

  /** Ledger & Ingestion */
  public readonly ledgerPort: ILedgerPort;
  public readonly csvIngestionUseCase: CsvIngestionUseCase;

  /** Price Ingestion (Parquet) */
  public readonly priceIngestionPort: IPriceIngestionPort;
  public readonly ingestDailyPricesUseCase: IngestDailyPricesUseCase;

  constructor() {
    this.sqlitePort = new NodeSqliteAdapter();
    this.cryptographyPort = new AesGcmCryptographyAdapter();
    const sqliteAdapter = new SqliteVaultPortAdapter(this.sqlitePort);
    this.vaultCredentialsPort = sqliteAdapter;
    this.userSettingsPort = sqliteAdapter;
    this.unlockVaultUseCase = new UnlockVaultUseCase(this.cryptographyPort, this.vaultCredentialsPort);
    this.storeServiceCredentialUseCase = new StoreServiceCredentialUseCase(this.cryptographyPort, this.vaultCredentialsPort);
    this.getVaultStatusUseCase = new GetVaultStatusUseCase(this.cryptographyPort, this.vaultCredentialsPort);
    this.getAvailableProvidersUseCase = new GetAvailableProvidersUseCase();
    this.toggleVaultProviderUseCase = new ToggleVaultProviderUseCase(this.cryptographyPort, this.vaultCredentialsPort);

    this.exchangeRatePort = new EcbExchangeRateAdapter();

    // Market data — wired lazily; broadcastPrice is injected from the route module
    // to avoid circular imports. The orchestrator receives the callback on first use.
    this.priceHistoryPort = new InMemoryPriceHistoryAdapter();
    this.krakenMarketDataAdapter = new KrakenMarketDataAdapter();
    this.coinGeckoMarketDataAdapter = new CoinGeckoMarketDataAdapter();
    this.binanceMarketDataAdapter = new BinanceMarketDataAdapter();
    this.coinbaseMarketDataAdapter = new CoinbaseMarketDataAdapter();
    this.bit2meMarketDataAdapter = new Bit2MeMarketDataAdapter();
    
    this.marketProviders = {
      [this.krakenMarketDataAdapter.id]: this.krakenMarketDataAdapter,
      [this.coinGeckoMarketDataAdapter.id]: this.coinGeckoMarketDataAdapter,
      [this.binanceMarketDataAdapter.id]: this.binanceMarketDataAdapter,
      [this.coinbaseMarketDataAdapter.id]: this.coinbaseMarketDataAdapter,
      [this.bit2meMarketDataAdapter.id]: this.bit2meMarketDataAdapter,
    };
    
    // Broadcast callback will be set via setOrchestrator() after route initialisation
    this.marketDataOrchestrator = new MarketDataOrchestrator((_price) => {
      // Default no-op; overridden at startup by index.ts after routes are mounted
    });

    this.updateActiveMarketProviderUseCase = new UpdateActiveMarketProviderUseCase(
      this.userSettingsPort,
      this.marketDataOrchestrator,
      this.marketProviders
    );

    // Ledger DB — separate SQLite instance for the financial ledger
    const ledgerDb = getLedgerDb();
    this.ledgerPort = new SQLiteLedgerAdapter(ledgerDb);

    // CSV Ingestion — uses Kraken as the historical price provider
    const priceProvider = new KrakenPriceProviderAdapter(this.krakenMarketDataAdapter);
    this.csvIngestionUseCase = new CsvIngestionUseCase(this.ledgerPort, priceProvider, this.userSettingsPort);

    // Price Ingestion (Parquet) — DuckDbParquetPriceAdapter + IngestDailyPricesUseCase
    // The DuckDbAdapter must be initialized (index.ts) before using the adapter.
    // Call container.setDuckDbAdapter(duckDb) after duckDb.initialize() in index.ts.
    this.priceIngestionPort = new DuckDbParquetPriceAdapter(null as unknown as IAnalyticalDatabasePort);
    this.ingestDailyPricesUseCase = new IngestDailyPricesUseCase(
      this.ledgerPort,
      this.priceIngestionPort,
      this.krakenMarketDataAdapter,
    );
  }

  /**
   * Injects the initialized DuckDbAdapter into the Parquet price adapter.
   * Must be called AFTER duckDb.initialize() in index.ts.
   */
  setDuckDbAdapter(duckDb: IAnalyticalDatabasePort): void {
    // DuckDbParquetPriceAdapter.duckDb is not readonly — safe to reassign after init
    (this.priceIngestionPort as unknown as { duckDb: IAnalyticalDatabasePort }).duckDb = duckDb;
  }
}

export const container = new DIContainer();
