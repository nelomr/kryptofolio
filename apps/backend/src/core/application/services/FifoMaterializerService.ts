import type { ILedgerPort } from '../../domain/ports/ILedgerPort.js';
import type { ITaxCalculatorPort } from '../../domain/ports/ITaxCalculatorPort.js';
import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort.js';
import Decimal from 'decimal.js';

/**
 * FifoMaterializerService — Application service that coordinates the recalculation
 * of Spot FIFO tax lots and history events inside DuckDB, and materializes them
 * back into the SQLite primary ledger database.
 */
export class FifoMaterializerService {
  private readonly ledgerPort: ILedgerPort;
  private readonly taxCalculatorPort: ITaxCalculatorPort;
  private readonly userSettingsPort: IUserSettingsPort;

  constructor(
    ledgerPort: ILedgerPort,
    taxCalculatorPort: ITaxCalculatorPort,
    userSettingsPort: IUserSettingsPort
  ) {
    this.ledgerPort = ledgerPort;
    this.taxCalculatorPort = taxCalculatorPort;
    this.userSettingsPort = userSettingsPort;
  }

  /**
   * Recalculates the tax lots and materializes the output back to SQLite if the database is flagged as dirty.
   *
   * @param force - If true, bypasses the needs_recalculation check.
   */
  public async recalculate(force = false): Promise<void> {
    const needsRecalculation = await this.userSettingsPort.getSetting('needs_recalculation');
    if (!force && needsRecalculation !== 'true') {
      return;
    }

    // 1. Compute Spot FIFO tax lots and events in DuckDB
    const { lots, events } = await this.taxCalculatorPort.calculateLotsAndEvents();

    // 2. Map schema outputs to domain entity types (translating strings to Decimal instances)
    const domainLots = lots.map(lot => ({
      id: lot.id!,
      spot_transaction_id: lot.spot_transaction_id,
      asset_id: lot.asset_id,
      account_id: lot.account_id,
      original_qty: new Decimal(lot.original_qty),
      remaining_qty: new Decimal(lot.remaining_qty),
      unit_cost_fiat: new Decimal(lot.unit_cost_fiat),
      total_cost_fiat: new Decimal(lot.total_cost_fiat),
      fiat_currency: lot.fiat_currency,
      acquisition_timestamp: lot.acquisition_timestamp,
      exchange_location: lot.exchange_location,
      source_tx_id: lot.source_tx_id,
      status: lot.status,
    }));

    const domainEvents = events.map(event => ({
      id: event.id!,
      tax_lot_id: event.tax_lot_id,
      spot_transaction_id: event.spot_transaction_id,
      account_id: event.account_id,
      disposal_date: event.disposal_date,
      amount_from_lot: new Decimal(event.amount_from_lot),
      sale_price_fiat: new Decimal(event.sale_price_fiat),
      gain_loss_fiat: new Decimal(event.gain_loss_fiat),
      fiat_currency: event.fiat_currency,
      is_taxable: event.is_taxable,
      flag: event.flag,
      notes: event.notes,
    }));

    // 3. Materialize (UPSERT) into primary SQLite tables
    await this.ledgerPort.upsertTaxLots(domainLots);
    await this.ledgerPort.upsertLotHistoryEvents(domainEvents);

    // 4. Reset the recalculation flag
    await this.userSettingsPort.setSetting('needs_recalculation', 'false');
  }
}
