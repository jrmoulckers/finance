import { defineConfig } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  // Allow 60 seconds per test — with the E2E stub DB (bypassing real
  // SQLite-WASM init), page rendering is fast.  The 60 s limit provides
  // headroom for Vite preview startup + React mount + auth restore.
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
    // CI already builds the app before running E2E tests, so use `vite
    // preview` which serves the pre-built dist/ and starts near-instantly.
    // Locally, use `vite` (dev server) for the HMR workflow.
    command: isCI ? 'npx vite preview --port 5173' : 'npx vite --port 5173',
    port: 5173,
    // On CI there is no existing server — always start a fresh one.
    // Locally, reuse a server the developer may already have running.
    reuseExistingServer: !isCI,
    // Cold starts on CI runners can exceed 60s. Give plenty of headroom.
    timeout: 120_000,
    // Pipe server output so CI logs show startup errors.
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
