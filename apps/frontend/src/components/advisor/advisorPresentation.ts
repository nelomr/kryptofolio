import type { AdvisorProviderFailureKind } from '@kryptofolio/shared-types'
import type { AdvisorTransportCause } from '@/core/domain/models/AdvisorEntities'
import { isTransientHttpStatus } from '@/composables/useAdvisorChat'

/** One text per cause; an HTTP failure reads differently when retrying can help than when it cannot. */
export function transportMessageKey(cause: AdvisorTransportCause): string {
  switch (cause.kind) {
    case 'network':
      return 'advisor.transport.network'
    case 'http':
      return isTransientHttpStatus(cause.status)
        ? 'advisor.transport.http_temporary'
        : 'advisor.transport.http_rejected'
    case 'no-body':
      return 'advisor.transport.no_body'
    case 'invalid-frame':
      return 'advisor.transport.invalid_frame'
    case 'stream-ended':
      return 'advisor.transport.stream_ended'
  }
}

export interface ProviderFailureCopy {
  readonly titleKey: string
  readonly bodyKey: string
  /** Where the user fixes it, when the fix is a setting rather than waiting. */
  readonly cta: { readonly labelKey: string } | undefined
}

/** One text per classified cause; an unclassified cause keeps the generic wording. */
export function providerFailureCopy(kind: AdvisorProviderFailureKind): ProviderFailureCopy {
  switch (kind) {
    case 'auth-rejected':
      return {
        titleKey: 'advisor.failed.ALL_PROVIDERS_FAILED.auth-rejected.title',
        bodyKey: 'advisor.failed.ALL_PROVIDERS_FAILED.auth-rejected.body',
        cta: { labelKey: 'advisor.failed.settings_cta' },
      }
    case 'model-not-found':
      return {
        titleKey: 'advisor.failed.ALL_PROVIDERS_FAILED.model-not-found.title',
        bodyKey: 'advisor.failed.ALL_PROVIDERS_FAILED.model-not-found.body',
        cta: { labelKey: 'advisor.failed.advisor_settings_cta' },
      }
    case 'rate-limited':
      return {
        titleKey: 'advisor.failed.ALL_PROVIDERS_FAILED.rate-limited.title',
        bodyKey: 'advisor.failed.ALL_PROVIDERS_FAILED.rate-limited.body',
        cta: undefined,
      }
    case 'provider-unavailable':
      return {
        titleKey: 'advisor.failed.ALL_PROVIDERS_FAILED.provider-unavailable.title',
        bodyKey: 'advisor.failed.ALL_PROVIDERS_FAILED.provider-unavailable.body',
        cta: undefined,
      }
    case 'network':
      return {
        titleKey: 'advisor.failed.ALL_PROVIDERS_FAILED.network.title',
        bodyKey: 'advisor.failed.ALL_PROVIDERS_FAILED.network.body',
        cta: undefined,
      }
    case 'unknown':
      return {
        titleKey: 'advisor.failed.ALL_PROVIDERS_FAILED.title',
        bodyKey: 'advisor.failed.ALL_PROVIDERS_FAILED.body',
        cta: undefined,
      }
  }
}
