// SPDX-License-Identifier: BUSL-1.1

/**
 * E2E regression test for #1966 — "Page reload signs the user out".
 *
 * Uses the existing `authenticatedPage` fixture which mocks the
 * `/api/auth/refresh` endpoint to always return a valid session (the
 * production cookie-based flow is equivalent: an HttpOnly refresh cookie
 * persists across reloads and the backend rotates it on each call).
 *
 * Asserts that:
 *   1. After landing on `/dashboard` the user is authenticated (the
 *      fixture proves this).
 *   2. After F5 / `page.reload()` the user STAYS on `/dashboard` rather
 *      than being redirected to `/login`.
 *   3. Deep links survive reload — `/accounts` reloaded stays on
 *      `/accounts`.
 */

import { expect, test } from './fixtures';

test('session persists across page reload (#1966)', async ({ authenticatedPage }) => {
  // Sanity-check: the fixture landed us on /dashboard.
  await expect(authenticatedPage).toHaveURL(/\/dashboard$/);

  // Reload — the AuthProvider must restore the session via the (mocked)
  // refresh endpoint and the route guard must NOT redirect to /login.
  await authenticatedPage.reload();

  await expect(authenticatedPage).toHaveURL(/\/dashboard$/);
  // Login form should not be present anywhere after restore.
  await expect(authenticatedPage.getByRole('button', { name: /sign in/i })).toHaveCount(0);
});

test('session persists across deep-link reload (#1966)', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/accounts');
  await expect(authenticatedPage).toHaveURL(/\/accounts$/);

  await authenticatedPage.reload();

  await expect(authenticatedPage).toHaveURL(/\/accounts$/);
});
