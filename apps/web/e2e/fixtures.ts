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
 * Since there is no real backend in E2E tests, we mock all auth endpoints
 * and drive the login form to let React context pick up the auth state.
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

const TEST_PASSWORD = 'password123';

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
 * In addition to auth endpoints, we mock the sync push endpoint and a
 * catch-all for any other `/api/` path.  This prevents unhandled requests
 * from hitting the Vite dev server (which has no backend) and hanging or
 * returning HTML error pages that break JSON parsing.
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

  // Mock the token refresh endpoint — return 401 (no existing session).
  // AuthProvider calls tryRestoreSession() on mount which hits this endpoint.
  // Returning 200 would auto-authenticate the user before the login form
  // renders, causing the form-based login flow to be skipped entirely
  // (the LoginPage redirects to /dashboard when already authenticated).
  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'No session' }),
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

  // Mock Supabase Edge Function sync endpoint (used when a real Supabase
  // project URL is configured via VITE_SUPABASE_URL).
  await page.route('**/functions/v1/sync-push', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ acknowledged: [], conflicts: [] }),
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
 * Perform a full login flow through the UI.
 *
 * Navigates to `/login`, fills the email and password fields, and submits
 * the form. The mocked endpoints (installed via `installAuthMocks`) ensure
 * that the React auth context receives valid tokens and user data.
 */
async function loginViaForm(page: Page): Promise<void> {
  await page.goto('/login');

  // Wait for the login form to be fully rendered.
  const emailInput = page.getByLabel(/email/i);
  await emailInput.waitFor({ state: 'visible', timeout: 60_000 });

  await emailInput.fill(TEST_USER.email);
  await page.getByLabel(/password/i).fill(TEST_PASSWORD);

  // Submit the form via the Sign in button.
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for navigation away from the login page (redirect to /dashboard).
  await page.waitForURL('**/dashboard', { timeout: 10_000 });
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
    // 1. Install route mocks before any navigation.
    await installAuthMocks(page);

    // 2. Drive the login flow through the real UI.
    await loginViaForm(page);

    // 3. Hand the authenticated page to the test.
    await use(page);
  },
});

export { expect };
