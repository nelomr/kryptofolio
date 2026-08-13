import type {
  ITaxCalculatorPort,
  TaxReportConversion,
  UnconvertibleTaxEvent,
} from '../../domain/ports/ITaxCalculatorPort.js';
import type { IUserSettingsPort } from '../../domain/ports/IUserSettingsPort.js';
import Decimal from 'decimal.js';
import type {
  ConvertedAmount,
  DisposalType,
  FifoQualityFlag,
  FiscalClassificationFlag,
  ManualValueProvenance,
} from '@kryptofolio/shared-types';

/** The IRPF savings-base rate the estimate uses. Named so the figure is not a literal in an expression. */
const IRPF_SAVINGS_BASE_RATE = '0.19';
const ZERO = new Decimal(0);

export interface GetSpanishTaxReportRequest {
  year: number;
  method?: string;
  accountId?: string;
  /** Absent means "whatever the user has configured"; it is resolved, never assumed to be EUR. */
  targetCurrency?: string;
}

/**
 * The AEAT aggregate figures, in the currency the report states.
 *
 * Not named `_eur`, and this is a correction rather than a cosmetic change: these are derived from
 * bases already converted to the display currency, so in a USD report a field named for euros held
 * dollars — the same misrepresentation the per-event rename removed one level down.
 *
 * Exact decimal strings, not numbers. A declared tax base is the last figure in this system that
 * should be a float, and it was the only one left on this path.
 */
export interface TaxReportSummaryDto {
  capital_gains: string;
  capital_losses: string;
  savings_base_yields: string;
  general_base_airdrops: string;
  net_patrimonial_result: string;
  estimated_irpf: string;
}

export interface TaxReportAuditTrailEventDto {
  id: string;
  disposal_date: string;
  amount_from_lot: string;
  /**
   * The figure in the report's currency, with its own conversion outcome.
   *
   * `null` means no price was ever resolved for this event — a `'0'` would read as a genuine disposal
   * at zero, which is the failure mode the nullable column exists to prevent. An outcome of
   * `UNCONVERTIBLE` is the different case where the figure exists and no rate reached it.
   *
   * Not named `_eur`: this carries whatever currency the report states, and a field named for one
   * currency while holding another is the misrepresentation this change removes.
   */
  sale_price: ConvertedAmount | null;
  gain_loss: ConvertedAmount | null;
  sale_fee: number;
  is_taxable: boolean;
  /** Why the lot was consumed: a network fee is not a sale. */
  operation_type: DisposalType;
  flag?: FiscalClassificationFlag | null;
  /** Present when the row was excluded from the declared base, and why. */
  quality_flag?: FifoQualityFlag | null;
  value_provenance?: ManualValueProvenance;
  fx_rate?: string | null;
  fx_rate_date?: string | null;
  notes?: string;
  asset_symbol?: string;
  exchange_name?: string;
}

export interface SpanishTaxReportResponse {
  year: number;
  method: string;
  /** The currency every figure in this response is expressed in. */
  currency: string;
  /** Whether those figures are a record or a derivation, which the header and export must state. */
  conversion: TaxReportConversion;
  /**
   * Events of the period that no rate could express in `currency`.
   *
   * Named, not counted: the totals are missing exactly what these were worth, and the user cannot
   * judge whether the report is filable without knowing which ones they are.
   */
  unconvertibleEvents: readonly UnconvertibleTaxEvent[];
  spotCapitalGains: string;
  savingsBaseYields: string;
  generalBaseAirdrops: string;
  summary: TaxReportSummaryDto;
  /** Events held out of the totals above, so an incomplete base is never presented as complete. */
  excludedFlaggedEvents: number;
  /** Income rows held out of the totals above because no price could be resolved for them. */
  excludedUnresolvedIncomeCount: number;
  /** Figures the user declared rather than the market supplying. */
  manuallyAssignedCount: number;
  audit_trail: TaxReportAuditTrailEventDto[];
}

export class GetSpanishTaxReportUseCase {
  private readonly taxCalculatorPort: ITaxCalculatorPort;
  private readonly userSettingsPort: IUserSettingsPort;

  constructor(taxCalculatorPort: ITaxCalculatorPort, userSettingsPort: IUserSettingsPort) {
    this.taxCalculatorPort = taxCalculatorPort;
    this.userSettingsPort = userSettingsPort;
  }

  async execute(request: GetSpanishTaxReportRequest): Promise<SpanishTaxReportResponse> {
    const year = request.year;
    const method = request.method || 'FIFO';
    const accountId = request.accountId;

    // 1. Impure effect: resolve the currency to report in, then fetch the bases in it.
    //
    // EUR is the fallback rather than the portfolio's USD default: this report is an IRPF
    // declaration, and the currency it can actually be filed in is the euro.
    const targetCurrency =
      request.targetCurrency ??
      (await this.userSettingsPort.getSetting('base_currency')) ??
      'EUR';

    const reportBase = await this.taxCalculatorPort.getSpanishTaxReport(
      year,
      accountId,
      targetCurrency,
    );
    // The per-event read, in the same currency and scoped to the same year. Both come from the
    // engine already filtered, so the year is applied once in SQL rather than re-derived here from a
    // timestamp column three ingestion paths have written three ways.
    const convertedEvents = await this.taxCalculatorPort.getConvertedDisposalEvents(
      { kind: 'FISCAL_YEAR', year },
      accountId,
      targetCurrency,
    );

    // 2. Pure transformation: the AEAT summary over the already-converted bases.
    //
    // The former fallback — "if the base sums to zero, sum the events instead" — is gone. It existed
    // when the base query read only the materialised table, and the base now unions that with the
    // calculated view, so a zero base is a real zero. Kept, it would add native figures into a
    // converted report the moment a period's taxable base legitimately came to nothing.
    //
    // Decimal throughout, not `Number`: these figures are a declaration, and `0.19 * a float` is the
    // one multiplication in this file whose result a user files with a tax authority.
    const gains = new Decimal(reportBase.spotCapitalGains || 0);
    const savingsYields = new Decimal(reportBase.savingsBaseYields || 0);
    const generalAirdrops = new Decimal(reportBase.generalBaseAirdrops || 0);

    const capitalGains = gains.greaterThan(0) ? gains : ZERO;
    const capitalLosses = gains.lessThan(0) ? gains.abs() : ZERO;
    const netPatrimonialResult = gains.plus(savingsYields).plus(generalAirdrops);
    const estimatedIrpf = netPatrimonialResult.greaterThan(0)
      ? netPatrimonialResult.times(IRPF_SAVINGS_BASE_RATE)
      : ZERO;

    return {
      year,
      method,
      currency: reportBase.currency,
      conversion: reportBase.conversion,
      unconvertibleEvents: reportBase.unconvertibleEvents,
      spotCapitalGains: reportBase.spotCapitalGains,
      savingsBaseYields: reportBase.savingsBaseYields,
      generalBaseAirdrops: reportBase.generalBaseAirdrops,
      excludedFlaggedEvents: reportBase.excludedFlaggedEvents,
      excludedUnresolvedIncomeCount: reportBase.excludedUnresolvedIncomeCount,
      manuallyAssignedCount: convertedEvents.filter(
        (evt) => evt.valueProvenance === 'MANUAL',
      ).length,
      summary: {
        capital_gains: capitalGains.toFixed(),
        capital_losses: capitalLosses.toFixed(),
        savings_base_yields: savingsYields.toFixed(),
        general_base_airdrops: generalAirdrops.toFixed(),
        net_patrimonial_result: netPatrimonialResult.toFixed(),
        estimated_irpf: estimatedIrpf.toFixed(),
      },
      audit_trail: convertedEvents.map((evt) => ({
        id: evt.id,
        disposal_date: evt.disposalDate,
        amount_from_lot: evt.amountFromLot,
        sale_price: evt.salePrice,
        gain_loss: evt.gainLoss,
        sale_fee: 0,
        is_taxable: evt.isTaxable,
        operation_type: evt.disposalType,
        flag: evt.flag,
        quality_flag: evt.qualityFlag,
        value_provenance: evt.valueProvenance,
        fx_rate: evt.fxRate,
        fx_rate_date: evt.fxRateDate,
        notes: evt.notes,
        asset_symbol: evt.assetSymbol,
        exchange_name: evt.exchangeName,
      })),
    };
  }
}
