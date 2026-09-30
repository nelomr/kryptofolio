import { describe, it, expect, vi } from 'vitest'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { PiniaColada } from '@pinia/colada'
import { defaultExecutionProfiles } from '@kryptofolio/shared-types'
import { ADVISOR_PORT_KEY } from '@/core/injectionKeys'
import type { IAdvisorPort } from '@/core/domain/ports/IAdvisorPort'
import type { AdvisorConfig } from '@/core/domain/models/AdvisorEntities'
import { useAdvisorConfigQuery, useAdvisorExecutionProfilesQuery } from '../queries/useAdvisorQueries'
import queriesSource from '../queries/useAdvisorQueries.ts?raw'
import chatSource from '../useAdvisorChat.ts?raw'

const config: AdvisorConfig = {
  chain: [{ providerId: 'anthropic', modelId: 'claude-sonnet' }],
  providers: [
    { id: 'anthropic', credential: { kind: 'locked' } },
    { id: 'ollama', credential: { kind: 'present' } },
  ],
}

function createPort() {
  const getConfig = vi.fn<IAdvisorPort['getConfig']>().mockResolvedValue(config)
  const getExecutionProfiles = vi
    .fn<IAdvisorPort['getExecutionProfiles']>()
    .mockResolvedValue(defaultExecutionProfiles())
  const ask = vi.fn<IAdvisorPort['ask']>()
  const port: IAdvisorPort = {
    ask,
    getConfig,
    getExecutionProfiles,
    setModelChain: vi.fn<IAdvisorPort['setModelChain']>(),
    setExecutionProfiles: vi.fn<IAdvisorPort['setExecutionProfiles']>(),
  }
  return { port, getConfig, getExecutionProfiles, ask }
}

function setup() {
  const app = createApp({})
  app.use(createPinia())
  app.use(PiniaColada)
  const mocks = createPort()
  app.provide(ADVISOR_PORT_KEY, mocks.port)
  return { app, ...mocks }
}

describe('advisor Pinia Colada queries', () => {
  it('fetches the config and credential states through the port', async () => {
    const { app, getConfig } = setup()

    let query: ReturnType<typeof useAdvisorConfigQuery> | undefined
    app.runWithContext(() => {
      query = useAdvisorConfigQuery()
    })
    await vi.waitFor(() => expect(query?.data.value).toEqual(config))

    expect(getConfig).toHaveBeenCalledTimes(1)
    expect(query?.data.value?.providers[0].credential).toEqual({ kind: 'locked' })
  })

  it('fetches the execution profiles through the port', async () => {
    const { app, getExecutionProfiles } = setup()

    let query: ReturnType<typeof useAdvisorExecutionProfilesQuery> | undefined
    app.runWithContext(() => {
      query = useAdvisorExecutionProfilesQuery()
    })
    await vi.waitFor(() => expect(query?.data.value).toEqual(defaultExecutionProfiles()))

    expect(getExecutionProfiles).toHaveBeenCalledTimes(1)
  })

  it('fails loudly when the advisor port is not provided', () => {
    const app = createApp({})
    app.use(createPinia())
    app.use(PiniaColada)

    expect(() => app.runWithContext(() => useAdvisorConfigQuery())).toThrow(/ADVISOR_PORT_KEY/)
  })

  it('never wraps the token stream in a query', async () => {
    const { app, ask } = setup()

    app.runWithContext(() => {
      useAdvisorConfigQuery()
      useAdvisorExecutionProfilesQuery()
    })
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(ask).not.toHaveBeenCalled()
    expect(queriesSource).not.toMatch(/\.ask\s*\(/)
    expect(chatSource).not.toMatch(/useQuery|useMutation|@pinia\/colada/)
  })
})
