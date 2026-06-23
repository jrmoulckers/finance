// SPDX-License-Identifier: BUSL-1.1

/**
 * Live full-stack (edge) smoke test.
 *
 * Drives a REAL signup through the local Supabase edge auth stack:
 *
 *   /signup form
 *     -> POST /api/auth/signup   (Vite-proxied to
 *        http://127.0.0.1:54321/functions/v1/auth-signup)
 *     -> GoTrue + Postgres/RLS
 *     -> POST /api/auth/login    (auto-login to establish the session)
 *     -> authenticated app shell
 *
 * This is the genuinely-wired edge path documented in
 * docs/guides/full-stack-local.md. Data CRUD remains local SQLite-WASM;
 * server-side data sync (PowerSync) is out of scope and not exercised here.
 *
 * Requires the local stack + apps/web/.env.local (written by
 * `npm --prefix services/api run setup:windows`). Without them the app runs in
 * demo mode and this test fails fast on the "Demo Mode banner must be absent"
 * assertion below — a clear, actionable signal rather than a confusing timeout.
 */

import { expect, test } from '@playwright/test';

// Comfortably above the client-side 12-character minimum, with mixed character
// classes so it also clears any server-side strength policy.
const PASSWORD = 'LocalEdgeE2e!2026';

test.describe('Live full-stack (edge) auth', () => {
  test('signs up through real edge auth and reaches the authenticated app', async ({ page }) => {
    // Unique per run so repeated runs never collide on "email already registered".
    const email = `e2e+${Date.now()}@local.test`;

    // Seed past the first-run GDPR consent overlay — a fixed z-index:9999 dialog
    // that intercepts every click until consent is recorded, which otherwise
    // makes the signup form unreachable. We deliberately do NOT set
    // __PLAYWRIGHT_E2E__ here (unlike e2e/first-run-state.ts): that flag switches
    // the app to its stub DB / demo auth and would defeat this test's real-edge
    // purpose. We only pre-seed the consent + onboarding keys.
    await page.addInitScript(() => {
      localStorage.setItem(
        'finance-gdpr-consent',
        JSON.stringify({
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
        }),
      );
      localStorage.setItem('finance-onboarding-complete', 'true');
    });

    await page.goto('/signup');

    // Proof the app is wired to a real backend, not demo mode. The signup page
    // renders a visible "Demo Mode" banner whenever VITE_SUPABASE_URL is unset
    // or contains "placeholder". Its absence is our real-vs-demo signal.
    await expect(
      page.getByText(/Demo Mode/i),
      'App is in demo mode. Start the local stack and write apps/web/.env.local ' +
        '(npm --prefix services/api run setup:windows) before running the live e2e.',
    ).toHaveCount(0);

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm Password').fill(PASSWORD);

    // Arm the response waiter BEFORE submitting. signupWithEmail() POSTs to
    // /api/auth/signup (then /api/auth/login) — capturing the signup response
    // proves the request reached the real edge function and round-tripped.
    const signupResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/auth/signup') && response.request().method() === 'POST',
      { timeout: 60_000 },
    );

    await page.getByRole('button', { name: 'Sign up' }).click();

    const signup = await signupResponse;
    expect(
      signup.ok(),
      `Edge signup did not succeed: ${signup.status()} ${signup.statusText()}`,
    ).toBeTruthy();

    // With email confirmations disabled (config.toml: enable_confirmations =
    // false), signup auto-logs in and the app leaves the auth wall. Household
    // provisioning may route first-run users to /onboarding instead of
    // /dashboard; either proves the authenticated shell rendered via real edge
    // auth. Poll the pathname so a brief intermediate render doesn't flake.
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 60_000 })
      .not.toMatch(/\/(login|signup)$/);
  });
});
