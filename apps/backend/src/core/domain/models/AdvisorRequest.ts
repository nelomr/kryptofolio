/**
 * AdvisorRequest — what `AskAdvisorUC` hands `IAdvisorPort.ask` after resolving context impurely,
 * applying the Functional Sandwich at stream scale: locale and base currency via
 * `IUserSettingsPort`, the message and thread from the caller. The model chain itself is resolved
 * separately inside the adapter, not carried on this request — the port's only job is to ask.
 *
 * `threadId` is optional: absent means the adapter creates one, which is only expressible if the
 * field can be absent. An earlier version of this type had declared it required — an inference that
 * didn't yet account for the new-conversation case.
 *
 * DOMAIN ISOLATION RULE: No external library imports allowed here.
 */
export interface AdvisorRequest {
  readonly message: string;
  readonly threadId?: string;
  readonly locale: string;
  readonly baseCurrency: string;
}
