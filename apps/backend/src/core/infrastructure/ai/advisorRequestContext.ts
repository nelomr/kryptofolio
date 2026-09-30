import { z } from 'zod';

/**
 * The values Mastra's own `RequestContext` carries for every advisor run — locale and base
 * currency, resolved impurely by the adapter's Functional Sandwich before any
 * model or tool call. Declared as a schema, not a bare interface, so both an `Agent`'s
 * `requestContextSchema` and a tool's own `requestContextSchema` infer the same strongly-typed
 * `RequestContext<AdvisorRequestContextValues>` with zero casts — `RequestContext.get` is
 * otherwise typed to whatever generic the caller supplies, with no runtime check of its own.
 */
export const advisorRequestContextSchema = z.object({
  locale: z.string(),
  baseCurrency: z.string(),
});

export type AdvisorRequestContextValues = z.infer<typeof advisorRequestContextSchema>;
