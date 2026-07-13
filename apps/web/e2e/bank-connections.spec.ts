// SPDX-License-Identifier: BUSL-1.1

/**
 * E2E tests for the Bank Connections Health Center (/bank-connections).
 *
 * This is the web surface of the consolidated live-data aggregator path
 * (epic #3846). It runs against the STUBBED suite (mocked auth + in-memory
 * stub DB), so no live backend is required. The E2E stub DB has no
 * `bank_connection` / `aggregator_provider` tables, so reads resolve to empty
 * and the page renders its empty state — this test locks the always-present
 * page structure (heading, summary strip, tab pattern, empty state) so a
 * regression in the connection-health dashboard is caught in CI.
 *
 * The genuinely-wired aggregator round-trip (real edge `aggregator-health`
 * function) is covered separately by the opt-in live skeleton at
 * e2e-live/bank-connections-live.spec.ts.
 *
 * References: #3861, #3846, #1575, #1577
 */

import { test, expect } from './fixtures';

const TAB_LABELS = ['Connection Health', 'Providers', 'Wallets & Exchanges', 'Safety Center'];

test.describe('Bank Connections page', () => {
  test('loads and shows the Bank Connections heading', async ({ authenticatedPage: page }) => {
    await page.goto('/bank-connections');

    const heading = page.getByRole('heading', { name: /bank connections/i, level: 1 });
    await expect(heading).toBeVisible();
  });

  test('shows the connection health summary strip', async ({ authenticatedPage: page }) => {
    await page.goto('/bank-connections');

    // The summary strip is always rendered (role="status") regardless of how
    // many connections exist, and reports the total connection count.
    const summary = page.getByRole('status', { name: /connection health summary/i });
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(/connections/i);
  });

  test('renders all four section tabs', async ({ authenticatedPage: page }) => {
    await page.goto('/bank-connections');

    for (const label of TAB_LABELS) {
      await expect(page.getByRole('tab', { name: label })).toBeVisible();
    }

    // The Connection Health tab is selected by default.
    await expect(page.getByRole('tab', { name: 'Connection Health' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('switching to the Providers tab updates the active tab', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/bank-connections');

    const providersTab = page.getByRole('tab', { name: 'Providers' });
    await providersTab.click();

    await expect(providersTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Connection Health' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  test('health tab shows connection cards or the empty state', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/bank-connections');

    // The health section heading always renders once the tab is active.
    await expect(page.getByRole('heading', { name: /connection health/i, level: 2 })).toBeVisible();

    // With no synced connections (stub DB), the empty state appears. If seed
    // data is ever present, a connection card (an <article> labelled
    // "… connection health") appears instead — tolerate both.
    const emptyState = page.getByRole('heading', { name: /no bank connections/i, level: 3 });
    const connectionCard = page.locator('article.connection-health-card').first();
    await expect(emptyState.or(connectionCard)).toBeVisible();
  });

  test('switching to the Safety Center tab updates the active tab', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/bank-connections');

    const safetyTab = page.getByRole('tab', { name: 'Safety Center' });
    await safetyTab.click();

    await expect(safetyTab).toHaveAttribute('aria-selected', 'true');
  });
});
