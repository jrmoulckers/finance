// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared first-run seeding for E2E specs that use the raw Playwright `test`
 * (i.e. NOT the `authenticatedPage` fixture from `./fixtures.ts`).
 *
 * The production build gates the UI behind two first-run experiences:
 *   1. A GDPR privacy/consent dialog (fixed overlay) that intercepts clicks
 *      until the visitor records a consent choice.
 *   2. An onboarding wizard that authenticated users are redirected into until
 *      they complete it.
 *
 * Specs that exercise the unauthenticated/raw pages (login, signup, visual
 * baselines) must pre-seed past the consent gate so the page chrome renders.
 * We also set the Playwright E2E flag so `DatabaseProvider` skips real
 * SQLite-WASM init (the WASM binaries aren't in the static build output).
 */

import type { Page } from '@playwright/test';

/** Pre-seed first-run state via init scripts. Call before any navigation. */
export async function seedFirstRunState(page: Page): Promise<void> {
  // Mark the page as an E2E environment so the DB provider uses its stub.
  await page.addInitScript(() => {
    (window as unknown as { __PLAYWRIGHT_E2E__: boolean }).__PLAYWRIGHT_E2E__ = true;
  });

  // Record GDPR consent + completed onboarding so neither first-run gate blocks
  // the UI. Keys mirror lib/local-only-mode and the ConsentDialog storage.
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
}
