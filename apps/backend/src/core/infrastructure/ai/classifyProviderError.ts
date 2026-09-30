import type { AdvisorProviderFailureKind } from '@kryptofolio/shared-types';

export interface ProviderErrorClassification {
  readonly kind: AdvisorProviderFailureKind;
  readonly statusCode: number | undefined;
}

const MAX_CAUSE_DEPTH = 5;
const MAX_MESSAGE_LENGTH = 200;

const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const MODEL_NOT_FOUND_CODES = new Set(['model_not_found', 'model-not-found']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** An error followed down its `cause` chain, cycle-safe and bounded. */
function causeChain(error: unknown): Record<string, unknown>[] {
  const chain: Record<string, unknown>[] = [];
  let current: unknown = error;
  while (isRecord(current) && chain.length < MAX_CAUSE_DEPTH && !chain.includes(current)) {
    chain.push(current);
    current = current.cause;
  }
  return chain;
}

function statusOf(node: Record<string, unknown>): number | undefined {
  if (typeof node.statusCode === 'number') return node.statusCode;
  if (typeof node.status === 'number') return node.status;
  const response = node.response;
  if (isRecord(response) && typeof response.status === 'number') return response.status;
  return undefined;
}

function providerErrorCode(node: Record<string, unknown>): string | undefined {
  const data = node.data;
  const body = isRecord(data) ? data.error : undefined;
  if (isRecord(body) && typeof body.code === 'string') return body.code;
  return typeof node.code === 'string' ? node.code : undefined;
}

function isConnectionFailure(chain: readonly Record<string, unknown>[]): boolean {
  return chain.some((node) => {
    if (typeof node.code === 'string' && NETWORK_ERROR_CODES.has(node.code)) return true;
    if (node.name === 'TimeoutError') return true;
    // A retryable API-call error with no HTTP answer and an underlying cause is the AI SDK's own
    // wrapper for a failed fetch; its cause may carry no code (an unparseable endpoint).
    return node.name === 'AI_APICallError' && statusOf(node) === undefined && node.isRetryable === true && node.cause !== undefined;
  });
}

function kindForStatus(status: number, chain: readonly Record<string, unknown>[]): AdvisorProviderFailureKind {
  if (status === 401 || status === 403) return 'auth-rejected';
  if (status === 404) return 'model-not-found';
  if (status === 429) return 'rate-limited';
  if (status >= 500 && status < 600) return 'provider-unavailable';
  const code = chain.map(providerErrorCode).find((candidate) => candidate !== undefined);
  return code !== undefined && MODEL_NOT_FOUND_CODES.has(code) ? 'model-not-found' : 'unknown';
}

/**
 * Pure function of what the error exposes: the HTTP status first, then the provider's own error
 * code and the error class. Anything unrecognizable is `unknown` rather than a guess.
 */
export function classifyProviderError(error: unknown): ProviderErrorClassification {
  const chain = causeChain(error);
  const statusCode = chain.map(statusOf).find((status) => status !== undefined);
  if (statusCode !== undefined) return { kind: kindForStatus(statusCode, chain), statusCode };
  if (isConnectionFailure(chain)) return { kind: 'network', statusCode: undefined };
  return { kind: 'unknown', statusCode: undefined };
}

const URL_PATTERN = /[a-z][a-z0-9+.-]*:\/\/\S+/gi;
const KEY_SHAPED_PATTERN = /\b(?:sk|pk|gsk|key|api|tok|token)[-_][A-Za-z0-9_-]{8,}/gi;
const LONG_OPAQUE_PATTERN = /[A-Za-z0-9_-]{32,}/g;

/**
 * The message is safe to log, not to show: providers sometimes echo a fragment of the rejected key
 * or the request URL. Known secrets are removed verbatim, then anything shaped like a URL or key.
 */
export function sanitizeProviderErrorMessage(message: string, knownSecrets: readonly string[]): string {
  let cleaned = message;
  for (const secret of knownSecrets) {
    if (secret.length > 0) cleaned = cleaned.split(secret).join('[redacted]');
  }
  cleaned = cleaned
    .replace(URL_PATTERN, '[url]')
    .replace(KEY_SHAPED_PATTERN, '[redacted]')
    .replace(LONG_OPAQUE_PATTERN, '[redacted]');
  return cleaned.slice(0, MAX_MESSAGE_LENGTH);
}
