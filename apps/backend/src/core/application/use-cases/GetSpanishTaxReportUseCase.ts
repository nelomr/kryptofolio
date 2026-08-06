import type { ITaxCalculatorPort } from '../../domain/ports/ITaxCalculatorPort.js';
import type {
  DisposalType,
  FifoQualityFlag,
  FiscalClassificationFlag,
  ManualValueProvenance,
} from '@kryptofolio/shared-types';

export interface GetSpanishTaxReportRequest {
  year: number;
  method?: string;
  accountId?: string;
}

export interface TaxReportSummaryDto {
  capital_gains_eur: number;
  capital_losses_eur: number;
  savings_base_yields_eur: number;
  general_base_airdrops_eur: number;
  net_patrimonial_result_eur: number;
  estimated_irpf_eur: number;
}

export interface TaxReportAuditTrailEventDto {
  id: string;
  disposal_date: string;
  amount_from_lot: string;
  /**
   * Null when no price could be resolved. A `'0'` here would be read as a genuine disposal at zero,
   * which is the failure mode the nullable column exists to prevent.
   */
  sale_price_eur: string | null;
  gain_loss_eur: string | null;
  sale_fee_eur: number;
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

  constructor(taxCalculatorPort: ITaxCalculatorPort) {
    this.taxCalculatorPort = taxCalculatorPort;
  }

  async execute(request: GetSpanishTaxReportRequest): Promise<SpanishTaxReportResponse> {
    const year = request.year;
    const method = request.method || 'FIFO';
    const accountId = request.accountId;

    // 1. Impure effect: fetch calculation bases from domain port
    const reportBase = await this.taxCalculatorPort.getSpanishTaxReport(year, accountId);
    const { events } = await this.taxCalculatorPort.calculateLotsAndEvents(accountId);

    // 2. Pure transformation: filter events by fiscal year & calculate AEAT summary
    const filteredEvents = events.filter((evt) => {
      if (!evt.disposal_date) return false;
      const evtYear = new Date(evt.disposal_date).getFullYear();
      return evtYear === year;
    });

    const eventSpotGains = filteredEvents.reduce((sum, evt) => {
      return sum + Number(evt.gain_loss_fiat || 0);
    }, 0);

    const baseGainsNum = Number(reportBase.spotCapitalGains || 0);
    const gainsNum = baseGainsNum !== 0 ? baseGainsNum : eventSpotGains;
    const capitalGainsEur = gainsNum > 0 ? gainsNum : 0;
    const capitalLossesEur = gainsNum < 0 ? Math.abs(gainsNum) : 0;
    const savingsYieldsEur = Number(reportBase.savingsBaseYields || 0);
    const generalAirdropsEur = Number(reportBase.generalBaseAirdrops || 0);

    const netPatrimonialResultEur = gainsNum + savingsYieldsEur + generalAirdropsEur;
    const estimatedIrpfEur = netPatrimonialResultEur > 0 ? netPatrimonialResultEur * 0.19 : 0;

    return {
      year,
      method,
      spotCapitalGains: reportBase.spotCapitalGains,
      savingsBaseYields: reportBase.savingsBaseYields,
      generalBaseAirdrops: reportBase.generalBaseAirdrops,
      excludedFlaggedEvents: reportBase.excludedFlaggedEvents,
      excludedUnresolvedIncomeCount: reportBase.excludedUnresolvedIncomeCount,
      manuallyAssignedCount: filteredEvents.filter(
        (evt) => evt.value_provenance === 'MANUAL',
      ).length,
      summary: {
        capital_gains_eur: capitalGainsEur,
        capital_losses_eur: capitalLossesEur,
        savings_base_yields_eur: savingsYieldsEur,
        general_base_airdrops_eur: generalAirdropsEur,
        net_patrimonial_result_eur: netPatrimonialResultEur,
        estimated_irpf_eur: estimatedIrpfEur,
      },
      audit_trail: filteredEvents.map((evt) => ({
        id: evt.id || 'evt-unknown',
        disposal_date: evt.disposal_date,
        amount_from_lot: evt.amount_from_lot.toString(),
        sale_price_eur: evt.sale_price_fiat === null ? null : evt.sale_price_fiat.toString(),
        gain_loss_eur: evt.gain_loss_fiat === null ? null : evt.gain_loss_fiat.toString(),
        sale_fee_eur: 0,
        is_taxable: evt.is_taxable,
        operation_type: evt.disposal_type,
        flag: evt.flag ?? null,
        quality_flag: evt.quality_flag ?? null,
        value_provenance: evt.value_provenance,
        fx_rate: evt.fx_rate === null ? null : evt.fx_rate?.toString(),
        fx_rate_date: evt.fx_rate_date ?? null,
        notes: evt.notes ?? undefined,
        asset_symbol: evt.asset_symbol,
        exchange_name: evt.exchange_name,
      })),
    };
  }
}
