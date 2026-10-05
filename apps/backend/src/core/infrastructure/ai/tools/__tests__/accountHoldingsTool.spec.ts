import { describe, it, expect, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import { noopObserve } from '@mastra/core/tools';
import {
  accountHoldingsTool,
  accountHoldingsToolInputSchema,
  accountHoldingsToolOutputSchema,
} from '../accountHoldingsTool.js';
import type { ListedAccount } from '../../../../application/use-cases/accounts/ListAccountsUseCase.js';
import type {
  GetPortfolioSummaryRequest,
  PortfolioHoldingDto,
  PortfolioSummaryResponse,
} from '../../../../application/use-cases/GetPortfolioSummaryUseCase.js';
import type { AdvisorRequestContextValues } from '../../advisorRequestContext.js';

const account = (id: string, name: string, parentAccountId: string | null = null): ListedAccount => ({
  id,
  name,
  type: 'exchange',
  parentAccountId,
});

const ACCOUNTS: ListedAccount[] = [
  account('kraken', 'Kraken'),
  account('kraken:spot', 'Kraken:spot', 'kraken'),
  account('kraken:earn', 'Kraken:earn', 'kraken'),
  account('bit2me', 'Bit2Me'),
  account('bitvavo', 'Bitvavo'),
  account('bitunix', 'Bitunix'),
];

function holding(symbol: string, value: string): PortfolioHoldingDto {
  return {
    id: `asset-${symbol}`,
    symbol,
    amount: '1',
    avg_price_fiat: value,
    cost_basis_fiat: value,
    cost_basis: { kind: 'NATIVE', amount: value, currency: 'EUR' },
    current_value_fiat: value,
    unrealized_pnl_fiat: '0.00',
    currency: 'EUR',
    portfolio_locations: [],
  };
}

function summary(holdings: PortfolioHoldingDto[]): PortfolioSummaryResponse {
  return {
    metrics: {
      rates_incomplete: false,
      prices_incomplete: false,
      total_equity_fiat: '0.00',
      total_cost_basis_fiat: '0.00',
      total_realized_pnl_fiat: '0.00',
      total_unrealized_pnl_fiat: '0.00',
      total_pnl_fiat: '0.00',
      currency: 'EUR',
    },
    holdings,
  };
}

const HOLDINGS_BY_ACCOUNT: Record<string, PortfolioHoldingDto[]> = {
  kraken: [],
  'kraken:spot': [holding('BTC', '100.00'), holding('ETH', '50.00')],
  'kraken:earn': [holding('ADA', '10.00')],
  bit2me: [holding('XRP', '20.00')],
};

function build(accounts: ListedAccount[] = ACCOUNTS) {
  const listAccounts = { execute: vi.fn(async () => accounts) };
  const portfolioSummary = {
    execute: vi.fn(async (request: GetPortfolioSummaryRequest) =>
      summary(HOLDINGS_BY_ACCOUNT[request.accountId ?? ''] ?? []),
    ),
  };
  const tool = accountHoldingsTool({ listAccounts, portfolioSummary }, { topNHoldings: 15, maxChars: 8000 });
  return { listAccounts, portfolioSummary, tool };
}

async function run(tool: ReturnType<typeof build>['tool'], accountName: string) {
  if (!tool.execute) throw new Error('expected tool.execute');
  const requestContext = new RequestContext<AdvisorRequestContextValues>([
    ['locale', 'en'],
    ['baseCurrency', 'EUR'],
  ]);
  const result = await tool.execute(accountHoldingsToolInputSchema.parse({ accountName }), {
    requestContext,
    observe: noopObserve,
  });
  const parsed = accountHoldingsToolOutputSchema.parse(result);
  if (parsed.kind !== 'ok') throw new Error('expected ok');
  return parsed.payload;
}

describe('account_holdings tool', () => {
  it('rolls a parent account up by enumeration: one summary read per account id, one section each, no summation', async () => {
    const { tool, portfolioSummary } = build();

    const payload = await run(tool, 'kraken');

    if (payload.kind !== 'resolved') throw new Error('expected resolved');
    expect(portfolioSummary.execute.mock.calls.map(([request]) => request.accountId)).toEqual([
      'kraken',
      'kraken:spot',
      'kraken:earn',
    ]);
    expect(payload.sections.map((s) => s.accountName)).toEqual(['Kraken:spot', 'Kraken:earn']);
    expect(payload.sections[0]?.ranked.map((h) => h.symbol)).toEqual(['BTC', 'ETH']);
    expect(payload.sections[1]?.ranked.map((h) => h.symbol)).toEqual(['ADA']);
    expect(payload).not.toHaveProperty('metrics');
  });

  it('omits accounts with no holdings from the sections and counts them', async () => {
    const { tool } = build();

    const payload = await run(tool, 'Kraken');

    if (payload.kind !== 'resolved') throw new Error('expected resolved');
    expect(payload.sections).toHaveLength(2);
    expect(payload.emptyAccountCount).toBe(1);
  });

  it('resolves a case-insensitive exact name and a unique prefix', async () => {
    const { tool } = build();

    expect((await run(tool, 'BIT2ME')).kind).toBe('resolved');
    expect((await run(tool, 'bit2')).kind).toBe('resolved');
  });

  it('forwards an ambiguous prefix as a successful result and reads no portfolio data', async () => {
    const { tool, portfolioSummary } = build();

    const payload = await run(tool, 'bit');

    expect(payload).toEqual({ kind: 'ambiguous', candidates: ['Bit2Me', 'Bitvavo', 'Bitunix'] });
    expect(portfolioSummary.execute).not.toHaveBeenCalled();
  });

  it('forwards an unknown name as not_found with the top-level account names', async () => {
    const { tool, portfolioSummary } = build();

    const payload = await run(tool, 'coinbase');

    expect(payload).toEqual({
      kind: 'not_found',
      available: ['Kraken', 'Bit2Me', 'Bitvavo', 'Bitunix'],
    });
    expect(portfolioSummary.execute).not.toHaveBeenCalled();
  });

  it('never resolves a synthetic account, which the account list does not contain', async () => {
    const { tool, portfolioSummary } = build();

    const payload = await run(tool, 'ownwallet-BTC');

    expect(payload.kind).toBe('not_found');
    expect(portfolioSummary.execute).not.toHaveBeenCalled();
  });

  it('applies topNHoldings per section', async () => {
    const listAccounts = { execute: vi.fn(async () => [account('a', 'A')]) };
    const portfolioSummary = {
      execute: vi.fn(async () => summary([holding('BTC', '3'), holding('ETH', '2'), holding('ADA', '1')])),
    };
    const tool = accountHoldingsTool({ listAccounts, portfolioSummary }, { topNHoldings: 2, maxChars: 8000 });

    const payload = await run(tool, 'a');

    if (payload.kind !== 'resolved') throw new Error('expected resolved');
    expect(payload.sections[0]?.ranked).toHaveLength(2);
    expect(payload.sections[0]?.omittedCount).toBe(1);
  });

  it('passes the request currency and no model-supplied scope to each summary read', async () => {
    const { tool, portfolioSummary } = build();

    await run(tool, 'bit2me');

    expect(portfolioSummary.execute).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'bit2me', targetCurrency: 'EUR' }),
    );
  });

  it('truncates through the budget gate when the combined sections are too large', async () => {
    const listAccounts = { execute: vi.fn(async () => ACCOUNTS) };
    const portfolioSummary = {
      execute: vi.fn(async (request: GetPortfolioSummaryRequest) =>
        summary(HOLDINGS_BY_ACCOUNT[request.accountId ?? ''] ?? []),
      ),
    };
    const tool = accountHoldingsTool({ listAccounts, portfolioSummary }, { topNHoldings: 15, maxChars: 50 });
    if (!tool.execute) throw new Error('expected tool.execute');

    const result = await tool.execute(
      { accountName: 'kraken' },
      {
        requestContext: new RequestContext<AdvisorRequestContextValues>([
          ['locale', 'en'],
          ['baseCurrency', 'EUR'],
        ]),
        observe: noopObserve,
      },
    );

    expect(result).toMatchObject({ kind: 'truncated', maxChars: 50 });
  });

  describe('input', () => {
    it('trims the name', () => {
      expect(accountHoldingsToolInputSchema.parse({ accountName: '  Kraken  ' })).toEqual({ accountName: 'Kraken' });
    });

    it('rejects an account id and any other extra field', () => {
      expect(accountHoldingsToolInputSchema.safeParse({ accountName: 'Kraken', accountId: 'kraken' }).success).toBe(false);
      expect(accountHoldingsToolInputSchema.safeParse({ accountName: 'Kraken', currency: 'EUR' }).success).toBe(false);
    });

    it('rejects a name that is empty after trimming or longer than 64 characters', () => {
      expect(accountHoldingsToolInputSchema.safeParse({ accountName: '   ' }).success).toBe(false);
      expect(accountHoldingsToolInputSchema.safeParse({ accountName: 'x'.repeat(65) }).success).toBe(false);
      expect(accountHoldingsToolInputSchema.safeParse({ accountName: 'x'.repeat(64) }).success).toBe(true);
    });
  });
});
