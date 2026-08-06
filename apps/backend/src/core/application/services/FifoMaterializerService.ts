import { isSyntheticAccountName } from '@kryptofolio/shared-types';
import type {
  ILedgerPort,
  LedgerTaxLot,
  LedgerTaxLotEvent,
  LedgerCustodyEntry,
  ReconciliationSummary,
} from '../../domain/ports/ILedgerPort.js';
import type { ITaxCalculatorPort } from '../../domain/ports/ITaxCalculatorPort.js';
import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort.js';
import { toPreciseAmount } from '../../domain/value-objects/PreciseAmount.js';

/**
 * Outcome of one materialisation run.
 *
 * Plain data: no HTTP status, no framework type, no database handle. The service is therefore
 * directly invocable as a tool, and the HTTP layer's only job is to serialise this.
 */
export interface MaterializationSummary {
  taxLots: ReconciliationSummary;
  lotHistoryEvents: ReconciliationSummary;
  custodyEntries: ReconciliationSummary;
  /** Rows carrying a data-quality defect. Advisory — a flagged run is still a successful run. */
  flagged: number;
  /** Of those, the ones a user can resolve by declaring a value or a destination. */
  pendingReview: number;
}

const NOTHING_RECONCILED: ReconciliationSummary = {
  inserted: 0,
  updated: 0,
  retired: 0,
  reactivated: 0,
};

/**
 * FifoMaterializerService — recomputes the Spot FIFO projection in DuckDB and reconciles the three
 * derived SQLite tables against it.
 *
 * Structured as a Functional Sandwich: every read from the analytical engine happens before the
 * write transaction opens, so no SQLite write lock is held across a DuckDB query — and the writes
 * are one atomic block whose failure leaves the ledger exactly as it was.
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
   * @param force - Recalculate even when nothing has flagged the ledger as pending.
   */
  public async recalculate(force = false): Promise<MaterializationSummary> {
    const needsRecalculation = await this.userSettingsPort.getSetting('needs_recalculation');
    if (!force && needsRecalculation !== 'true') {
      return {
        taxLots: { ...NOTHING_RECONCILED },
        lotHistoryEvents: { ...NOTHING_RECONCILED },
        custodyEntries: { ...NOTHING_RECONCILED },
        flagged: 0,
        pendingReview: 0,
      };
    }

    const { lots, events } = await this.taxCalculatorPort.calculateLotsAndEvents();
    const custodyEntries = await this.taxCalculatorPort.calculateCustodyEntries();
    const dataQuality = await this.taxCalculatorPort.getDataQuality();

    const domainLots: LedgerTaxLot[] = lots.map(lot => ({
      id: lot.id!,
      spot_transaction_id: lot.spot_transaction_id,
      asset_id: lot.asset_id,
      account_id: lot.account_id,
      original_qty: toPreciseAmount(lot.original_qty),
      remaining_qty: toPreciseAmount(lot.remaining_qty),
      unit_cost_fiat: toPreciseAmount(lot.unit_cost_fiat),
      total_cost_fiat: toPreciseAmount(lot.total_cost_fiat),
      fiat_currency: lot.fiat_currency,
      acquisition_timestamp: lot.acquisition_timestamp,
      exchange_location: lot.exchange_location,
      source_tx_id: lot.source_tx_id,
      status: lot.status,
      quality_flag: lot.quality_flag ?? null,
      value_provenance: lot.value_provenance ?? 'MARKET',
      // Both halves or neither: the pair is one fact, and a rate without its date cannot be audited.
      fx_conversion:
        lot.fx_rate != null && lot.fx_rate_date != null
          ? { rate: toPreciseAmount(lot.fx_rate), rateDate: lot.fx_rate_date }
          : null,
    }));

    const domainEvents: LedgerTaxLotEvent[] = events.map(event => ({
      id: event.id!,
      tax_lot_id: event.tax_lot_id,
      spot_transaction_id: event.spot_transaction_id,
      account_id: event.account_id,
      disposal_date: event.disposal_date,
      amount_from_lot: toPreciseAmount(event.amount_from_lot),
      // An unresolved price stays unresolved: coercing it to 0 would read as a genuine sale at zero.
      sale_price_fiat:
        event.sale_price_fiat === null ? null : toPreciseAmount(event.sale_price_fiat),
      gain_loss_fiat: event.gain_loss_fiat === null ? null : toPreciseAmount(event.gain_loss_fiat),
      fiat_currency: event.fiat_currency,
      is_taxable: event.is_taxable,
      disposal_type: event.disposal_type,
      flag: event.flag ?? null,
      quality_flag: event.quality_flag ?? null,
      value_provenance: event.value_provenance ?? 'MARKET',
      // Both halves or neither: the pair is one fact, and a rate without its date cannot be audited.
      fx_conversion:
        event.fx_rate != null && event.fx_rate_date != null
          ? { rate: toPreciseAmount(event.fx_rate), rateDate: event.fx_rate_date }
          : null,
      notes: event.notes,
    }));

    const domainCustodyEntries: LedgerCustodyEntry[] = custodyEntries.map(entry => ({
      id: entry.id,
      tax_lot_id: entry.tax_lot_id,
      asset_id: entry.asset_id,
      account_id: entry.account_id,
      qty_delta: toPreciseAmount(entry.qty_delta),
      occurred_at: entry.occurred_at,
      spot_transaction_id: entry.spot_transaction_id,
    }));

    const syntheticAccountIds = [
      ...new Set(domainCustodyEntries.map(entry => entry.account_id)),
    ].filter(isSyntheticAccountName);

    return this.ledgerPort.runInTransaction(async () => {
      // The synthetic counterparties are the engine's own invention, so nothing has ever inserted
      // them; every custody leg naming one would be rejected by the account foreign key.
      for (const accountId of syntheticAccountIds) {
        await this.ledgerPort.ensureAccountExists({
          accountId,
          isSynthetic: true,
          parentAccountId: null,
        });
      }

      // Lots before the rows that reference them, so no insert outruns its foreign key.
      const taxLots = await this.ledgerPort.reconcileTaxLots(domainLots);
      const lotHistoryEvents = await this.ledgerPort.reconcileLotHistoryEvents(domainEvents);
      const custody = await this.ledgerPort.reconcileCustodyEntries(domainCustodyEntries);

      await this.userSettingsPort.setSetting('needs_recalculation', 'false');

      return {
        taxLots,
        lotHistoryEvents,
        custodyEntries: custody,
        flagged: dataQuality.length,
        pendingReview: dataQuality.filter(defect => defect.pending_review).length,
      };
    });
  }
}
