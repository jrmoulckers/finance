import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 60_000,
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
