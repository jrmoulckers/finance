import { expect, test } from '@playwright/test';

// ---------------------------------------------------------------------------
// Local-first / demo-mode smoke coverage (required PR merge gate).
//
// The CI preview build has no real backend (dummy Supabase env) and the
// auth-refresh endpoint is stubbed to 401, so the app boots in its
// unauthenticated, local-first configuration: every route resolves to the
// login experience behind a first-run privacy/consent gate.
//
// These smokes therefore verify that the production build BOOTS and renders
// interactive content on the critical routes — catching white-screens, fatal
// mount errors, and build breakages — rather than asserting backend-gated
// auth/app-shell flows that cannot apply without a backend. Those are covered
// by the full E2E suites against environments that provide a backend.
// ---------------------------------------------------------------------------

const ROUTES = ['/', '/dashboard', '/login'] as const;

// Any of these being visible proves React mounted and hydrated interactive UI
// (consent-gate buttons, login form, or app heading) rather than white-screening.
const INTERACTIVE = 'button, [role="button"], a[href], input, h1, h2';

test.describe('PR smoke coverage (local-first boot)', () => {
  for (const route of ROUTES) {
    test(`${route} boots without a white screen`, async ({ page }) => {
      await page.goto(route);

      // The SPA root must contain rendered content (no fatal mount error).
      const root = page.locator('#root');
      await expect(root).not.toBeEmpty();
      await expect(root.locator(':scope > *')).not.toHaveCount(0);

      // And it must render interactive chrome, proving hydration succeeded.
      await expect(page.locator(INTERACTIVE).first()).toBeVisible();
    });
  }
});
