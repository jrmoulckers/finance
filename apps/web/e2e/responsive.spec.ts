// SPDX-License-Identifier: BUSL-1.1

/**
 * Responsive layout E2E tests.
 *
 * Verifies that the Finance app's layout adapts correctly across viewport
 * breakpoints defined in `src/styles/responsive.css`:
 *
 *   - Mobile  (< 640px):  bottom nav visible, sidebar hidden, single-column grid
 *   - Tablet  (640px+):   multi-column dashboard charts
 *   - Desktop (768px+):   sidebar nav visible, bottom nav hidden, multi-column cards
 *   - Large   (1200px+):  wider sidebar (280px)
 *
 * Each test sets the viewport size, navigates to a page, and asserts on
 * element visibility or computed CSS properties.
 *
 * Uses the `authenticatedPage` fixture to bypass login.
 */

import { test, expect } from './fixtures';

// ---------------------------------------------------------------------------
// Viewport presets
// ---------------------------------------------------------------------------

/** iPhone 13 / 14 — typical narrow mobile viewport. */
const MOBILE = { width: 375, height: 812 };

/** iPad portrait — tablet breakpoint (≥ 640px). */
const TABLET = { width: 768, height: 1024 };

/** Standard laptop — desktop breakpoint (≥ 768px). */
const DESKTOP = { width: 1280, height: 800 };

/** Large desktop / external monitor — wide breakpoint (≥ 1200px). */
const LARGE_DESKTOP = { width: 1440, height: 900 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the loading spinner to disappear so layout assertions are stable.
 */
async function waitForPageLoad(page: import('@playwright/test').Page): Promise<void> {
  await page
    .getByRole('status', { name: /loading/i })
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {
      // Loading indicator may have already disappeared — that's fine.
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// Mobile viewport (375 × 812)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Mobile viewport (375px)', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.setViewportSize(MOBILE);
  });

  test('bottom navigation is visible', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const bottomNav = page.locator('nav.bottom-nav');
    await expect(bottomNav).toBeVisible();

    // Verify the bottom nav is fixed at the bottom of the viewport.
    const position = await bottomNav.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        position: style.position,
        bottom: style.bottom,
      };
    });
    expect(position.position).toBe('fixed');
    expect(position.bottom).toBe('0px');
  });

  test('sidebar navigation is hidden', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const sidebar = page.locator('aside[aria-label="Main navigation"]');
    await expect(sidebar).toBeHidden();
  });

  test('app header is visible', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const header = page.locator('header.app-header');
    await expect(header).toBeVisible();
  });

  test('dashboard cards stack in a single column', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    // The card grid might not exist if there's no dashboard data (empty state).
    const cardGrid = page.locator('.card-grid').first();
    const isGridVisible = await cardGrid.isVisible().catch(() => false);

    if (isGridVisible) {
      const columns = await cardGrid.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return style.gridTemplateColumns;
      });

      // Single column: the computed value should be a single track value
      // (e.g. "337px" or similar single-value), not multiple tracks.
      const trackCount = columns.split(/\s+/).filter((v) => v.length > 0).length;
      expect(trackCount).toBe(1);
    }
  });

  test('page content takes full width', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const main = page.locator('main.app-main');
    await expect(main).toBeVisible();

    const { mainWidth, viewportWidth } = await main.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return {
        mainWidth: rect.width,
        viewportWidth: window.innerWidth,
      };
    });

    // Main content should span the full viewport width (minus padding).
    // Allow some tolerance for padding (layout-content-padding).
    expect(mainWidth).toBeGreaterThan(viewportWidth * 0.85);
  });

  test('bottom navigation contains all nav items', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const bottomNav = page.locator('nav.bottom-nav');
    const navButtons = bottomNav.getByRole('button');

    // Expect the 5 nav items: Dashboard, Accounts, Transactions, Budgets, Goals
    await expect(navButtons).toHaveCount(5);
  });

  test('form dialog is full-screen on small mobile', async ({ authenticatedPage: page }) => {
    // Use a sub-480px viewport to trigger the full-screen form media query.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/transactions');
    await waitForPageLoad(page);

    // Open the "Add Transaction" form dialog.
    await page.getByRole('button', { name: /add.*transaction/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const panel = page.locator('.form-dialog__panel');
    const panelStyle = await panel.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        maxWidth: style.maxWidth,
        borderRadius: style.borderRadius,
      };
    });

    // At ≤ 480px the form-dialog__panel should expand to 100% width
    // with 0 border-radius (full-screen style).
    expect(panelStyle.maxWidth).toBe('100%');
    expect(panelStyle.borderRadius).toBe('0px');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tablet viewport (768 × 1024)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Tablet viewport (768px)', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.setViewportSize(TABLET);
  });

  test('sidebar navigation appears', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const sidebar = page.locator('aside[aria-label="Main navigation"]');
    await expect(sidebar).toBeVisible();
  });

  test('bottom navigation is hidden', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const bottomNav = page.locator('nav.bottom-nav');
    await expect(bottomNav).toBeHidden();
  });

  test('app header is hidden at desktop breakpoint', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const header = page.locator('header.app-header');
    const display = await header.evaluate((el) => {
      return window.getComputedStyle(el).display;
    });
    expect(display).toBe('none');
  });

  test('app layout switches to row direction', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const layout = page.locator('.app-layout');
    const flexDirection = await layout.evaluate((el) => {
      return window.getComputedStyle(el).flexDirection;
    });
    expect(flexDirection).toBe('row');
  });

  test('dashboard card grid shows multiple columns', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const cardGrid = page.locator('.card-grid').first();
    const isGridVisible = await cardGrid.isVisible().catch(() => false);

    if (isGridVisible) {
      const columns = await cardGrid.evaluate((el) => {
        return window.getComputedStyle(el).gridTemplateColumns;
      });

      // At 768px+ the card-grid uses auto-fill with minmax(280px, 1fr),
      // or explicit 2/3 column layouts via card-grid--2/--3 modifiers.
      const trackCount = columns.split(/\s+/).filter((v) => v.length > 0).length;
      expect(trackCount).toBeGreaterThanOrEqual(2);
    }
  });

  test('sidebar contains all primary navigation items', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const sidebar = page.locator('aside[aria-label="Main navigation"]');

    for (const label of ['Dashboard', 'Accounts', 'Transactions', 'Budgets', 'Goals']) {
      const navItem = sidebar.getByRole('button', { name: label });
      await expect(navItem).toBeVisible();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Desktop viewport (1280 × 800)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Desktop viewport (1280px)', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.setViewportSize(DESKTOP);
  });

  test('sidebar navigation is visible with full labels', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const sidebar = page.locator('aside[aria-label="Main navigation"]');
    await expect(sidebar).toBeVisible();

    // The sidebar should show the "Finance" logo text.
    await expect(sidebar.locator('.app-sidebar__logo')).toHaveText('Finance');

    // All nav labels should be visible (not icon-only).
    for (const label of ['Dashboard', 'Accounts', 'Transactions', 'Budgets', 'Goals']) {
      await expect(sidebar.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('sidebar has correct width at large desktop', async ({ authenticatedPage: page }) => {
    // Switch to large desktop to test the wider sidebar (280px at ≥ 1200px).
    await page.setViewportSize(LARGE_DESKTOP);
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const sidebar = page.locator('aside[aria-label="Main navigation"]');
    const sidebarWidth = await sidebar.evaluate((el) => {
      return el.getBoundingClientRect().width;
    });

    // At ≥ 1200px, --layout-sidebar-width is 280px.
    expect(sidebarWidth).toBeCloseTo(280, -1);
  });

  test('content area has max-width constraint', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const main = page.locator('main.app-main');
    const maxWidth = await main.evaluate((el) => {
      return window.getComputedStyle(el).maxWidth;
    });

    // --layout-content-max-width is 1200px.
    expect(maxWidth).toBe('1200px');
  });

  test('dashboard chart grid shows 2+ columns', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const chartSection = page.locator('.dashboard-charts');
    const hasCharts = await chartSection.isVisible().catch(() => false);

    if (hasCharts) {
      const columns = await chartSection.evaluate((el) => {
        return window.getComputedStyle(el).gridTemplateColumns;
      });

      const trackCount = columns.split(/\s+/).filter((v) => v.length > 0).length;
      expect(trackCount).toBeGreaterThanOrEqual(2);
    }
  });

  test('bottom navigation is hidden', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const bottomNav = page.locator('nav.bottom-nav');
    await expect(bottomNav).toBeHidden();
  });

  test('form dialog renders as centered modal', async ({ authenticatedPage: page }) => {
    await page.goto('/transactions');
    await waitForPageLoad(page);

    await page.getByRole('button', { name: /add.*transaction/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const panel = page.locator('.form-dialog__panel');
    const panelStyle = await panel.evaluate((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        maxWidth: style.maxWidth,
        borderRadius: style.borderRadius,
        panelWidth: rect.width,
        viewportWidth: window.innerWidth,
      };
    });

    // At desktop, the panel should be constrained (max-width: 520px),
    // not full-screen, with border-radius applied.
    expect(panelStyle.maxWidth).toBe('520px');
    expect(panelStyle.panelWidth).toBeLessThan(panelStyle.viewportWidth * 0.8);
    expect(panelStyle.borderRadius).not.toBe('0px');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Large Desktop viewport (1440 × 900)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Large desktop viewport (1440px)', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.setViewportSize(LARGE_DESKTOP);
  });

  test('sidebar width increases to 280px', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const sidebar = page.locator('aside[aria-label="Main navigation"]');
    await expect(sidebar).toBeVisible();

    const sidebarWidth = await sidebar.evaluate((el) => {
      return el.getBoundingClientRect().width;
    });

    // At ≥ 1200px, --layout-sidebar-width is 280px.
    expect(sidebarWidth).toBeCloseTo(280, -1);
  });

  test('sidebar footer shows settings and shortcuts buttons', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const sidebar = page.locator('aside[aria-label="Main navigation"]');
    const footer = sidebar.locator('.app-sidebar__footer');

    await expect(footer.getByText('Settings')).toBeVisible();
    await expect(footer.getByText('Shortcuts')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Cross-viewport navigation
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Cross-viewport navigation', () => {
  test('bottom navigation links work on mobile', async ({ authenticatedPage: page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const bottomNav = page.locator('nav.bottom-nav');

    // Navigate to Accounts via bottom nav.
    await bottomNav.getByRole('button', { name: 'Accounts' }).click();
    await expect(page).toHaveURL(/\/accounts/);

    // Navigate to Transactions.
    await bottomNav.getByRole('button', { name: 'Transactions' }).click();
    await expect(page).toHaveURL(/\/transactions/);

    // Navigate back to Dashboard.
    await bottomNav.getByRole('button', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/\/(dashboard)?$/);
  });

  test('sidebar navigation links work on desktop', async ({ authenticatedPage: page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const sidebar = page.locator('aside[aria-label="Main navigation"]');

    // Navigate to Accounts via sidebar.
    await sidebar.getByRole('button', { name: 'Accounts' }).click();
    await expect(page).toHaveURL(/\/accounts/);

    // Navigate to Budgets.
    await sidebar.getByRole('button', { name: 'Budgets' }).click();
    await expect(page).toHaveURL(/\/budgets/);

    // Navigate to Goals.
    await sidebar.getByRole('button', { name: 'Goals' }).click();
    await expect(page).toHaveURL(/\/goals/);
  });

  test('transaction list is scrollable on mobile', async ({ authenticatedPage: page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/transactions');
    await waitForPageLoad(page);

    const main = page.locator('main.app-main');

    // The main content area should allow vertical scrolling when content
    // exceeds the viewport (overflow is not "hidden").
    const overflow = await main.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        overflowY: style.overflowY,
        scrollable: el.scrollHeight > el.clientHeight || style.overflowY !== 'hidden',
      };
    });

    // The content must not clip scrollable content.
    expect(overflow.overflowY).not.toBe('hidden');
  });

  test('active nav item is marked with aria-current on mobile', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const bottomNav = page.locator('nav.bottom-nav');
    const dashboardButton = bottomNav.getByRole('button', { name: 'Dashboard' });

    await expect(dashboardButton).toHaveAttribute('aria-current', 'page');
  });

  test('active nav item is marked with aria-current on desktop', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    const sidebar = page.locator('aside[aria-label="Main navigation"]');
    const dashboardButton = sidebar.getByRole('button', { name: 'Dashboard' });

    await expect(dashboardButton).toHaveAttribute('aria-current', 'page');
  });

  test('layout transitions correctly when viewport resizes', async ({
    authenticatedPage: page,
  }) => {
    // Start at mobile size.
    await page.setViewportSize(MOBILE);
    await page.goto('/dashboard');
    await waitForPageLoad(page);

    // Verify mobile layout.
    await expect(page.locator('nav.bottom-nav')).toBeVisible();
    await expect(page.locator('aside[aria-label="Main navigation"]')).toBeHidden();

    // Resize to desktop.
    await page.setViewportSize(DESKTOP);

    // Give the browser a moment to reflow.
    await page.waitForTimeout(100);

    // Verify desktop layout.
    await expect(page.locator('aside[aria-label="Main navigation"]')).toBeVisible();
    await expect(page.locator('nav.bottom-nav')).toBeHidden();

    // Resize back to mobile.
    await page.setViewportSize(MOBILE);
    await page.waitForTimeout(100);

    // Verify mobile layout is restored.
    await expect(page.locator('nav.bottom-nav')).toBeVisible();
    await expect(page.locator('aside[aria-label="Main navigation"]')).toBeHidden();
  });
});
