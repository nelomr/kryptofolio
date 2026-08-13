/**
 * No monetary field on a converted row may be named for a currency.
 *
 * `sale_price_eur` and `gain_loss_eur` carried whatever currency the ledger held long before this
 * change; the name was a claim the value never honoured. Now that the same row can arrive in EUR or
 * USD depending on a setting, a currency in the field name is not merely stale — it contradicts the
 * outcome travelling beside it.
 *
 * A guard, so it scans source rather than behaviour, and it scans both sides of the wire: the
 * backend DTOs that emit the row and the frontend schema and entities that receive it.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

/** The files that define the converted disposal row on either side of the wire. */
const ROW_DEFINITIONS = [
  'apps/backend/src/core/application/use-cases/GetSpanishTaxReportUseCase.ts',
  'apps/backend/src/core/application/use-cases/GetTokenHistoryUseCase.ts',
  'apps/backend/src/core/domain/ports/ITaxCalculatorPort.ts',
  'apps/frontend/src/core/infrastructure/dtos/ExternalTaxSchemas.ts',
  'apps/frontend/src/core/domain/models/FiscalEntities.ts',
];

/**
 * The names the rename retired.
 *
 * The AEAT summary is on this list, and the first version of this guard exempted it on the grounds
 * that "the summary is a declaration in euros by definition". That was measured false: the summary is
 * derived from bases already converted to the display currency, so in a USD report every one of those
 * `_eur` fields held dollars. The exemption was the same defect the guard exists to catch, one level
 * up, and written by the same hand.
 */
const RETIRED_NAMES = [
  'sale_price_eur',
  'gain_loss_eur',
  'salePriceEur',
  'gainLossEur',
  'capital_gains_eur',
  'capital_losses_eur',
  'savings_base_yields_eur',
  'general_base_airdrops_eur',
  'net_patrimonial_result_eur',
  'estimated_irpf_eur',
  'capitalGainsEur',
  'capitalLossesEur',
  'savingsBaseYieldsEur',
  'generalBaseAirdropsEur',
  'netPatrimonialResultEur',
  'estimatedIrpfEur',
];

function source(file: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8');
}

describe('the converted disposal row names no currency in its money fields', () => {
  it('declares none of the retired names', () => {
    const offenders: string[] = [];

    for (const file of ROW_DEFINITIONS) {
      const text = source(file);
      for (const name of RETIRED_NAMES) {
        if (text.includes(name)) offenders.push(`${file}: ${name}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('proves the scan would catch a survivor', () => {
    // Without this the assertion above passes just as well against a typo in the name list.
    const text = 'export interface Row { sale_price_eur: string | null }';
    expect(RETIRED_NAMES.some((name) => text.includes(name))).toBe(true);
  });

  it('covers the summary as well as the per-event rows', () => {
    // Both levels of the response carry figures in the display currency, so both are in scope. This
    // asserts the list itself did not quietly shrink back to the per-event names.
    expect(RETIRED_NAMES).toContain('capital_gains_eur');
    expect(RETIRED_NAMES).toContain('estimatedIrpfEur');
  });
});
