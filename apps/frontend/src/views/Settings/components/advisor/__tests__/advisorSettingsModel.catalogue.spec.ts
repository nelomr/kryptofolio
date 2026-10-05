import { describe, it, expect, vi } from 'vitest'

const FUTURE_TOOL = 'zz_future_tool'

vi.mock('@kryptofolio/shared-types', async (importOriginal) => {
  const original = await importOriginal<typeof import('@kryptofolio/shared-types')>()
  return { ...original, ADVISOR_TOOL_NAMES: [...original.ADVISOR_TOOL_NAMES, 'zz_future_tool'] }
})

const { ADVISOR_TOOL_NAMES, defaultExecutionProfiles } = await import('@kryptofolio/shared-types')
const { draftFromProfiles } = await import('../advisorSettingsModel')

describe('the settings draft follows the shared tool catalogue', () => {
  it('carries a budget text for every name in ADVISOR_TOOL_NAMES, including one added after this file was written', () => {
    const defaults = defaultExecutionProfiles()
    const budgets = Object.fromEntries(ADVISOR_TOOL_NAMES.map((name, index) => [name, 1000 + index]))
    const profiles = { ...defaults, metered: { ...defaults.metered, toolBudgets: budgets } }

    // @ts-expect-error the widened catalogue is deliberately not part of the static type
    const draft = draftFromProfiles(profiles)

    expect(Object.keys(draft.metered.toolBudgets).sort()).toEqual([...ADVISOR_TOOL_NAMES].sort())
    expect(Object.fromEntries(Object.entries(draft.metered.toolBudgets))[FUTURE_TOOL]).toBe(
      String(budgets[FUTURE_TOOL]),
    )
  })
})
