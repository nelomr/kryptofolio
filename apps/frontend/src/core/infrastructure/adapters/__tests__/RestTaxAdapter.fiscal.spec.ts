/**
 * The fiscal-integrity read and the four override writes at the anti-corruption boundary.
 *
 * Fixtures are typed against the backend's own DTOs via a type-only deep import, so a wire field
 * this layer invents or misnames cannot compile — the mechanism that caught two real contract bugs
 * in group 11.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FiscalIntegrityReportDto } from '@kryptofolio/backend/src/core/infrastructure/dtos/fiscal-integrity.js'
import type { OverrideOutcomeDto } from '@kryptofolio/backend/src/core/infrastructure/dtos/materialization.js'
import type { AccountId, TransactionIdHash } from '@/core/domain/models/BrandedTypes'

const integrityGet = vi.fn()
const pricesPut = vi.fn()
const pricesDelete = vi.fn()
const destinationsPut = vi.fn()
const destinationsDelete = vi.fn()

vi.mock('../../http/BffClient', () => ({
  bffClient: {
    api: {
      fiscal: {
        integrity: { $get: (...args: unknown[]) => integrityGet(...args) },
        overrides: {
          prices: {
            $put: (...args: unknown[]) => pricesPut(...args),
            $delete: (...args: unknown[]) => pricesDelete(...args),
          },
          destinations: {
            $put: (...args: unknown[]) => destinationsPut(...args),
            $delete: (...args: unknown[]) => destinationsDelete(...args),
          },
        },
      },
    },
  },
}))

const { RestTaxAdapter } = await import('../RestTaxAdapter')

const integrityPayload: FiscalIntegrityReportDto = {
  groups: [
    {
      quality_flag: 'MISSING_PRICE',
      severity: 'medium',
      count: 2,
      pendingReview: 2,
      rows: [
        {
          quality_flag: 'MISSING_PRICE',
          severity: 'medium',
          asset_id: 'XRP',
          account_id: 'acc-kraken',
          tx_id: 'hash-a',
          occurred_at: '2026-01-25T00:00:00.000Z',
          detail_key: 'fifo_quality.missing_price.explanation',
          pending_review: true,
        },
      ],
    },
  ],
  totalDefects: 2,
  pendingReview: 2,
  needsRecalculation: true,
}

const outcomePayload: OverrideOutcomeDto = {
  applied: 1,
  materialization: {
    taxLots: { inserted: 1, updated: 0, retired: 0, reactivated: 0 },
    lotHistoryEvents: { inserted: 0, updated: 1, retired: 0, reactivated: 0 },
    custodyEntries: { inserted: 0, updated: 0, retired: 0, reactivated: 0 },
    flagged: 0,
    pendingReview: 1,
  },
  pendingReview: 1,
}

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body }
}

describe('RestTaxAdapter.getFiscalIntegrity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps the grouped defect payload onto the domain entity', async () => {
    integrityGet.mockResolvedValue(jsonResponse(integrityPayload))

    const report = await new RestTaxAdapter().getFiscalIntegrity()

    expect(report.totalDefects).toBe(2)
    expect(report.pendingReview).toBe(2)
    expect(report.needsRecalculation).toBe(true)
    expect(report.groups[0].qualityFlag).toBe('MISSING_PRICE')
    expect(report.groups[0].severity).toBe('medium')
    expect(report.groups[0].rows[0].detailKey).toBe('fifo_quality.missing_price.explanation')
    expect(report.groups[0].rows[0].pendingReview).toBe(true)
  })

  it('passes an account scope through as a query parameter', async () => {
    integrityGet.mockResolvedValue(jsonResponse(integrityPayload))

    await new RestTaxAdapter().getFiscalIntegrity('acc-kraken')

    expect(integrityGet).toHaveBeenCalledWith({ query: { accountId: 'acc-kraken' } })
  })

  it('rejects a payload carrying a flag outside the canonical vocabulary', async () => {
    integrityGet.mockResolvedValue(
      jsonResponse({ ...integrityPayload, groups: [{ ...integrityPayload.groups[0], quality_flag: 'SOMETHING_ELSE' }] }),
    )

    await expect(new RestTaxAdapter().getFiscalIntegrity()).rejects.toThrow()
  })
})

describe('RestTaxAdapter override mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits a declared price as a batch on the wire field names the backend validates', async () => {
    pricesPut.mockResolvedValue(jsonResponse(outcomePayload))

    const outcome = await new RestTaxAdapter().setManualPriceOverrides([
      { idHash: 'hash-a' as TransactionIdHash, priceFiat: '0.42', fiatCurrency: 'EUR', note: 'per receipt' },
    ])

    expect(pricesPut).toHaveBeenCalledWith({
      json: {
        overrides: [
          { id_hash: 'hash-a', price_fiat: '0.42', fiat_currency: 'EUR', note: 'per receipt' },
        ],
      },
    })
    expect(outcome.applied).toBe(1)
    expect(outcome.pendingReview).toBe(1)
  })

  it('keeps a declared amount as a decimal string rather than a float', async () => {
    pricesPut.mockResolvedValue(jsonResponse(outcomePayload))

    await new RestTaxAdapter().setManualPriceOverrides([
      { idHash: 'hash-a' as TransactionIdHash, priceFiat: '0.10', fiatCurrency: 'EUR' },
    ])

    const body = pricesPut.mock.calls[0][0] as { json: { overrides: { price_fiat: unknown }[] } }
    expect(body.json.overrides[0].price_fiat).toBe('0.10')
  })

  it('removes declared prices by identity', async () => {
    pricesDelete.mockResolvedValue(jsonResponse({ ...outcomePayload, applied: 1 }))

    await new RestTaxAdapter().removeManualPriceOverrides(['hash-a' as TransactionIdHash])

    expect(pricesDelete).toHaveBeenCalledWith({ json: { idHashes: ['hash-a'] } })
  })

  it('submits a declared destination', async () => {
    destinationsPut.mockResolvedValue(jsonResponse(outcomePayload))

    await new RestTaxAdapter().setTransferDestinations([
      { idHash: 'hash-w' as TransactionIdHash, counterpartyAccountId: 'acc-ledger' as AccountId },
    ])

    expect(destinationsPut).toHaveBeenCalledWith({
      json: {
        overrides: [{ id_hash: 'hash-w', counterparty_account_id: 'acc-ledger', note: undefined }],
      },
    })
  })

  it('removes declared destinations by identity', async () => {
    destinationsDelete.mockResolvedValue(jsonResponse(outcomePayload))

    await new RestTaxAdapter().removeTransferDestinations(['hash-w' as TransactionIdHash])

    expect(destinationsDelete).toHaveBeenCalledWith({ json: { idHashes: ['hash-w'] } })
  })

  it('surfaces a rejected declaration rather than reporting it as applied', async () => {
    destinationsPut.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ status: 'error', message: 'unknown account' }),
    })

    // The backend's own wording must survive: it names what the user has to correct, whereas a
    // generic schema failure would tell them only that something was malformed.
    await expect(
      new RestTaxAdapter().setTransferDestinations([
        { idHash: 'hash-w' as TransactionIdHash, counterpartyAccountId: 'acc-ghost' as AccountId },
      ]),
    ).rejects.toThrow('unknown account')
  })
})
