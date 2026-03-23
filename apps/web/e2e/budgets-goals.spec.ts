// SPDX-License-Identifier: BUSL-1.1

/**
 * E2E tests for the Budgets and Goals CRUD pages.
 *
 * Covers:
 *   - Budgets list page (/budgets) — heading, Add button, form with category/amount
 *   - Goals list page (/goals) — heading, Add button, form with name/target/date
 */

import { test, expect } from './fixtures';

// ---------------------------------------------------------------------------
// Budgets page
// ---------------------------------------------------------------------------

test.describe('Budgets page', () => {
  test('loads and shows the Budgets heading', async ({ authenticatedPage: page }) => {
    await page.goto('/budgets');

    const heading = page.getByRole('heading', { name: /budgets/i });
    await expect(heading).toBeVisible();
  });

  test('shows the Add Budget button', async ({ authenticatedPage: page }) => {
    await page.goto('/budgets');

    const addButton = page.getByRole('button', { name: /add budget/i });
    await expect(addButton).toBeVisible();
  });

  test('clicking Add Budget opens form with category and amount fields', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/budgets');

    await page.getByRole('button', { name: /add budget/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Dialog title
    await expect(dialog.getByRole('heading', { name: /create budget/i })).toBeVisible();

    // Category select (required)
    const categorySelect = page.getByLabel(/category/i);
    await expect(categorySelect).toBeVisible();
    await expect(categorySelect).toHaveAttribute('aria-required', 'true');

    // Amount input (required)
    const amountInput = page.getByLabel(/^amount$/i);
    await expect(amountInput).toBeVisible();
    await expect(amountInput).toHaveAttribute('aria-required', 'true');

    // Period select
    const periodSelect = page.getByLabel(/period/i);
    await expect(periodSelect).toBeVisible();

    // Start date input
    const startDateInput = page.getByLabel(/start date/i);
    await expect(startDateInput).toBeVisible();

    // Submit and cancel buttons
    await expect(page.getByRole('button', { name: /create budget/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
  });

  test('shows budget cards or empty state', async ({ authenticatedPage: page }) => {
    await page.goto('/budgets');
    await page.waitForLoadState('networkidle');

    const budgetCards = page.getByRole('article');
    const emptyState = page.getByText(/no budgets yet/i);

    // Either budget cards or empty state should be visible
    await expect(budgetCards.first().or(emptyState)).toBeVisible();
  });

  test('budget cards show progress ring when data exists', async ({ authenticatedPage: page }) => {
    await page.goto('/budgets');
    await page.waitForLoadState('networkidle');

    const progressBars = page.getByRole('progressbar');
    const emptyState = page.getByText(/no budgets yet/i);

    // If budgets exist, progress rings should be present
    const emptyVisible = await emptyState.isVisible().catch(() => false);
    if (!emptyVisible) {
      const count = await progressBars.count();
      expect(count).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Goals page
// ---------------------------------------------------------------------------

test.describe('Goals page', () => {
  test('loads and shows the Goals heading', async ({ authenticatedPage: page }) => {
    await page.goto('/goals');

    const heading = page.getByRole('heading', { name: /goals/i });
    await expect(heading).toBeVisible();
  });

  test('shows the Add Goal button', async ({ authenticatedPage: page }) => {
    await page.goto('/goals');

    const addButton = page.getByRole('button', { name: /add.*goal/i });
    await expect(addButton).toBeVisible();
  });

  test('clicking Add Goal opens form with name, target amount, and target date fields', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/goals');

    await page.getByRole('button', { name: /add.*goal/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Dialog title
    await expect(dialog.getByRole('heading', { name: /create goal/i })).toBeVisible();

    // Name input (required)
    const nameInput = page.getByLabel(/^name$/i);
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveAttribute('aria-required', 'true');

    // Target amount input (required)
    const targetAmountInput = page.getByLabel(/target amount/i);
    await expect(targetAmountInput).toBeVisible();
    await expect(targetAmountInput).toHaveAttribute('aria-required', 'true');

    // Current amount input (optional)
    const currentAmountInput = page.getByLabel(/current amount/i);
    await expect(currentAmountInput).toBeVisible();

    // Target date input
    const targetDateInput = page.getByLabel(/target date/i);
    await expect(targetDateInput).toBeVisible();

    // Description textarea
    const descriptionInput = page.getByLabel(/description/i);
    await expect(descriptionInput).toBeVisible();

    // Submit and cancel buttons
    await expect(page.getByRole('button', { name: /create goal/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
  });

  test('shows goal cards or empty state', async ({ authenticatedPage: page }) => {
    await page.goto('/goals');
    await page.waitForLoadState('networkidle');

    const goalCards = page.getByRole('article');
    const emptyState = page.getByText(/no goals yet/i);

    // Either goal cards or empty state should be visible
    await expect(goalCards.first().or(emptyState)).toBeVisible();
  });

  test('goal cards show progress bar when data exists', async ({ authenticatedPage: page }) => {
    await page.goto('/goals');
    await page.waitForLoadState('networkidle');

    const progressBars = page.getByRole('progressbar');
    const emptyState = page.getByText(/no goals yet/i);

    const emptyVisible = await emptyState.isVisible().catch(() => false);
    if (!emptyVisible) {
      const count = await progressBars.count();
      expect(count).toBeGreaterThan(0);
    }
  });
});
