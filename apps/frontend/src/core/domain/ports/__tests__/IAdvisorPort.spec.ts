import { describe, it, expect } from 'vitest'
import type { AdvisorStreamEvent, ExecutionProfiles, ModelChain } from '@kryptofolio/shared-types'
import { defaultExecutionProfiles } from '@kryptofolio/shared-types'
import type { IAdvisorPort } from '../IAdvisorPort'
import type { AdvisorConfig, AdvisorAskRequest } from '../../models/AdvisorEntities'

class RecordingAdvisorPort implements IAdvisorPort {
  lastSignal: AbortSignal | undefined
  lastRequest: AdvisorAskRequest | undefined

  async *ask(request: AdvisorAskRequest, signal: AbortSignal): AsyncIterable<AdvisorStreamEvent> {
    this.lastRequest = request
    this.lastSignal = signal
    yield { kind: 'token', runId: 'run-1', text: 'hello' }
  }

  async getConfig(): Promise<AdvisorConfig> {
    return { chain: [], providers: [] }
  }

  async setModelChain(_chain: ModelChain): Promise<void> {}

  async getExecutionProfiles(): Promise<ExecutionProfiles> {
    return defaultExecutionProfiles()
  }

  async setExecutionProfiles(profiles: ExecutionProfiles): Promise<ExecutionProfiles> {
    return profiles
  }
}

describe('IAdvisorPort', () => {
  it('declares a streaming ask taking a request and an abort signal, plus the config methods', async () => {
    const port: IAdvisorPort = new RecordingAdvisorPort()
    const controller = new AbortController()

    const events: AdvisorStreamEvent[] = []
    for await (const event of port.ask({ message: 'hi' }, controller.signal)) {
      events.push(event)
    }

    expect(events).toEqual([{ kind: 'token', runId: 'run-1', text: 'hello' }])
    expect(await port.getConfig()).toEqual({ chain: [], providers: [] })
    expect(await port.getExecutionProfiles()).toEqual(defaultExecutionProfiles())
  })
})
