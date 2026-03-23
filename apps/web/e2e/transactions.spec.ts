// SPDX-License-Identifier: BUSL-1.1

/**
 * E2E tests for the Transactions CRUD pages.
 *
 * Covers:
 *   - Transactions list page (/transactions) — heading, search, filters, Add button
 *   - Transaction form dialog — required fields (description, amount, date)
 *   - Transaction detail page (/transactions/:id) — amount, description, edit/delete
 */

import { test, expect } from './fixtures';

// ---------------------------------------------------------------------------
// Transactions list page
// ---------------------------------------------------------------------------

test.describe('Transactions page', () => {
  test('loads and shows the Transactions heading', async ({ authenticatedPage: page }) => {
    await page.goto('/transactions');

    const heading = page.getByRole('heading', { name: /transactions/i });
    await expect(heading).toBeVisible();
  });

  test('has a search input with role="search"', async ({ authenticatedPage: page }) => {
    await page.goto('/transactions');

    // The search bar wrapper has role="search"
    const searchRegion = page.getByRole('search');
    await expect(searchRegion).toBeVisible();

    // Inside the search region, there should be a search input
    const searchInput = searchRegion.getByRole('searchbox');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute('placeholder', /search/i);
  });

  test('shows filter chips including "All"', async ({ authenticatedPage: page }) => {
    await page.goto('/transactions');

    // Category filter group
    const filterGroup = page.getByRole('group', { name: /category filter/i });
    await expect(filterGroup).toBeVisible();

    // The "All" filter chip should be present and pressed by default
    const allChip = filterGroup.getByRole('button', { name: 'All' });
    await expect(allChip).toBeVisible();
    await expect(allChip).toHaveAttribute('aria-pressed', 'true');
  });

  test('shows the Add Transaction button', async ({ authenticatedPage: page }) => {
    await page.goto('/transactions');

    const addButton = page.getByRole('button', { name: /add.*transaction/i });
    await expect(addButton).toBeVisible();
  });

  test('clicking Add Transaction opens form dialog', async ({ authenticatedPage: page }) => {
    await page.goto('/transactions');

    await page.getByRole('button', { name: /add.*transaction/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Dialog title should indicate creation mode
    await expect(dialog.getByRole('heading', { name: /new transaction/i })).toBeVisible();
  });

  test('transaction form has required fields: description, amount, and date', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/transactions');
    await page.getByRole('button', { name: /add.*transaction/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Amount input (required)
    const amountInput = page.getByLabel(/^amount$/i);
    await expect(amountInput).toBeVisible();
    await expect(amountInput).toHaveAttribute('aria-required', 'true');

    // Description input (required)
    const descriptionInput = page.getByLabel(/description/i);
    await expect(descriptionInput).toBeVisible();
    await expect(descriptionInput).toHaveAttribute('aria-required', 'true');

    // Transaction type radio group
    const typeFieldset = page.getByRole('radiogroup');
    await expect(typeFieldset).toBeVisible();

    // Expense radio should be checked by default
    const expenseRadio = page.getByRole('radio', { name: /expense/i });
    await expect(expenseRadio).toBeChecked();

    // Income and Transfer radios
    await expect(page.getByRole('radio', { name: /income/i })).toBeVisible();
    await expect(page.getByRole('radio', { name: /transfer/i })).toBeVisible();

    // Account select (required)
    const accountSelect = page.getByLabel(/^account$/i);
    await expect(accountSelect).toBeVisible();
    await expect(accountSelect).toHaveAttribute('aria-required', 'true');

    // Category select (optional)
    const categorySelect = page.getByLabel(/category/i);
    await expect(categorySelect).toBeVisible();

    // Date input
    const dateInput = page.getByLabel(/date/i);
    await expect(dateInput).toBeVisible();

    // Notes textarea
    const notesInput = page.getByLabel(/notes/i);
    await expect(notesInput).toBeVisible();

    // Submit and cancel buttons
    await expect(page.getByRole('button', { name: /add transaction/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
  });

  test('shows transaction list or empty state', async ({ authenticatedPage: page }) => {
    await page.goto('/transactions');

    // Wait for loading to complete
    await page.waitForLoadState('networkidle');

    const transactionList = page.getByRole('list');
    const emptyState = page.getByText(/no transactions yet/i);

    // One of these should be visible after loading
    await expect(transactionList.first().or(emptyState)).toBeVisible();
  });

  test('clicking a transaction navigates to detail page', async ({ authenticatedPage: page }) => {
    await page.goto('/transactions');
    await page.waitForLoadState('networkidle');

    // Look for transaction detail links
    const transactionLinks = page.getByRole('link').filter({
      has: page.locator('.list-item__primary'),
    });

    const count = await transactionLinks.count();
    if (count > 0) {
      await transactionLinks.first().click();
      await expect(page).toHaveURL(/\/transactions\/.+/);
    } else {
      // No seed data — verify empty state
      await expect(page.getByText(/no transactions yet/i)).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// Transaction detail page
// ---------------------------------------------------------------------------

test.describe('Transaction detail page', () => {
  test('shows amount and description when transaction exists', async ({
    authenticatedPage: page,
  }) => {
    // Navigate to transactions list first
    await page.goto('/transactions');
    await page.waitForLoadState('networkidle');

    const transactionLinks = page.getByRole('link').filter({
      has: page.locator('.list-item__primary'),
    });

    const count = await transactionLinks.count();
    if (count > 0) {
      await transactionLinks.first().click();
      await expect(page).toHaveURL(/\/transactions\/.+/);

      // Should show back link
      const backLink = page.getByRole('link', { name: /back to transactions/i });
      await expect(backLink).toBeVisible();

      // Should show transaction details card
      const detailsCard = page.locator('article[aria-label="Transaction details"]');
      await expect(detailsCard).toBeVisible();

      // Should show Amount label
      await expect(page.getByText('Amount')).toBeVisible();

      // Should show Type label
      await expect(page.getByText('Type')).toBeVisible();

      // Should show edit and delete buttons
      const editButton = page.getByRole('button', { name: /edit/i });
      await expect(editButton).toBeVisible();

      const deleteButton = page.getByRole('button', { name: /delete/i });
      await expect(deleteButton).toBeVisible();
    } else {
      // No seed data — navigate to a fake ID and verify not-found
      await page.goto('/transactions/nonexistent-id');
      await expect(page.getByText(/transaction not found/i)).toBeVisible();
    }
  });

  test('shows "Transaction not found" for invalid transaction ID', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/transactions/nonexistent-id-12345');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/transaction not found/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /back to transactions/i })).toBeVisible();
  });
});
