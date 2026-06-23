import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the LIVE full-stack (edge) smoke test.
 *
 * Unlike playwright.config.ts — which runs the ./e2e suite against a stub DB
 * with fully mocked auth — this config drives the app against a REAL local
 * Supabase edge backend (GoTrue auth + the auth-* edge functions + Postgres/RLS).
 * It deliberately does NOT set window.__PLAYWRIGHT_E2E__ and does NOT mock any
 * network call, so the signup flow exercises the genuinely-wired edge path.
 *
 * Prerequisites (see docs/guides/full-stack-local.md):
 *   1. Start the local stack, which also writes apps/web/.env.local pointing the
 *      web app at it:
 *        npm --prefix services/api run setup:windows   (Windows)
 *        npm --prefix services/api run setup            (macOS / Linux)
 *   2. Run the live smoke:
 *        npm run test:e2e:live -w apps/web
 *
 * The webServer below runs `vite`, which auto-loads apps/web/.env.local, so the
 * app leaves demo mode and talks to the local edge stack. If .env.local is
 * missing the app stays in demo mode and the smoke spec fails fast with a clear
 * message (it asserts the "Demo Mode" banner is absent).
 */

const PORT = Number(process.env.LIVE_E2E_PORT ?? 5174);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e-live',

  // Real backend round-trips (signup -> GoTrue -> Postgres -> auto-login) are
  // slower than the stubbed suite, so give generous headroom.
  timeout: 120_000,
  expect: { timeout: 30_000 },

  // The live suite mutates a shared local database, so run it serially for
  // deterministic state. No retries: a real failure here is signal, not flake.
  fullyParallel: false,
  workers: 1,
  retries: 0,

  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-live' }]],

  projects: [
    // Default to the real Microsoft Edge channel to honour "test on edge".
    { name: 'chromium-edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    // Fallback for environments without msedge installed: --project=chromium.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  use: {
    baseURL,
    headless: true,
    actionTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // The app reaches the backend same-origin through the Vite dev proxy, so a
    // service worker would intercept those requests. Block it for determinism.
    serviceWorkers: 'block',
  },

  webServer: {
    // A dedicated port (default 5174) avoids colliding with a dev server the
    // developer may already have running on 5173. --strictPort fails fast rather
    // than silently picking another port the baseURL wouldn't match.
    command: `npx vite --port ${PORT} --strictPort`,
    port: PORT,
    // Always start a fresh server so .env.local is freshly loaded.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      // Where the Vite proxy forwards /api/auth/* and /functions/v1/*. Matches
      // the Supabase CLI gateway. apps/web/.env.local (auto-loaded by Vite)
      // supplies VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.
      VITE_FUNCTIONS_PROXY_TARGET:
        process.env.VITE_FUNCTIONS_PROXY_TARGET ?? 'http://127.0.0.1:54321',
    },
  },
});
