import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@kryptofolio/database',
    passWithNoTests: true,
    environment: 'node',
  },
});
