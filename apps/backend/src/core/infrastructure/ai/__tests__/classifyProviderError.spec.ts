import { describe, it, expect } from 'vitest';
import {
  classifyProviderError,
  sanitizeProviderErrorMessage,
} from '../classifyProviderError.js';

/**
 * Shapes observed by running Mastra's router against a public endpoint with a throwaway key:
 * every provider failure surfaces as an `AI_APICallError` whose `statusCode` is set for an HTTP
 * answer and absent for a connection failure, where the underlying Node error hangs off `cause`.
 */
function apiCallError(
  message: string,
  fields: Record<string, unknown> = {},
  cause?: Error,
): Error {
  const error = new Error(message, cause ? { cause } : undefined);
  error.name = 'AI_APICallError';
  return Object.assign(error, { isRetryable: false, url: 'https://ollama.com/v1/chat/completions' }, fields);
}

function nodeError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('classifyProviderError', () => {
  const cases: ReadonlyArray<readonly [string, unknown, string, number | undefined]> = [
    [
      'observed 401 from ollama.com with a rejected key',
      apiCallError('Unauthorized', {
        statusCode: 401,
        data: { error: { message: 'Unauthorized', type: 'api_error', param: null, code: null } },
      }),
      'auth-rejected',
      401,
    ],
    ['403 forbidden', apiCallError('Forbidden', { statusCode: 403 }), 'auth-rejected', 403],
    ['404 unknown model', apiCallError('model not found', { statusCode: 404 }), 'model-not-found', 404],
    [
      'explicit unknown-model code on a 400',
      apiCallError('The model does not exist', {
        statusCode: 400,
        data: { error: { message: 'x', type: 'invalid_request_error', param: null, code: 'model_not_found' } },
      }),
      'model-not-found',
      400,
    ],
    ['429 rate limit', apiCallError('Too Many Requests', { statusCode: 429, isRetryable: true }), 'rate-limited', 429],
    ['500 server error', apiCallError('Internal Server Error', { statusCode: 500, isRetryable: true }), 'provider-unavailable', 500],
    ['503 overloaded', apiCallError('Service Unavailable', { statusCode: 503, isRetryable: true }), 'provider-unavailable', 503],
    [
      'observed connection refused',
      apiCallError(
        'Cannot connect to API: connect ECONNREFUSED 127.0.0.1:59999',
        { isRetryable: true, url: 'http://127.0.0.1:59999/v1/chat/completions' },
        nodeError('connect ECONNREFUSED 127.0.0.1:59999', 'ECONNREFUSED'),
      ),
      'network',
      undefined,
    ],
    [
      'observed DNS failure',
      apiCallError(
        'Cannot connect to API: getaddrinfo ENOTFOUND no-such-host.invalid',
        { isRetryable: true },
        nodeError('getaddrinfo ENOTFOUND no-such-host.invalid', 'ENOTFOUND'),
      ),
      'network',
      undefined,
    ],
    [
      'observed unparseable endpoint, a cause with no code',
      apiCallError('Cannot connect to API: bad port', { isRetryable: true }, new Error('bad port')),
      'network',
      undefined,
    ],
    [
      'a bare fetch failure with a coded cause',
      new TypeError('fetch failed', { cause: nodeError('connect ETIMEDOUT', 'ETIMEDOUT') }),
      'network',
      undefined,
    ],
    [
      'a timeout',
      Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' }),
      'network',
      undefined,
    ],
    ['a status wrapped in a cause', new Error('wrapped', { cause: apiCallError('Unauthorized', { statusCode: 401 }) }), 'auth-rejected', 401],
    ['an HTTP answer that is not classifiable', apiCallError('Bad Request', { statusCode: 400 }), 'unknown', 400],
    ['a plain Error', new Error('all providers exhausted'), 'unknown', undefined],
    ['a string', 'boom', 'unknown', undefined],
    ['undefined', undefined, 'unknown', undefined],
  ];

  it.each(cases)('%s', (_label, error, kind, statusCode) => {
    expect(classifyProviderError(error)).toEqual({ kind, statusCode });
  });

  it('prefers the HTTP status over a connection-shaped message', () => {
    const error = apiCallError('Cannot connect to API: boom', { statusCode: 401 }, nodeError('x', 'ECONNREFUSED'));
    expect(classifyProviderError(error).kind).toBe('auth-rejected');
  });

  it('terminates on a cyclic cause chain', () => {
    const error: Error & { cause?: unknown } = new Error('loop');
    error.cause = error;
    expect(classifyProviderError(error)).toEqual({ kind: 'unknown', statusCode: undefined });
  });
});

describe('sanitizeProviderErrorMessage', () => {
  it('removes URLs, known secrets and key-shaped tokens, and bounds the length', () => {
    const message = sanitizeProviderErrorMessage(
      'Cannot reach https://api.example.com/v1/chat?token=abc with key my-secret-value and sk-proj-AbC123xyz789',
      ['my-secret-value'],
    );
    expect(message).not.toContain('api.example.com');
    expect(message).not.toContain('my-secret-value');
    expect(message).not.toContain('sk-proj-AbC123xyz789');
    expect(message.length).toBeLessThanOrEqual(200);
  });

  it('keeps an ordinary diagnostic message intact', () => {
    expect(sanitizeProviderErrorMessage('Unauthorized', [])).toBe('Unauthorized');
  });

  it('ignores an empty secret instead of blanking the message', () => {
    expect(sanitizeProviderErrorMessage('Unauthorized', [''])).toBe('Unauthorized');
  });
});
