/**
 * RestCryptoAdapter.getTokenHistory() — anti-corruption boundary.
 *
 * A payload carrying the retired FULL|PARTIAL|EMPTY status vocabulary must fail the parse and
 * notify the errorBus, exactly like any other malformed backend response. This is the scenario
 * task 11.1 asks for: rejection with an observable errorBus emission, not merely a failed
 * safeParse in isolation.
 */
import { describe, it, expect, vi } from 'vitest'
import { RestCryptoAdapter } from '../RestCryptoAdapter'
import { errorBus } from '@/core/infrastructure/errors/errorBus'

vi.mock('../../http/BffClient', () => {
  return {
    bffClient: {
      api: {
        portfolio: {
          token: {
            ':symbol': {
              history: {
                $get: vi.fn(),
              },
            },
          },
        },
      },
    },
  }
})

describe('RestCryptoAdapter.getTokenHistory() — stale status vocabulary', () => {
  it('rejects a lot carrying the retired FULL status and notifies the errorBus', async () => {
    const { bffClient } = await import('../../http/BffClient')
    // @ts-expect-error mocked shape
    bffClient.api.portfolio.token[':symbol'].history.$get.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          lots: [
            {
              id: 'lot-1',
              symbol: 'XRP',
              date: '2024-01-01',
              exchange: 'Kraken',
              original_qty: 100,
              remaining_qty: 100,
              unit_cost: 1.5,
              total_cost: 150,
              status: 'FULL',
            },
          ],
          history: {},
        }),
    })

    const errorListener = vi.fn()
    errorBus.on('validation-error', errorListener)

    const adapter = new RestCryptoAdapter()
    await expect(adapter.getTokenHistory('XRP')).rejects.toThrow()
    expect(errorListener).toHaveBeenCalledTimes(1)

    errorBus.off('validation-error', errorListener)
  })

  it('accepts the canonical OPEN status and preserves a null sale price', async () => {
    const { bffClient } = await import('../../http/BffClient')
    // @ts-expect-error mocked shape
    bffClient.api.portfolio.token[':symbol'].history.$get.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          lots: [
            {
              id: 'lot-1',
              symbol: 'XRP',
              date: '2024-01-01',
              exchange: 'Kraken',
              original_qty: 100,
              remaining_qty: 100,
              unit_cost: 1.5,
              total_cost: 150,
              status: 'OPEN',
            },
          ],
          history: {
            'lot-1': [
              {
                id: 'evt-1',
                disposal_date: '2024-06-01',
                amount_from_lot: 1,
                sale_price_eur: null,
                gain_loss_eur: null,
                is_taxable: false,
                operation_type: 'FEE',
                quality_flag: 'MISSING_PRICE',
              },
            ],
          },
        }),
    })

    const adapter = new RestCryptoAdapter()
    const result = await adapter.getTokenHistory('XRP')

    expect(result.lots[0].status).toBe('OPEN')
    expect(result.history['lot-1'][0].salePriceEur).toBeNull()
    expect(result.history['lot-1'][0].disposalType).toBe('FEE')
  })
})
