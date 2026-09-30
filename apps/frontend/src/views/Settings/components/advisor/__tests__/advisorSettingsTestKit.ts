import { vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import type { App } from 'vue'
import { defaultExecutionProfiles, type ExecutionProfiles } from '@kryptofolio/shared-types'
import { ADVISOR_PORT_KEY } from '@/core/injectionKeys'
import type { IAdvisorPort } from '@/core/domain/ports/IAdvisorPort'
import type { AdvisorConfig } from '@/core/domain/models/AdvisorEntities'
import { Select } from '@/components/ui/select'
import AdvisorSettings from '../AdvisorSettings.vue'

export const EMPTY_CONFIG: AdvisorConfig = {
  chain: [],
  providers: [
    { id: 'openai', credential: { kind: 'present' } },
    { id: 'anthropic', credential: { kind: 'absent' } },
    { id: 'google', credential: { kind: 'locked' } },
    { id: 'opencode', credential: { kind: 'present' } },
    { id: 'ollama', credential: { kind: 'absent' } },
    { id: 'ollama-cloud', credential: { kind: 'present' } },
  ],
}

export function configWith(chain: AdvisorConfig['chain']): AdvisorConfig {
  return { ...EMPTY_CONFIG, chain }
}

export function createSettingsPort(
  config: AdvisorConfig = EMPTY_CONFIG,
  profiles: ExecutionProfiles = defaultExecutionProfiles(),
) {
  const port: IAdvisorPort = {
    ask: vi.fn<IAdvisorPort['ask']>(),
    getConfig: vi.fn<IAdvisorPort['getConfig']>().mockResolvedValue(config),
    setModelChain: vi.fn<IAdvisorPort['setModelChain']>().mockResolvedValue(undefined),
    getExecutionProfiles: vi.fn<IAdvisorPort['getExecutionProfiles']>().mockResolvedValue(profiles),
    setExecutionProfiles: vi
      .fn<IAdvisorPort['setExecutionProfiles']>()
      .mockImplementation((next) => Promise.resolve(next)),
  }
  return port
}

export async function mountSettings(port: IAdvisorPort): Promise<VueWrapper> {
  const wrapper = mount(AdvisorSettings, {
    attachTo: document.body,
    global: {
      plugins: [createPinia(), PiniaColada, (app: App) => app.provide(ADVISOR_PORT_KEY, port)],
    },
  })
  await flushPromises()
  return wrapper
}

export function resetDom(): void {
  document.body.innerHTML = ''
}

export const byTestId = (wrapper: VueWrapper, id: string) => wrapper.find(`[data-testid="${id}"]`)
export const allByTestId = (wrapper: VueWrapper, id: string) => wrapper.findAll(`[data-testid="${id}"]`)

/** The provider `Select` of the nth chain entry; reka's popper content is not openable in happy-dom. */
export async function chooseProvider(wrapper: VueWrapper, entryIndex: number, providerId: string): Promise<void> {
  const selects = wrapper.findAllComponents(Select)
  selects[entryIndex].vm.$emit('update:modelValue', providerId)
  await flushPromises()
}

export async function typeInto(wrapper: VueWrapper, testId: string, value: string, index = 0): Promise<void> {
  await allByTestId(wrapper, testId)[index].setValue(value)
  await flushPromises()
}

export async function click(wrapper: VueWrapper, testId: string, index = 0): Promise<void> {
  await allByTestId(wrapper, testId)[index].trigger('click')
  await flushPromises()
}
