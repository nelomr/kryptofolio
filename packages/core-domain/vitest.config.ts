import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@kryptofolio/core-domain',
    passWithNoTests: true,
    environment: 'node',
  },
});
