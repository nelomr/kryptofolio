import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@kryptofolio/shared-types',
    passWithNoTests: true,
    environment: 'node',
  },
});
