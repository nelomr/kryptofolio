import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Papa from 'papaparse';
import { DatabaseSync } from 'node:sqlite';
import { SQLiteLedgerAdapter } from '../../../infrastructure/adapters/SQLiteLedgerAdapter';
import { DuckDbAdapter } from '@kryptofolio/database';
import { FifoMaterializerService } from '../../services/FifoMaterializerService';
import { DuckDbTaxCalculatorAdapter } from '../../../infrastructure/adapters/DuckDbTaxCalculatorAdapter.js';
import { CsvIngestionUseCase } from '../CsvIngestionUseCase.js';
import { IngestAndMaterializeUseCase } from '../IngestAndMaterializeUseCase';
import {
  guessColumnMapping,
  mapToEntity,
  normalizeTransactionDirection,
  detectSourceProfile,
} from '@kryptofolio/core-domain';
import type { IPriceProviderPort } from '../../../domain/ports/IPriceProviderPort';
import type { IUserSettingsPort } from '../../../domain/ports/IUserSettingsPort';
import { toPreciseAmount } from '../../../domain/value-objects/PreciseAmount';
import type { SourceProfileId } from '@kryptofolio/shared-types';

const ACCOUNT_ID = '10000000-0000-0000-0000-000000000001';

describe('End-to-End Ingestion: Kraken CSV Fixture', () => {
  let sqlitePath: string;
  let sqliteDb: DatabaseSync;
  let sqliteAdapter: SQLiteLedgerAdapter;
  let duckDbAdapter: DuckDbAdapter;
  let taxCalculatorAdapter: DuckDbTaxCalculatorAdapter;
  let materializerService: FifoMaterializerService;
  let ingestionUseCase: CsvIngestionUseCase;
  let e2eUseCase: IngestAndMaterializeUseCase;

  beforeEach(async () => {
    sqlitePath = path.join(os.tmpdir(), `test_ledger_ingest_${Date.now()}.db`);
    sqliteDb = new DatabaseSync(sqlitePath);
    

    sqliteAdapter = new SQLiteLedgerAdapter(sqliteDb);
    await sqliteAdapter.initialize();
    
    process.env.MOCK_MODE = 'false';
    process.env.DUCKDB_PATH = ':memory:';
    duckDbAdapter = new DuckDbAdapter();
    await duckDbAdapter.initialize(sqlitePath);
    taxCalculatorAdapter = new DuckDbTaxCalculatorAdapter(duckDbAdapter);

    const mockPriceProvider = {
      getHistoricalPrice: vi.fn().mockResolvedValue(toPreciseAmount('1')),
    } as unknown as IPriceProviderPort;
    
    const mockUserSettings = {
      getSetting: vi.fn().mockResolvedValue('EUR'),
      setSetting: vi.fn().mockResolvedValue(true),
    } as unknown as IUserSettingsPort;

    materializerService = new FifoMaterializerService(
      sqliteAdapter,
      taxCalculatorAdapter,
      mockUserSettings
    );

    ingestionUseCase = new CsvIngestionUseCase(sqliteAdapter, mockPriceProvider, mockUserSettings);
    e2eUseCase = new IngestAndMaterializeUseCase(ingestionUseCase, materializerService, mockUserSettings);
    
    // Spy on materialization
    vi.spyOn(materializerService, 'recalculate');
  });

  afterEach(async () => {
    sqliteDb.close();
    if (fs.existsSync(sqlitePath)) {
      fs.unlinkSync(sqlitePath);
    }
    vi.restoreAllMocks();
  });

  it('drives a Kraken export CSV through the real parser, ingestion and automatic materialisation, firing materialisation exactly once', async () => {
    // 1. Read CSV fixture
    const fixturePath = path.resolve(__dirname, '../../../../../../../packages/database/tests/fixtures/kraken_spot_and_earn.csv');
    const csvContent = fs.readFileSync(fixturePath, 'utf-8');
    
    // 2. Parse using PapaParse (simulating frontend parser)
    const parseResult = Papa.parse(csvContent, {
      header: false,
      skipEmptyLines: 'greedy',
    });
    
    const rawRows = parseResult.data as string[][];
    expect(rawRows.length).toBeGreaterThan(1);
    
    const headers = rawRows[0];
    const dataRows = rawRows.slice(1);
    
    // 3. Real parser logic (detect profile, guess mapping, map to entity)
    const detection = detectSourceProfile([...headers]);
    if (detection.kind !== 'RESOLVED') throw new Error('Could not resolve profile');
    const profileId = detection.profileId;
    
    const mapping = guessColumnMapping([...headers]);
    
    const submittedRows = dataRows.map(rowArray => {
      const rowDict: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        rowDict[h] = rowArray[i];
      });
      
      const mapped = mapToEntity({ ...rowDict }, mapping, 0, 'SPOT').mappedData;
      const directed = normalizeTransactionDirection(
        { ...mapped, tx_type: mapped.tx_type ?? null, metadata: mapped.metadata ?? {} },
        'UTC',
      );
      
      return { ...directed, account_id: ACCOUNT_ID };
    });
    
    // 4. Ingestion & Automatic Materialisation
    const result = await e2eUseCase.execute({
      rows: submittedRows,
      market: 'spot',
      sourceProfileId: profileId,
      timezone: 'UTC'
    });
    console.log('Ingestion result:', JSON.stringify(result, null, 2));
    
    // 5. Assertions
    expect(materializerService.recalculate).toHaveBeenCalledTimes(1);
    
    // Verify Spot Transactions were inserted correctly, including spot and earn wallets
    const dbRows = sqliteDb.prepare('SELECT * FROM spot_transactions').all();
    console.log('Raw rows in spot_transactions:', dbRows.length);
    
    const spotTxs = await sqliteAdapter.getSpotTransactions();
    expect(spotTxs.length).toBeGreaterThan(0);
    
    console.log('Sample spot tx:', JSON.stringify(spotTxs[0], null, 2));
    
    const hasSpot = spotTxs.some(tx => tx.exchange === 'Binance:spot');
    const hasEarn = spotTxs.some(tx => tx.exchange === 'Binance:earn');
    
    expect(hasSpot).toBe(true);
    expect(hasEarn).toBe(true);
  });
});
