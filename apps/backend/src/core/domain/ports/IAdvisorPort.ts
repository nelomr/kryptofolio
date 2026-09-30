/**
 * IAdvisorPort — Domain Port for streaming a run of the AI portfolio advisor.
 *
 * DOMAIN ISOLATION RULE: No external library imports allowed here.
 * `ask` returns the iterable directly — no `Promise` wrapper, no `ReadableStream`, no platform
 * cancellation-signal type. Cancellation is expressed by the consumer ceasing to iterate; the
 * adapter's `finally` block is what aborts the underlying provider call. The terminal `AdvisorEvent`
 * members carry the run's
 * `AdvisorRunReceipt` — there is no separate "and also return metadata" channel.
 */
import type { AdvisorEvent } from '../models/AdvisorEvent.js';
import type { AdvisorRequest } from '../models/AdvisorRequest.js';

export interface IAdvisorPort {
  ask(request: AdvisorRequest): AsyncIterable<AdvisorEvent>;
}
