// SPDX-License-Identifier: BUSL-1.1

/**
 * Dashboard E2E tests.
 *
 * Verifies that the dashboard page loads correctly after authentication,
 * displays the expected sections, and allows navigation to other pages.
 *
 * These tests use the `authenticatedPage` fixture from `./fixtures.ts`
 * which mocks auth endpoints and logs in via the UI before each test.
 */

import { test, expect } from './fixtures';

test.describe('Dashboard page', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    // The fixture already logs in and lands on /dashboard.
    // Ensure we're on the dashboard before each test.
    await authenticatedPage.goto('/dashboard');
    // Wait for either the dashboard heading or the loading state to appear,
    // then wait for loading to finish.
    await authenticatedPage
      .getByRole('status', { name: /loading/i })
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => {
        // Loading indicator may have already disappeared — that's fine.
      });
  });

  // -------------------------------------------------------------------------
  // Page structure
  // -------------------------------------------------------------------------

  test('loads and shows the main heading', async ({ authenticatedPage }) => {
    // The AppLayout renders an <h1> with the page title "Dashboard".
    const heading = authenticatedPage.getByRole('heading', { name: /dashboard/i });
    await expect(heading).toBeVisible();
  });

  test('has the correct document URL', async ({ authenticatedPage }) => {
    await expect(authenticatedPage).toHaveURL(/\/dashboard/);
  });

  // -------------------------------------------------------------------------
  // Financial summary sections
  // -------------------------------------------------------------------------

  test('shows financial summary section', async ({ authenticatedPage }) => {
    // The dashboard renders a section with aria-label="Financial summary"
    // when data is available. When empty, it shows an empty state.
    const summarySection = authenticatedPage.getByLabel('Financial summary');
    const emptyState = authenticatedPage.getByText(/no dashboard data yet/i);

    // One of these must be visible — either data or empty state.
    const hasSummary = await summarySection.isVisible().catch(() => false);
    const hasEmptyState = await emptyState.isVisible().catch(() => false);

    expect(hasSummary || hasEmptyState).toBe(true);
  });

  test('shows net worth card when data is available', async ({ authenticatedPage }) => {
    const summarySection = authenticatedPage.getByLabel('Financial summary');
    const hasSummary = await summarySection.isVisible().catch(() => false);

    if (hasSummary) {
      const netWorthCard = authenticatedPage.getByLabel('Net worth');
      await expect(netWorthCard).toBeVisible();
      await expect(netWorthCard.getByRole('heading', { name: /net worth/i })).toBeVisible();
    }
  });

  test('shows monthly spending card when data is available', async ({ authenticatedPage }) => {
    const summarySection = authenticatedPage.getByLabel('Financial summary');
    const hasSummary = await summarySection.isVisible().catch(() => false);

    if (hasSummary) {
      const spendingCard = authenticatedPage.getByLabel('Monthly spending');
      await expect(spendingCard).toBeVisible();
      await expect(spendingCard.getByRole('heading', { name: /spent this month/i })).toBeVisible();
    }
  });

  test('shows budget health card when data is available', async ({ authenticatedPage }) => {
    const summarySection = authenticatedPage.getByLabel('Financial summary');
    const hasSummary = await summarySection.isVisible().catch(() => false);

    if (hasSummary) {
      const budgetCard = authenticatedPage.getByLabel('Budget health');
      await expect(budgetCard).toBeVisible();
      await expect(budgetCard.getByRole('heading', { name: /budget health/i })).toBeVisible();

      // The budget card contains a progress bar.
      const progressBar = budgetCard.getByRole('progressbar');
      await expect(progressBar).toBeVisible();
    }
  });

  // -------------------------------------------------------------------------
  // Chart components
  // -------------------------------------------------------------------------

  test('shows chart section when transaction data exists', async ({ authenticatedPage }) => {
    // Charts are only rendered when there is spending data.
    const chartSection = authenticatedPage.getByLabel('Financial charts');
    const hasCharts = await chartSection.isVisible().catch(() => false);

    if (hasCharts) {
      // Verify individual chart containers are present.
      await expect(authenticatedPage.getByLabel('Spending trend chart')).toBeVisible();
      await expect(authenticatedPage.getByLabel('Category spending bar chart')).toBeVisible();
      await expect(authenticatedPage.getByLabel('Category share pie chart')).toBeVisible();
    }
  });

  // -------------------------------------------------------------------------
  // Recent transactions
  // -------------------------------------------------------------------------

  test('shows recent transactions section when data is available', async ({
    authenticatedPage,
  }) => {
    const summarySection = authenticatedPage.getByLabel('Financial summary');
    const hasSummary = await summarySection.isVisible().catch(() => false);

    if (hasSummary) {
      // The "Recent Transactions" section always renders when data is present.
      const recentSection = authenticatedPage.getByLabel('Recent transactions');
      await expect(recentSection).toBeVisible();

      const sectionHeading = recentSection.getByRole('heading', {
        name: /recent transactions/i,
      });
      await expect(sectionHeading).toBeVisible();

      // It contains either a list of transactions or an empty state message.
      const transactionList = recentSection.getByRole('list');
      const emptyMessage = recentSection.getByText(/no recent transactions/i);

      const hasList = await transactionList.isVisible().catch(() => false);
      const hasEmpty = await emptyMessage.isVisible().catch(() => false);

      expect(hasList || hasEmpty).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  test('shows empty state when no financial data exists', async ({ authenticatedPage }) => {
    const emptyState = authenticatedPage.getByText(/no dashboard data yet/i);
    const summarySection = authenticatedPage.getByLabel('Financial summary');

    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    const hasSummary = await summarySection.isVisible().catch(() => false);

    // The page should show either the empty state or the summary — never neither.
    expect(hasEmptyState || hasSummary).toBe(true);
    // And never both at the same time.
    expect(hasEmptyState && hasSummary).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Navigation from dashboard
  // -------------------------------------------------------------------------

  test('navigates to accounts page via sidebar', async ({ authenticatedPage }) => {
    // The sidebar navigation has a button for "Accounts".
    const accountsButton = authenticatedPage
      .locator('aside[aria-label="Main navigation"]')
      .getByRole('button', { name: /accounts/i });

    await accountsButton.click();
    await expect(authenticatedPage).toHaveURL(/\/accounts/);
  });

  test('navigates to transactions page via sidebar', async ({ authenticatedPage }) => {
    const transactionsButton = authenticatedPage
      .locator('aside[aria-label="Main navigation"]')
      .getByRole('button', { name: /transactions/i });

    await transactionsButton.click();
    await expect(authenticatedPage).toHaveURL(/\/transactions/);
  });

  test('navigates to budgets page via sidebar', async ({ authenticatedPage }) => {
    const budgetsButton = authenticatedPage
      .locator('aside[aria-label="Main navigation"]')
      .getByRole('button', { name: /budgets/i });

    await budgetsButton.click();
    await expect(authenticatedPage).toHaveURL(/\/budgets/);
  });

  test('navigates to goals page via sidebar', async ({ authenticatedPage }) => {
    const goalsButton = authenticatedPage
      .locator('aside[aria-label="Main navigation"]')
      .getByRole('button', { name: /goals/i });

    await goalsButton.click();
    await expect(authenticatedPage).toHaveURL(/\/goals/);
  });

  test('navigates to settings page via header button', async ({ authenticatedPage }) => {
    // The app header has a Settings icon button.
    const settingsButton = authenticatedPage.getByRole('button', { name: /settings/i }).first();

    await settingsButton.click();
    await expect(authenticatedPage).toHaveURL(/\/settings/);
  });
});
