// SPDX-License-Identifier: BUSL-1.1

import { defineConfig, devices } from '@playwright/test';

import { localSyncEnvironment } from './e2e-sync/environment';

const environment = localSyncEnvironment();
const port = Number(process.env.LIVE_SYNC_PORT ?? 4193);

export default defineConfig({
  testDir: './e2e-sync',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 30_000 },
  reporter: 'list',
  outputDir: 'dist/test-results-sync',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: {
    baseURL: `http://localhost:${port}`,
    serviceWorkers: 'allow',
    // Auth responses contain session credentials, even with synthetic users.
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  // Missing public configuration fails in beforeAll, not as a misleading
  // production-build error or a skipped/passing replication test.
  webServer: environment.anonKey
    ? {
        command:
          'npm run build -- --config vite.sync.config.ts && ' +
          `npx vite preview --config vite.sync.config.ts --port ${port} --strictPort`,
        port,
        reuseExistingServer: false,
        timeout: 240_000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          VITE_SUPABASE_URL: environment.supabaseUrl,
          VITE_SUPABASE_ANON_KEY: environment.anonKey,
          VITE_POWERSYNC_URL: environment.powerSyncUrl,
          VITE_POWERSYNC_ENABLED: 'true',
          VITE_FUNCTIONS_PROXY_TARGET: environment.supabaseUrl,
          VITE_AUTH_PROXY_TARGET: `${environment.supabaseUrl}/functions/v1`,
          VITE_LOGIN_ENDPOINT: '/api/auth/login',
          VITE_REFRESH_ENDPOINT: '/api/auth/refresh',
          VITE_LOGOUT_ENDPOINT: '/api/auth/logout',
          VITE_BETA_ALLOWED_EMAILS: '',
        },
      }
    : undefined,
});
