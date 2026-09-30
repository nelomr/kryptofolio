import { useQuery } from '@pinia/colada'
import { inject, type MaybeRefOrGetter } from 'vue'
import { ADVISOR_PORT_KEY } from '@/core/injectionKeys'

export const ADVISOR_CONFIG_KEY = ['advisor', 'config']
export const ADVISOR_EXECUTION_PROFILES_KEY = ['advisor', 'execution-profiles']

function injectAdvisorPort() {
  const port = inject(ADVISOR_PORT_KEY)
  if (!port) throw new Error('ADVISOR_PORT_KEY not provided')
  return port
}

/** The model chain plus each provider's credential state — the panel's non-streaming server state. */
export function useAdvisorConfigQuery(options: { enabled?: MaybeRefOrGetter<boolean> } = {}) {
  const port = injectAdvisorPort()

  return useQuery({
    key: ADVISOR_CONFIG_KEY,
    query: () => port.getConfig(),
    ...(options.enabled === undefined ? {} : { enabled: options.enabled }),
  })
}

export function useAdvisorExecutionProfilesQuery() {
  const port = injectAdvisorPort()

  return useQuery({
    key: ADVISOR_EXECUTION_PROFILES_KEY,
    query: () => port.getExecutionProfiles(),
  })
}
