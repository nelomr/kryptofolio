import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defaultExecutionProfiles, type ModelChain } from '@kryptofolio/shared-types'
import { RestAdvisorAdapter } from '../RestAdvisorAdapter'
import { errorBus } from '@/core/infrastructure/errors/errorBus'

vi.mock('@/core/infrastructure/errors/errorBus', () => ({
  errorBus: { emit: vi.fn() },
}))

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn<() => Promise<Response>>(),
  putModelChain: vi.fn<(args: { json: unknown }) => Promise<Response>>(),
  getProfiles: vi.fn<() => Promise<Response>>(),
  putProfiles: vi.fn<(args: { json: unknown }) => Promise<Response>>(),
}))

vi.mock('../../http/BffClient', () => ({
  BFF_BASE_URL: 'http://backend.test',
  bffClient: {
    api: {
      advisor: {
        config: {
          $get: mocks.getConfig,
          'model-chain': { $put: mocks.putModelChain },
          'execution-profiles': { $get: mocks.getProfiles, $put: mocks.putProfiles },
        },
      },
    },
  },
}))

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const chain: ModelChain = [
  { providerId: 'ollama', modelId: 'llama3', contextWindow: 8192 },
  { providerId: 'anthropic', modelId: 'claude-sonnet' },
]

beforeEach(() => {
  vi.mocked(errorBus.emit).mockClear()
  vi.mocked(mocks.getConfig).mockReset()
  vi.mocked(mocks.putModelChain).mockReset()
  vi.mocked(mocks.getProfiles).mockReset()
  vi.mocked(mocks.putProfiles).mockReset()
})

describe('RestAdvisorAdapter.getConfig', () => {
  it('maps the wire config to the domain shape, dropping the registry category', async () => {
    vi.mocked(mocks.getConfig).mockResolvedValue(
      jsonResponse({
        chain,
        providers: [
          { id: 'ollama', category: { kind: 'ai-model' }, credential: { kind: 'present' } },
          { id: 'anthropic', category: { kind: 'ai-model' }, credential: { kind: 'locked' } },
        ],
      }),
    )

    const result = await new RestAdvisorAdapter().getConfig()

    expect(result).toEqual({
      chain,
      providers: [
        { id: 'ollama', credential: { kind: 'present' } },
        { id: 'anthropic', credential: { kind: 'locked' } },
      ],
    })
  })

  it('reports a malformed config payload to the errorBus and rejects', async () => {
    vi.mocked(mocks.getConfig).mockResolvedValue(
      jsonResponse({ chain: [], providers: [{ id: 'not-a-provider' }] }),
    )

    await expect(new RestAdvisorAdapter().getConfig()).rejects.toThrow()
    expect(errorBus.emit).toHaveBeenCalledWith(
      'validation-error',
      expect.objectContaining({ context: 'RestAdvisorAdapter.getConfig' }),
    )
  })

  it('rejects on an error status without consulting the body schema', async () => {
    vi.mocked(mocks.getConfig).mockResolvedValue(jsonResponse({ error: 'boom' }, 500))

    await expect(new RestAdvisorAdapter().getConfig()).rejects.toThrow(/500/)
  })
})

describe('RestAdvisorAdapter.setModelChain', () => {
  it('PUTs the chain as the JSON body', async () => {
    vi.mocked(mocks.putModelChain).mockResolvedValue(jsonResponse({ success: true }))

    await new RestAdvisorAdapter().setModelChain(chain)

    expect(mocks.putModelChain).toHaveBeenCalledWith({ json: chain })
  })

  it('rejects when the server refuses the chain', async () => {
    vi.mocked(mocks.putModelChain).mockResolvedValue(jsonResponse({ error: 'bad' }, 400))

    await expect(new RestAdvisorAdapter().setModelChain(chain)).rejects.toThrow(/400/)
    expect(errorBus.emit).toHaveBeenCalledTimes(1)
    expect(errorBus.emit).toHaveBeenCalledWith(
      'operation-error',
      expect.objectContaining({
        code: 'ADVISOR_MODEL_CHAIN_REJECTED',
        message: 'errors.advisor.model_chain_rejected',
      }),
    )
  })

  it('does not report a saved chain', async () => {
    vi.mocked(mocks.putModelChain).mockResolvedValue(jsonResponse({ success: true }))

    await new RestAdvisorAdapter().setModelChain(chain)

    expect(errorBus.emit).not.toHaveBeenCalled()
  })
})

describe('RestAdvisorAdapter execution profiles', () => {
  it('validates and returns the stored profiles', async () => {
    const profiles = defaultExecutionProfiles()
    vi.mocked(mocks.getProfiles).mockResolvedValue(jsonResponse(profiles))

    await expect(new RestAdvisorAdapter().getExecutionProfiles()).resolves.toEqual(profiles)
  })

  it('reports a malformed profiles payload to the errorBus and rejects', async () => {
    vi.mocked(mocks.getProfiles).mockResolvedValue(jsonResponse({ metered: {} }))

    await expect(new RestAdvisorAdapter().getExecutionProfiles()).rejects.toThrow()
    expect(errorBus.emit).toHaveBeenCalledWith(
      'validation-error',
      expect.objectContaining({ context: 'RestAdvisorAdapter.getExecutionProfiles' }),
    )
  })

  it('PUTs valid profiles and returns the validated echo', async () => {
    const profiles = defaultExecutionProfiles()
    vi.mocked(mocks.putProfiles).mockResolvedValue(jsonResponse(profiles))

    await expect(new RestAdvisorAdapter().setExecutionProfiles(profiles)).resolves.toEqual(profiles)
    expect(mocks.putProfiles).toHaveBeenCalledWith({ json: profiles })
  })

  it('reports a write above a ceiling to the errorBus instead of clamping it, and sends nothing', async () => {
    const profiles = defaultExecutionProfiles()
    const aboveCeiling = { ...profiles, metered: { ...profiles.metered, maxSteps: 31 } }

    await expect(new RestAdvisorAdapter().setExecutionProfiles(aboveCeiling)).rejects.toThrow()

    expect(mocks.putProfiles).not.toHaveBeenCalled()
    expect(errorBus.emit).toHaveBeenCalledWith(
      'validation-error',
      expect.objectContaining({ context: 'RestAdvisorAdapter.setExecutionProfiles' }),
    )
  })

  it('reports a server-side rejection of a write as an operation error and rejects', async () => {
    vi.mocked(mocks.putProfiles).mockResolvedValue(jsonResponse({ error: 'ceiling' }, 400))

    await expect(new RestAdvisorAdapter().setExecutionProfiles(defaultExecutionProfiles())).rejects.toThrow(/400/)
    expect(errorBus.emit).toHaveBeenCalledWith(
      'operation-error',
      expect.objectContaining({ code: 'ADVISOR_EXECUTION_PROFILES_REJECTED' }),
    )
  })
})
