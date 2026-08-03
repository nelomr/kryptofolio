/**
 * SettingsSchemas — Anti-Corruption Layer for the settings endpoints.
 *
 * Mirrors `apps/backend/src/core/infrastructure/routes/settings.ts`. The account selector endpoint
 * excludes synthetic accounts server-side; this schema refuses a payload that carries one anyway, so
 * a regression there surfaces as a named validation failure instead of a synthetic account quietly
 * appearing in a picker.
 *
 * @see openspec/specs/account-hierarchy/spec.md
 */

import { z } from 'zod'
import type { SelectableAccountEntity } from '@/core/domain/models/AccountEntities'

const ExternalSelectableAccountSchema = z
  .object({
    value: z.string().min(1),
    label: z.string(),
    type: z.string(),
    parentAccountId: z.string().nullish(),
    isSynthetic: z.boolean().optional(),
  })
  .refine((raw) => raw.isSynthetic !== true, {
    message: 'the account selector payload carried a synthetic account',
  })
  .transform(
    (raw): SelectableAccountEntity => ({
      id: raw.value,
      name: raw.label,
      type: raw.type,
      parentAccountId: raw.parentAccountId ?? null,
    }),
  )

export const ExternalSelectableAccountsSchema = z.object({
  accounts: z.array(ExternalSelectableAccountSchema),
})

export function parseSelectableAccounts(raw: unknown): SelectableAccountEntity[] {
  const result = ExternalSelectableAccountsSchema.safeParse(raw)
  if (!result.success) {
    throw new Error(
      `[RestSettingsAdapter] Invalid account selector payload: ${result.error.issues
        .map((issue) => issue.message)
        .join('; ')}`,
    )
  }
  return result.data.accounts
}
