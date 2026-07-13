// SPDX-License-Identifier: BUSL-1.1

/**
 * Live full-stack (edge) skeleton for the aggregator Bank Connections path.
 *
 * This is the opt-in, live counterpart to the stubbed
 * e2e/bank-connections.spec.ts. It is intended to exercise the genuinely-wired
 * consolidated-aggregator read path (epic #3846):
 *
 *   /bank-connections
 *     -> useBankConnections reads the PowerSync-synced mirror tables
 *        (bank_connection, bank_connection_health, aggregator_provider)
 *     -> "View History" calls the real `aggregator-health` edge function
 *        (GET ?action=health_history) through the Vite functions proxy
 *     -> connection-health / provider-status render live data
 *
 * WHY IT IS SKIPPED BY DEFAULT
 * ----------------------------
 * The aggregator edge functions (`aggregator-health`, `bank-connection`) are
 * NOT yet wired into the local Supabase stack, and there is no seed path that
 * populates the synced bank-connection mirror tables for a freshly-signed-up
 * user. Running the assertions below today would fail on an empty dashboard,
 * which is noise rather than signal. The whole describe block is therefore
 * gated behind the LIVE_AGGREGATOR env flag and skipped unless it is set.
 *
 * ENABLING (once the aggregator stack + seed land — tracked follow-up):
 *   1. Wire aggregator-health + bank-connection into services/api local stack.
 *   2. Seed at least one bank_connection + aggregator_provider row for the
 *      test household (or drive a sandbox Plaid link).
 *   3. Run:  LIVE_AGGREGATOR=1 npm run test:e2e:live -w apps/web
 *
 * Runs under playwright.live.config.ts (testDir ./e2e-live) against a REAL
 * local edge backend — see docs/guides/full-stack-local.md and
 * e2e-live/full-stack-smoke.spec.ts for the real-signup pattern this mirrors.
 *
 * References: #3861, #3846, #3852, #1577
 */

import { expect, test } from '@playwright/test';

// Gate: only run when the aggregator stack + seed are explicitly available.
// Default (unset) => the entire block is skipped, so the live smoke stays green
// without the aggregator backend.
const LIVE_AGGREGATOR_ENABLED = Boolean(process.env.LIVE_AGGREGATOR);

// Comfortably above the client-side 12-character minimum, with mixed character
// classes so it also clears any server-side strength policy (mirrors
// full-stack-smoke.spec.ts).
const PASSWORD = 'LocalEdgeE2e!2026';

test.describe('Live aggregator Bank Connections', () => {
  test.skip(
    !LIVE_AGGREGATOR_ENABLED,
    'Set LIVE_AGGREGATOR=1 after wiring the aggregator edge functions + seed ' +
      'into the local stack (see file header). Skipped by default so the live ' +
      'smoke passes without the aggregator backend.',
  );

  test('reaches the aggregator health dashboard through the real edge path', async ({ page }) => {
    // Real signup (no __PLAYWRIGHT_E2E__ flag, no mocked network) — same
    // real-edge auth bootstrap as full-stack-smoke.spec.ts. We only pre-seed
    // the first-run consent + onboarding keys so the GDPR overlay does not
    // intercept clicks.
    const email = `e2e-bank+${Date.now()}@local.test`;

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

    // Proof the app is wired to a real backend, not demo mode.
    await expect(
      page.getByText(/Demo Mode/i),
      'App is in demo mode. Start the local stack and write apps/web/.env.local ' +
        '(npm --prefix services/api run setup:windows) before running the live e2e.',
    ).toHaveCount(0);

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm Password').fill(PASSWORD);

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

    // Leave the auth wall (household provisioning may route to /onboarding).
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 60_000 })
      .not.toMatch(/\/(login|signup)$/);

    // Navigate to the Bank Connections dashboard.
    await page.goto('/bank-connections');
    await expect(page.getByRole('heading', { name: /bank connections/i, level: 1 })).toBeVisible();

    // Arm a waiter for the real aggregator-health round-trip. "View History"
    // on a connection card calls GET /functions/v1/aggregator-health
    // ?action=health_history through the Vite functions proxy.
    const healthResponse = page.waitForResponse(
      (response) =>
        response.url().includes('aggregator-health') &&
        response.url().includes('action=health_history'),
      { timeout: 60_000 },
    );

    // A seeded connection renders a card with a "History" action.
    const historyButton = page.getByRole('button', { name: /view health history/i }).first();
    await expect(
      historyButton,
      'No seeded bank connection found. Seed a bank_connection + aggregator_provider ' +
        'row for the test household before enabling LIVE_AGGREGATOR (see file header).',
    ).toBeVisible();
    await historyButton.click();

    const health = await healthResponse;
    expect(
      health.ok(),
      `aggregator-health did not succeed: ${health.status()} ${health.statusText()}`,
    ).toBeTruthy();
  });
});
