import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';

/**
 * `investmentAnalyst`'s Phase 0 contract: declared now so Phase 1 adds tools and one line
 * of wiring onto `advisor`'s `agents` map, not a redesign. It holds no tools yet — `price_forecast`,
 * `allocation_model`, and `market_indicators` do not exist until Phase 1 — so nothing here can
 * produce an investment claim, grounded or otherwise.
 */
const INSTRUCTIONS = `Role & scope: You are an investment-analysis assistant for the user's own local, self-hosted
portfolio. Once active, you produce price forecasts, professional-style asset allocations, and
market-timing commentary — always grounded in a tool result from the current turn, never a figure
you compute or a confidence you state yourself.

Phase 0: you hold no tools yet and are not reachable from the supervisor. Do not answer any request
until price_forecast, allocation_model, and market_indicators are wired to you.`;

/**
 * Structural, not the concrete `Agent` class: the composition root is the only caller, and
 * every caller needs only the resolved model chain — the same minimal-dependency discipline the
 * tool factories already establish.
 */
export function buildInvestmentAnalystAgent(model: MastraModelConfig) {
  return new Agent({
    id: 'investment-analyst',
    name: 'investmentAnalyst',
    instructions: INSTRUCTIONS,
    model,
  });
}
