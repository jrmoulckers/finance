// SPDX-License-Identifier: BUSL-1.1

/**
 * Navigation reachability — verifies every destination in the primary
 * nav config (`apps/web/src/components/layout/navConfig.tsx`) is
 * reachable at both 375px (mobile) and 1280px (desktop) viewports.
 *
 * This is the regression guard for #1930: on narrow viewports the old
 * bottom tab bar dropped most destinations and there was no overflow
 * affordance, leaving 10+ routes unreachable.
 *
 * The test does not assert that pages load correctly (other suites do
 * that); it only asserts that the navigation chrome links to each route
 * and that activating each link navigates the SPA there.
 */

import { type Page } from '@playwright/test';

import { test, expect } from './fixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape a string for use inside a RegExp. We can't rely on the input
 * being free of regex metacharacters (CodeQL js/incomplete-sanitization
 * specifically flags partial escapes like `.replace(/\//g, '\\/')`).
 */
const escapeRegex = (input: string): string => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hrefRegex = (href: string): RegExp => new RegExp(escapeRegex(href));

// ---------------------------------------------------------------------------
// Destinations under test
// ---------------------------------------------------------------------------

/**
 * Mirror of `NAV_CONFIG` from `apps/web/src/components/layout/navConfig.tsx`.
 *
 * We keep a shadow list here (rather than importing from the source) so
 * the test breaks loudly when a new destination is added to the nav but
 * the e2e coverage is forgotten — and so the test does not depend on
 * the app's TypeScript build.
 */
const NAV_DESTINATIONS = [
  // pinned
  { label: 'Dashboard', href: '/dashboard', priority: 0 },
  // Money
  { label: 'Accounts', href: '/accounts', priority: 1 },
  { label: 'Transactions', href: '/transactions', priority: 2 },
  { label: 'Bills', href: '/bills', priority: 10 },
  { label: 'Investments', href: '/investments', priority: 11 },
  { label: 'Subscriptions', href: '/subscriptions', priority: 12 },
  // Plan
  { label: 'Budgets', href: '/budgets', priority: 3 },
  { label: 'Goals', href: '/goals', priority: 13 },
  { label: 'Planning', href: '/planning', priority: 14 },
  { label: 'Categories', href: '/categories', priority: 15 },
  // Insights
  { label: 'Insights', href: '/insights', priority: 20 },
  { label: 'Cash Flow', href: '/cash-flow', priority: 21 },
  { label: 'Net Worth', href: '/net-worth', priority: 22 },
  { label: 'Reports', href: '/report-builder', priority: 23 },
  { label: 'Achievements', href: '/achievements', priority: 24 },
  { label: 'Watchlists', href: '/watchlists', priority: 25 },
  // Connect
  { label: 'Household', href: '/household', priority: 30 },
  { label: 'Bank Connections', href: '/bank-connections', priority: 31 },
  { label: 'Import Data', href: '/import', priority: 32 },
  { label: 'Privacy', href: '/privacy-dashboard', priority: 33 },
] as const;

/** How many priority items fit on the mobile bottom-nav (rest = "More"). */
const BOTTOM_NAV_SLOTS = 4;

const MOBILE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForAppShell(page: Page): Promise<void> {
  await page
    .getByRole('status', { name: /loading/i })
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {
      // Loading indicator may have already disappeared — fine.
    });
}

/**
 * Sorted by mobilePriority, the first 4 are the bottom-nav priority
 * destinations; the rest must be reachable via the "More" sheet.
 */
function priorityDestinations(): readonly { label: string; href: string }[] {
  return [...NAV_DESTINATIONS].sort((a, b) => a.priority - b.priority).slice(0, BOTTOM_NAV_SLOTS);
}

function moreSheetDestinations(): readonly { label: string; href: string }[] {
  const priority = new Set(priorityDestinations().map((d) => d.href));
  return NAV_DESTINATIONS.filter((d) => !priority.has(d.href));
}

// ═══════════════════════════════════════════════════════════════════════════
// Desktop reachability (1280 × 800)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Desktop navigation reachability (#1930)', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.setViewportSize(DESKTOP);
  });

  for (const dest of NAV_DESTINATIONS) {
    test(`sidebar can navigate to ${dest.label} (${dest.href})`, async ({
      authenticatedPage: page,
    }) => {
      await page.goto('/dashboard');
      await waitForAppShell(page);

      const sidebar = page.locator('aside[aria-label="Main navigation"]');
      await expect(sidebar).toBeVisible();

      // Expand all collapsible group sections so every destination is queryable.
      // Section toggles have accessible names like "Money section".
      for (const groupLabel of ['Money', 'Plan', 'Insights', 'Connect']) {
        const toggle = sidebar.getByRole('button', { name: `${groupLabel} section` });
        if (await toggle.count()) {
          const expanded = await toggle.getAttribute('aria-expanded');
          if (expanded === 'false') {
            await toggle.click();
          }
        }
      }

      const link = sidebar.getByRole('button', { name: dest.label, exact: true });
      await expect(link).toBeVisible();
      await link.click();

      // The SPA navigates client-side; the URL must reflect the destination.
      await expect(page).toHaveURL(hrefRegex(dest.href));
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Mobile reachability (375 × 812)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Mobile navigation reachability (#1930)', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.setViewportSize(MOBILE);
  });

  // Each top-priority destination is on the bottom tab bar directly.
  for (const dest of priorityDestinations()) {
    test(`bottom-nav can navigate to ${dest.label}`, async ({ authenticatedPage: page }) => {
      await page.goto('/dashboard');
      await waitForAppShell(page);

      const bottomNav = page.locator('nav.bottom-nav');
      await expect(bottomNav).toBeVisible();

      const tab = bottomNav.getByRole('button', { name: dest.label, exact: true });
      await expect(tab).toBeVisible();
      await tab.click();

      await expect(page).toHaveURL(hrefRegex(dest.href));
    });
  }

  // Every non-priority destination must be reachable via the More sheet.
  for (const dest of moreSheetDestinations()) {
    test(`More sheet can navigate to ${dest.label}`, async ({ authenticatedPage: page }) => {
      await page.goto('/dashboard');
      await waitForAppShell(page);

      const bottomNav = page.locator('nav.bottom-nav');
      const moreButton = bottomNav.getByRole('button', { name: 'More destinations' });
      await expect(moreButton).toBeVisible();
      await moreButton.click();

      const sheet = page.getByRole('dialog');
      await expect(sheet).toBeVisible();

      const link = sheet.getByRole('button', { name: dest.label, exact: true });
      await expect(link).toBeVisible();
      await link.click();

      // Sheet closes and the SPA navigates.
      await expect(sheet).toBeHidden();
      await expect(page).toHaveURL(hrefRegex(dest.href));
    });
  }

  test('More sheet closes when Escape is pressed', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await waitForAppShell(page);

    await page.locator('nav.bottom-nav').getByRole('button', { name: 'More destinations' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('Settings is reachable from the More sheet', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await waitForAppShell(page);

    await page.locator('nav.bottom-nav').getByRole('button', { name: 'More destinations' }).click();

    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Settings', exact: true }).click();

    await expect(page).toHaveURL(/\/settings/);
  });
});
