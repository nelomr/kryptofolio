import type { ICryptographyPort } from '../../domain/ports/ICryptographyPort.js';
import type { IVaultCredentialsPort } from '../../domain/ports/IVaultCredentialsPort.js';
import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort.js';
import type { IPriceHistoryPort } from '../../domain/ports/IPriceHistoryPort.js';
import type { IMarketDataProvider } from '../../domain/ports/IMarketDataProvider.js';
import type { IExchangeRatePort } from '../../domain/ports/IExchangeRatePort.js';
import type { ILedgerPort } from '../../domain/ports/ILedgerPort.js';
import type { IPriceIngestionPort } from '../../domain/ports/IPriceIngestionPort.js';
import type { IPortfolioAnalyticsPort } from '../../domain/ports/IPortfolioAnalyticsPort.js';
import type { ITaxCalculatorPort } from '../../domain/ports/ITaxCalculatorPort.js';
import type { IMetricsPort } from '../../domain/ports/IMetricsPort.js';
import type { IDatabasePort, IAnalyticalDatabasePort } from '@kryptofolio/database';
import { NodeSqliteAdapter } from '@kryptofolio/database';
import { getLedgerDb } from '@kryptofolio/database';
import { EcbExchangeRateAdapter } from '../adapters/EcbExchangeRateAdapter.js';
import { AesGcmCryptographyAdapter } from '../adapters/AesGcmCryptographyAdapter.js';
import { SqliteVaultPortAdapter } from '../adapters/SqliteVaultPortAdapter.js';
import { InMemoryPriceHistoryAdapter } from '../adapters/InMemoryPriceHistoryAdapter.js';
import { SQLiteLedgerAdapter } from '../adapters/SQLiteLedgerAdapter.js';
import { DuckDbParquetPriceAdapter } from '../adapters/DuckDbParquetPriceAdapter.js';
import { DuckDbPortfolioAnalyticsAdapter } from '../adapters/DuckDbPortfolioAnalyticsAdapter.js';
import { DuckDbTaxCalculatorAdapter } from '../adapters/DuckDbTaxCalculatorAdapter.js';
import { DuckDbMetricsAdapter } from '../adapters/DuckDbMetricsAdapter.js';
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
import { InitializeLedgerUseCase } from '../../application/use-cases/InitializeLedgerUseCase.js';
import { KrakenPriceProviderAdapter } from '../adapters/KrakenPriceProviderAdapter.js';
import { IngestDailyPricesUseCase } from '../../application/use-cases/IngestDailyPricesUseCase.js';
import { GetPortfolioSummaryUseCase } from '../../application/use-cases/GetPortfolioSummaryUseCase.js';
import { GetSpanishTaxReportUseCase } from '../../application/use-cases/GetSpanishTaxReportUseCase.js';
import { GetTokenHistoryUseCase } from '../../application/use-cases/GetTokenHistoryUseCase.js';
import { FifoMaterializerService } from '../../application/services/FifoMaterializerService.js';


class UninitializedAnalyticalDatabaseAdapter implements IAnalyticalDatabasePort {
  async initialize(): Promise<void> {}
  async queryOne<T = Record<string, unknown>>(): Promise<T | null> {
    throw new Error('[DuckDB] Analytical database is not initialized. Call container.setDuckDbAdapter(duckDb) at startup.');
  }
  async queryMany<T>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]> {
    throw new Error('[DuckDB] Analytical database is not initialized. Call container.setDuckDbAdapter(duckDb) at startup.');
  }
  async execute(): Promise<void> {
    throw new Error('[DuckDB] Analytical database is not initialized. Call container.setDuckDbAdapter(duckDb) at startup.');
  }
  async bulkInsert<T extends Record<string, unknown>>(): Promise<void> {
    throw new Error('[DuckDB] Analytical database is not initialized. Call container.setDuckDbAdapter(duckDb) at startup.');
  }
}

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
  public readonly initializeLedgerUseCase: InitializeLedgerUseCase;

  /** Analytical DuckDB Ports & Adapters */
  public priceIngestionPort: IPriceIngestionPort;
  public portfolioAnalyticsPort: IPortfolioAnalyticsPort;
  public taxCalculatorPort: ITaxCalculatorPort;
  public metricsPort: IMetricsPort;

  /** Use Cases */
  public ingestDailyPricesUseCase: IngestDailyPricesUseCase;
  public getPortfolioSummaryUseCase: GetPortfolioSummaryUseCase;
  public getSpanishTaxReportUseCase: GetSpanishTaxReportUseCase;
  public getTokenHistoryUseCase: GetTokenHistoryUseCase;
  public fifoMaterializerService: FifoMaterializerService;

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
    const ledgerDb = getLedgerDb(process.env.LEDGER_DB_PATH);
    this.ledgerPort = new SQLiteLedgerAdapter(ledgerDb);

    // CSV Ingestion — uses Kraken as the historical price provider
    const priceProvider = new KrakenPriceProviderAdapter(this.krakenMarketDataAdapter);
    this.csvIngestionUseCase = new CsvIngestionUseCase(this.ledgerPort, priceProvider, this.userSettingsPort);
    this.initializeLedgerUseCase = new InitializeLedgerUseCase(this.ledgerPort, this.userSettingsPort);

    // Analytical DuckDB Adapters (initially bound to uninitialized guard)
    const uninitializedDb = new UninitializedAnalyticalDatabaseAdapter();
    this.priceIngestionPort = new DuckDbParquetPriceAdapter(uninitializedDb);
    this.portfolioAnalyticsPort = new DuckDbPortfolioAnalyticsAdapter(uninitializedDb);
    this.taxCalculatorPort = new DuckDbTaxCalculatorAdapter(uninitializedDb);
    this.metricsPort = new DuckDbMetricsAdapter(uninitializedDb);

    this.ingestDailyPricesUseCase = new IngestDailyPricesUseCase(
      this.ledgerPort,
      this.priceIngestionPort,
      this.krakenMarketDataAdapter,
    );

    this.getPortfolioSummaryUseCase = new GetPortfolioSummaryUseCase(
      this.portfolioAnalyticsPort,
      this.userSettingsPort,
      this.metricsPort,
    );

    this.getSpanishTaxReportUseCase = new GetSpanishTaxReportUseCase(
      this.taxCalculatorPort,
    );

    this.getTokenHistoryUseCase = new GetTokenHistoryUseCase(
      this.taxCalculatorPort,
    );

    this.fifoMaterializerService = new FifoMaterializerService(
      this.ledgerPort,
      this.taxCalculatorPort,
      this.userSettingsPort,
    );
  }

  /**
   * Injects the initialized DuckDbAdapter into the analytical DuckDB adapters and use cases.
   * Must be called AFTER duckDb.initialize() in index.ts.
   */
  setDuckDbAdapter(duckDb: IAnalyticalDatabasePort): void {
    this.priceIngestionPort = new DuckDbParquetPriceAdapter(duckDb);
    this.portfolioAnalyticsPort = new DuckDbPortfolioAnalyticsAdapter(duckDb);
    this.taxCalculatorPort = new DuckDbTaxCalculatorAdapter(duckDb);
    this.metricsPort = new DuckDbMetricsAdapter(duckDb);

    this.ingestDailyPricesUseCase = new IngestDailyPricesUseCase(
      this.ledgerPort,
      this.priceIngestionPort,
      this.krakenMarketDataAdapter,
    );

    this.getPortfolioSummaryUseCase = new GetPortfolioSummaryUseCase(
      this.portfolioAnalyticsPort,
      this.userSettingsPort,
      this.metricsPort,
    );

    this.getSpanishTaxReportUseCase = new GetSpanishTaxReportUseCase(
      this.taxCalculatorPort,
    );

    this.getTokenHistoryUseCase = new GetTokenHistoryUseCase(
      this.taxCalculatorPort,
    );

    this.fifoMaterializerService = new FifoMaterializerService(
      this.ledgerPort,
      this.taxCalculatorPort,
      this.userSettingsPort,
    );
  }
}

let _container: DIContainer | null = null;
export const getContainer = (): DIContainer => {
  if (!_container) {
    _container = new DIContainer();
  }
  return _container;
};

export const container = new Proxy({} as DIContainer, {
  get: (_, prop) => {
    const inst = getContainer();
    const value = Reflect.get(inst, prop);
    return typeof value === 'function' ? value.bind(inst) : value;
  },
});
