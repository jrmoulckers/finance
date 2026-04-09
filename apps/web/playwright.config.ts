import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Allow 60 seconds per test — CI runners with cold Vite dev server +
  // SQLite-WASM initialization can exceed the 30-second default.
  timeout: 60_000,
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,

    // Block service workers so they don't intercept network requests.
    // Playwright's page.route() does NOT intercept requests handled by
    // a service worker, which causes E2E auth mocks to be bypassed once
    // the SW installs and claims the page via clients.claim().
    // Service worker behaviour is validated separately in unit tests.
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
