import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DB_PATH: ':memory:',
      MOCK_MODE: 'true'
    }
  }
});
