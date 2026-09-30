import { useMutation, useQueryCache } from '@pinia/colada'
import { inject } from 'vue'
import type { ExecutionProfiles, ModelChain } from '@kryptofolio/shared-types'
import { ADVISOR_PORT_KEY } from '@/core/injectionKeys'
import { ADVISOR_CONFIG_KEY, ADVISOR_EXECUTION_PROFILES_KEY } from './useAdvisorQueries'

function injectAdvisorPort() {
  const port = inject(ADVISOR_PORT_KEY)
  if (!port) throw new Error('ADVISOR_PORT_KEY not provided')
  return port
}

/**
 * Failures are already reported to the user by the adapter's error bus; the mutation's own
 * `status` is what the Settings section reads to show the failure inline.
 */
export function useSetModelChainMutation() {
  const port = injectAdvisorPort()
  const queryCache = useQueryCache()

  return useMutation({
    mutation: (chain: ModelChain) => port.setModelChain(chain),
    onSuccess: () => queryCache.invalidateQueries({ key: ADVISOR_CONFIG_KEY }),
  })
}

export function useSetExecutionProfilesMutation() {
  const port = injectAdvisorPort()
  const queryCache = useQueryCache()

  return useMutation({
    mutation: (profiles: ExecutionProfiles) => port.setExecutionProfiles(profiles),
    onSuccess: () => queryCache.invalidateQueries({ key: ADVISOR_EXECUTION_PROFILES_KEY }),
  })
}
