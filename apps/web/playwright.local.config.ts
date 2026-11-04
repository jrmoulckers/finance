// SPDX-License-Identifier: BUSL-1.1

import { defineConfig, devices } from '@playwright/test';

/**
 * Synthetic local-only acceptance tests against the production PWA.
 * No auth mocks, E2E database stub, environment files, or remote services.
 */
export default defineConfig({
  testDir: './e2e-local',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: 'dist/test-results-local',
  use: {
    baseURL: 'http://127.0.0.1:25973',
    serviceWorkers: 'allow',
    actionTimeout: 15_000,
    reducedMotion: 'reduce',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium-edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } }],
  webServer: {
    command:
      'npm run build -- --config vite.local.config.ts && ' +
      'npx vite preview --config vite.local.config.ts --host 127.0.0.1 --port 25973 --strictPort',
    url: 'http://127.0.0.1:25973',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: 'https://placeholder.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'placeholder-anon-key',
      VITE_POWERSYNC_ENABLED: 'false',
      VITE_SQLITE_AT_REST_ENCRYPTION: 'true',
    },
  },
});
