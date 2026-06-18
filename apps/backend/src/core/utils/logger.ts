import pino from 'pino';

export const bffLogger = pino({
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      '*.apiKey',
      '*.secret',
      'keys[*].raw',
    ],
    censor: '[CONFIDENTIAL_KRYPTOFOLIO]',
    remove: false,
  },
});
