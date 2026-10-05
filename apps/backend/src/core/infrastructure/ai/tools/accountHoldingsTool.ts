import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { accountSubtree, resolveAccountByName } from '@kryptofolio/core-domain';
import type { ListAccountsUseCase } from '../../../application/use-cases/accounts/ListAccountsUseCase.js';
import type { GetPortfolioSummaryUseCase } from '../../../application/use-cases/GetPortfolioSummaryUseCase.js';
import { advisorRequestContextSchema } from '../advisorRequestContext.js';
import { portfolioSummaryPayloadSchema, projectPortfolioSummary } from './portfolioSummaryTool.js';
import { enforceBudget, type EnforceBudgetResult, type RunBudgetTracker } from './enforceBudget.js';

/** A name, never an id: the model cannot know an account id, and the server resolves the name. */
export const accountHoldingsToolInputSchema = z
  .object({ accountName: z.string().trim().min(1).max(64) })
  .strict();

const sectionSchema = portfolioSummaryPayloadSchema
  .omit({ unvaluedCount: true })
  .extend({ accountName: z.string() })
  .strict();

const accountHoldingsPayloadSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('resolved'),
      sections: z.array(sectionSchema),
      emptyAccountCount: z.number().int().nonnegative(),
    })
    .strict(),
  z.object({ kind: z.literal('ambiguous'), candidates: z.array(z.string()) }).strict(),
  z.object({ kind: z.literal('not_found'), available: z.array(z.string()) }).strict(),
]);

export const accountHoldingsToolOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), payload: accountHoldingsPayloadSchema }).strict(),
  z
    .object({
      kind: z.literal('truncated'),
      maxChars: z.number().int().positive(),
      actualChars: z.number().int().positive(),
    })
    .strict(),
]);

export type AccountHoldingsToolPayload = z.infer<typeof accountHoldingsPayloadSchema>;

export interface AccountHoldingsToolConfig {
  /** From the resolved execution profile's `topNHoldings`, applied to each section. */
  topNHoldings: number;
  maxChars: number;
  runBudgetTracker?: RunBudgetTracker;
  livePrices?: (currency: string) => Promise<Map<string, string>>;
}

export type ListAccountsUseCaseLike = Pick<ListAccountsUseCase, 'execute'>;

export interface AccountHoldingsUseCases {
  listAccounts: ListAccountsUseCaseLike;
  portfolioSummary: Pick<GetPortfolioSummaryUseCase, 'execute'>;
}

/**
 * A resolved account expands to itself plus its descendants because a parent venue holds nothing
 * itself under the account hierarchy. One summary is read per account and reported as its own
 * section: figures are never added across accounts.
 */
export async function readAccountHoldings(
  useCases: AccountHoldingsUseCases,
  accountName: string,
  baseCurrency: string,
  config: AccountHoldingsToolConfig,
): Promise<EnforceBudgetResult<AccountHoldingsToolPayload>> {
  const accounts = await useCases.listAccounts.execute();
  const resolution = resolveAccountByName(accounts, accountName);

  if (resolution.kind === 'ambiguous') {
    return enforceBudget(
      { kind: 'ambiguous', candidates: resolution.candidates },
      config.maxChars,
      config.runBudgetTracker,
    );
  }
  if (resolution.kind === 'not_found') {
    return enforceBudget(
      { kind: 'not_found', available: resolution.available },
      config.maxChars,
      config.runBudgetTracker,
    );
  }

  const livePrices = await config.livePrices?.(baseCurrency);
  const tree = accountSubtree(accounts, resolution.account.id);
  const summaries = await Promise.all(
    tree.map(async (node) => ({
      node,
      response: await useCases.portfolioSummary.execute({
        accountId: node.id,
        targetCurrency: baseCurrency,
        livePrices,
      }),
    })),
  );

  const held = summaries.filter(({ response }) => response.holdings.length > 0);
  const payload: AccountHoldingsToolPayload = {
    kind: 'resolved',
    sections: held.map(({ node, response }) => {
      const { unvaluedCount: _unvaluedCount, ...section } = projectPortfolioSummary(response, config.topNHoldings);
      return { accountName: node.name, ...section };
    }),
    emptyAccountCount: summaries.length - held.length,
  };
  return enforceBudget(payload, config.maxChars, config.runBudgetTracker);
}

export function accountHoldingsTool(useCases: AccountHoldingsUseCases, config: AccountHoldingsToolConfig) {
  return createTool({
    id: 'account_holdings',
    description:
      "Holdings of one account, looked up by its name (case-insensitive; a unique prefix also works). A parent account such as an exchange returns one section per sub-account that holds assets, each with its own totals; figures are never summed across sections. An unknown or ambiguous name is reported with the names to choose from, so ask the user which one they meant. Never ask for or send an account id. Read-only.",
    inputSchema: accountHoldingsToolInputSchema,
    outputSchema: accountHoldingsToolOutputSchema,
    requestContextSchema: advisorRequestContextSchema,
    execute: async (inputData, { requestContext }) =>
      readAccountHoldings(useCases, inputData.accountName, requestContext.get('baseCurrency'), config),
  });
}
