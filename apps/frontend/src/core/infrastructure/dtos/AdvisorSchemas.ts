/**
 * AdvisorSchemas — Anti-Corruption Layer for the advisor's non-streaming endpoints.
 *
 * The wire already uses camelCase for every advisor payload, so this layer's job is narrowing, not
 * renaming: it keeps only the fields the UI consumes and refuses anything outside the closed
 * provider and credential vocabularies. Stream frames are validated separately, by the shared
 * `advisorStreamEventSchema`, inside the adapter that owns the transport.
 */

import { z } from 'zod'
import { AI_PROVIDER_IDS, modelChainEntrySchema } from '@kryptofolio/shared-types'

const CredentialStateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('present') }),
  z.object({ kind: z.literal('absent') }),
  z.object({ kind: z.literal('locked') }),
])

const ProviderStatusSchema = z.object({
  id: z.enum(AI_PROVIDER_IDS),
  credential: CredentialStateSchema,
})

export const AdvisorConfigSchema = z.object({
  chain: z.array(modelChainEntrySchema),
  providers: z.array(ProviderStatusSchema),
})
