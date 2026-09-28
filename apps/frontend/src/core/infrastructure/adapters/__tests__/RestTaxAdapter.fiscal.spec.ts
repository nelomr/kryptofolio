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
import type { SpotTransactionEditInput } from '@kryptofolio/shared-types'
import type { ITaxPort } from '@/core/domain/ports/ITaxPort'

const integrityGet = vi.fn()
const destinationsPut = vi.fn()
const destinationsDelete = vi.fn()
const transactionsIdHashPut = vi.fn()
const transactionsIdHashDelete = vi.fn()

vi.mock('../../http/BffClient', () => ({
  bffClient: {
    api: {
      fiscal: {
        integrity: { $get: (...args: unknown[]) => integrityGet(...args) },
        overrides: {
          destinations: {
            $put: (...args: unknown[]) => destinationsPut(...args),
            $delete: (...args: unknown[]) => destinationsDelete(...args),
          },
          transactions: {
            ':idHash': {
              $put: (...args: unknown[]) => transactionsIdHashPut(...args),
              $delete: (...args: unknown[]) => transactionsIdHashDelete(...args),
            },
          },
        },
      },
    },
  },
}))

const { RestTaxAdapter } = await import('../RestTaxAdapter')

// Compile-time proof that ITaxPort declares the two methods (task 9.2): if either were missing
// from the interface, this assignment would fail to typecheck regardless of what RestTaxAdapter
// itself implements.
const _declaresSpotOverrideMethods: Pick<
  ITaxPort,
  'setSpotTransactionOverride' | 'removeSpotTransactionOverride'
> = new RestTaxAdapter()
void _declaresSpotOverrideMethods

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

const unchangedEdit: SpotTransactionEditInput = {
  amount_in: { kind: 'UNCHANGED' },
  amount_out: { kind: 'UNCHANGED' },
  price_fiat: { kind: 'UNCHANGED' },
  total_fiat: { kind: 'UNCHANGED' },
  fee: { kind: 'UNCHANGED' },
  timestamp: { kind: 'UNCHANGED' },
  tx_type: { kind: 'UNCHANGED' },
}

function spotOutcomePayload(balanceCheck: { kind: 'CLEAN' } | { kind: 'NEGATIVE_BALANCE'; entries: unknown[] }) {
  return { ...outcomePayload, balanceCheck }
}

describe('RestTaxAdapter spot transaction override mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('PUTs the edited payload to /overrides/transactions/:idHash and parses balanceCheck', async () => {
    transactionsIdHashPut.mockResolvedValue(jsonResponse(spotOutcomePayload({ kind: 'CLEAN' })))

    const payload: SpotTransactionEditInput = {
      ...unchangedEdit,
      price_fiat: { kind: 'SET', value: '42000', fiatCurrency: 'EUR' },
    }
    const outcome = await new RestTaxAdapter().setSpotTransactionOverride('hash-a' as TransactionIdHash, payload)

    expect(transactionsIdHashPut).toHaveBeenCalledWith({
      param: { idHash: 'hash-a' },
      json: payload,
    })
    expect(outcome.applied).toBe(1)
    expect(outcome.balanceCheck).toEqual({ kind: 'CLEAN' })
  })

  it('parses a NEGATIVE_BALANCE outcome', async () => {
    transactionsIdHashPut.mockResolvedValue(
      jsonResponse(
        spotOutcomePayload({
          kind: 'NEGATIVE_BALANCE',
          entries: [{ assetId: 'BTC', accountId: 'acc-1', balance: '-0.5', tolerance: '0.001' }],
        }),
      ),
    )

    const outcome = await new RestTaxAdapter().setSpotTransactionOverride(
      'hash-a' as TransactionIdHash,
      unchangedEdit,
    )

    expect(outcome.balanceCheck).toEqual({
      kind: 'NEGATIVE_BALANCE',
      entries: [{ assetId: 'BTC', accountId: 'acc-1', balance: '-0.5', tolerance: '0.001' }],
    })
  })

  it('DELETEs to /overrides/transactions/:idHash for a restore', async () => {
    transactionsIdHashDelete.mockResolvedValue(jsonResponse(spotOutcomePayload({ kind: 'CLEAN' })))

    const outcome = await new RestTaxAdapter().removeSpotTransactionOverride('hash-a' as TransactionIdHash)

    expect(transactionsIdHashDelete).toHaveBeenCalledWith({ param: { idHash: 'hash-a' } })
    expect(outcome.applied).toBe(1)
  })

  it('surfaces a rejected edit rather than reporting it as applied', async () => {
    transactionsIdHashPut.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ status: 'error', message: 'cannot retype a custody movement' }),
    })

    await expect(
      new RestTaxAdapter().setSpotTransactionOverride('hash-a' as TransactionIdHash, unchangedEdit),
    ).rejects.toThrow('cannot retype a custody movement')
  })
})
