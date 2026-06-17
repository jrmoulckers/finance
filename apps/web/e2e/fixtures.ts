// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared Playwright E2E test fixtures.
 *
 * Provides an `authenticatedPage` fixture that bypasses authentication for
 * E2E tests by intercepting API endpoints and injecting auth state.
 *
 * The Finance app uses:
 *   - `/api/auth/login`   — email/password login (POST)
 *   - `/api/auth/refresh` — token refresh via HttpOnly cookie (POST)
 *   - `/api/auth/logout`  — session teardown (POST)
 *
 * Since there is no real backend in E2E tests, we mock all auth endpoints.
 * The refresh mock returns a valid session, so AuthProvider auto-authenticates
 * the user on every page load — no login form interaction required.
 */

import { test as base, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TEST_USER = {
  id: 'e2e-test-user-id',
  email: 'test@example.com',
  has_passkey: false,
} as const;

/**
 * A minimal valid JWT with an `exp` claim 1 hour in the future.
 *
 * Structure: header.payload.signature
 * The payload is `{ "sub": "<id>", "email": "<email>", "exp": <epoch+1h> }`.
 * We generate it dynamically so the `exp` claim is always in the future.
 */
function createFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const payload = btoa(
    JSON.stringify({
      sub: TEST_USER.id,
      email: TEST_USER.email,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    }),
  )
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const signature = btoa('e2e-fake-signature')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${header}.${payload}.${signature}`;
}

// ---------------------------------------------------------------------------
// Auth mock helpers
// ---------------------------------------------------------------------------

/**
 * Install route handlers that mock all API endpoints the app may call.
 *
 * This must be called BEFORE any navigation so that the initial session
 * restore attempt (refresh endpoint) also gets intercepted.
 *
 * The refresh endpoint ALWAYS returns a valid session — this means
 * AuthProvider's tryRestoreSession() will auto-authenticate the user on
 * every page load.  Tests no longer need to drive the login form; the
 * authenticated state is established purely via mocked API responses.
 *
 * In addition to auth endpoints, we mock the sync push endpoint and a
 * catch-all for any other `/api/` path.  This prevents unhandled requests
 * from hitting the Vite preview server (which has no backend) and hanging
 * or returning HTML error pages that break JSON parsing.
 */
async function installAuthMocks(page: Page): Promise<void> {
  // Catch-all for any /api/ path not explicitly mocked below.
  // Route handlers are matched LIFO, so specific handlers registered after
  // this one take priority.  This prevents unmocked requests from reaching
  // the Vite dev server (which has no backend) and returning HTML responses
  // that break JSON parsing in the app.
  await page.route('**/api/**', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not found (E2E catch-all)' }),
    });
  });

  // Mock the login endpoint — returns a fake access token and user object.
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: createFakeJwt(),
        user: TEST_USER,
      }),
    });
  });

  // Mock the token refresh endpoint — ALWAYS return a valid session.
  //
  // AuthProvider calls tryRestoreSession() on every mount (including after
  // full-page navigations triggered by page.goto() in tests).  By always
  // returning 200 with valid credentials, the user is auto-authenticated
  // on every page load — no login form interaction required.
  //
  // This mirrors production behaviour where an HttpOnly refresh cookie
  // persists across navigations and the refresh endpoint validates it.
  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: createFakeJwt(),
        user: TEST_USER,
      }),
    });
  });

  // Mock the logout endpoint — always succeed.
  await page.route('**/api/auth/logout', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  // Mock the sync push endpoint — the offline mutation replay system may
  // attempt to push queued mutations.  Return an empty acknowledged list.
  await page.route('**/api/sync/push', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ acknowledged: [], conflicts: [] }),
    });
  });

  // Mock Supabase Edge Function sync endpoints (used when a real Supabase
  // project URL is configured via VITE_SUPABASE_URL).
  await page.route('**/functions/v1/sync-push', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ acknowledged: [], conflicts: [] }),
    });
  });

  await page.route('**/functions/v1/sync-pull', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ changes: [], cursor: '0', hasMore: false }),
    });
  });

  // Mock Supabase passkey endpoints so they don't cause network errors.
  await page.route('**/functions/v1/passkey-*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

/**
 * Navigate to an authenticated page and wait for the app to be ready.
 *
 * With the refresh endpoint mocked to return 200, AuthProvider's
 * tryRestoreSession() auto-authenticates the user on every page load.
 * We navigate to /dashboard (the post-login landing page) and wait for
 * evidence that the authenticated shell has rendered.
 */
async function waitForAuthenticatedApp(page: Page): Promise<void> {
  const response = await page.goto('/dashboard');
  if (!response || response.status() >= 400) {
    throw new Error(
      `App not serving — /dashboard returned ${response?.status() ?? 'no response'}. ` +
        'Is the Vite server ready?',
    );
  }

  // Wait for the DOM to be fully parsed.
  await page.waitForLoadState('domcontentloaded');

  // Wait for the authenticated shell to claim the dashboard route. Some
  // pages render a route-level skeleton before data arrives, so use the main
  // landmark / nav chrome instead of a page-specific heading.
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
  await Promise.any([
    page.getByRole('main', { name: /dashboard/i }).waitFor({ state: 'visible', timeout: 30_000 }),
    page
      .locator('aside[aria-label="Main navigation"]')
      .waitFor({ state: 'visible', timeout: 30_000 }),
    page.locator('nav.bottom-nav').waitFor({ state: 'visible', timeout: 30_000 }),
  ]);
}

// ---------------------------------------------------------------------------
// Custom fixtures
// ---------------------------------------------------------------------------

/**
 * Extended Playwright `test` object that provides an `authenticatedPage`
 * fixture — a `Page` instance that has already logged in via mocked auth
 * and is ready to navigate authenticated routes.
 */
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    // 0. Mark the page as an E2E test environment so DatabaseProvider
    //    skips real SQLite-WASM init (WASM binaries aren't in the static
    //    build output and would cause initDatabase() to hang).
    await page.addInitScript(() => {
      window.__PLAYWRIGHT_E2E__ = true;
    });

    // 0b. Pre-set GDPR consent in localStorage so the ConsentDialog
    //     doesn't block the UI.  The consent dialog renders a fixed
    //     overlay (z-index 9999) that intercepts all clicks — without
    //     this, every test that interacts with the app will timeout.
    await page.addInitScript((testUserEmail) => {
      const consentRecord = {
        categories: {
          essential: true,
          analytics: false,
          error_reporting: false,
          sync: false,
          marketing: false,
        },
        timestamp: new Date().toISOString(),
        policyVersion: '1.0.0',
        method: 'first_run',
        hasCompletedFirstRun: true,
      };
      localStorage.setItem('finance-gdpr-consent', JSON.stringify(consentRecord));

      // Local dev runs without Supabase configured, which activates demo auth
      // instead of the mocked refresh endpoint. Seed a demo session so the
      // authenticated fixture stays authenticated after page.goto() calls.
      localStorage.setItem('finance_demo_session', testUserEmail);
    }, TEST_USER.email);

    // 1. Install route mocks before any navigation.
    //    The refresh mock returns 200 — AuthProvider auto-authenticates.
    await installAuthMocks(page);

    // 2. Navigate to the dashboard and wait for the app to be ready.
    await waitForAuthenticatedApp(page);

    // 3. Hand the authenticated page to the test.
    await use(page);
  },
});

export { expect };
