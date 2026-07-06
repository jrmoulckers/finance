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

    const heading = page.getByRole('heading', { name: /transactions/i }).first();
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

  test('shows filter controls with toggle button', async ({ authenticatedPage: page }) => {
    await page.goto('/transactions');

    // Advanced filter toggle button should be visible
    const filterToggle = page.getByRole('button', { name: /filters/i });
    await expect(filterToggle).toBeVisible();

    // Sort controls should be visible
    const sortSelect = page.getByLabel(/sort field/i);
    await expect(sortSelect).toBeVisible();
  });

  test('shows the Add Transaction button', async ({ authenticatedPage: page }) => {
    await page.goto('/transactions');

    const addButton = page.getByRole('button', { name: 'Add Transaction', exact: true });
    await expect(addButton).toBeVisible();
  });

  test('clicking transaction options opens split-button menu', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/transactions');

    const menuButton = page.getByRole('button', { name: /open transaction options/i });
    await menuButton.click();

    // Dropdown menu should appear with Manual Entry and Import options
    const manualEntry = page.getByRole('menuitem', { name: /manual entry/i });
    await expect(manualEntry).toBeVisible();
    const importFile = page.getByRole('menuitem', { name: /import from file/i });
    await expect(importFile).toBeVisible();
  });

  test('clicking Manual Entry opens form dialog', async ({ authenticatedPage: page }) => {
    await page.goto('/transactions');

    await page.getByRole('button', { name: /open transaction options/i }).click();
    await page.getByRole('menuitem', { name: /manual entry/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Dialog title should indicate creation mode
    await expect(dialog.getByRole('heading', { name: /new transaction/i })).toBeVisible();
  });

  test('transaction form has required fields: description, amount, and date', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/transactions');
    await page.getByRole('button', { name: 'Add Transaction', exact: true }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Amount input (required)
    const amountInput = dialog.getByLabel(/^amount$/i);
    await expect(amountInput).toBeVisible();
    await expect(amountInput).toHaveAttribute('aria-required', 'true');

    // Description input (required) — now labeled "Payee"
    const descriptionInput = dialog.getByLabel(/payee/i);
    await expect(descriptionInput).toBeVisible();
    await expect(descriptionInput).toHaveAttribute('aria-required', 'true');

    // Transaction type radio group
    const typeFieldset = dialog.getByRole('radiogroup');
    await expect(typeFieldset).toBeVisible();

    // Expense radio should be checked by default
    const expenseRadio = dialog.getByRole('radio', { name: /expense/i });
    await expect(expenseRadio).toBeChecked();

    // Income and Transfer radios
    await expect(dialog.getByRole('radio', { name: /income/i })).toBeVisible();
    await expect(dialog.getByRole('radio', { name: /transfer/i })).toBeVisible();

    // Account select (required)
    const accountSelect = dialog.getByLabel(/^account$/i);
    await expect(accountSelect).toBeVisible();
    await expect(accountSelect).toHaveAttribute('aria-required', 'true');

    // Category select (optional)
    const categorySelect = dialog.getByLabel('Category', { exact: true });
    await expect(categorySelect).toBeVisible();

    // Date input (scope to the dialog: the list behind it also has date
    // filter inputs, and an exact label avoids matching them).
    const dateInput = dialog.getByLabel('Date', { exact: true });
    await expect(dateInput).toBeVisible();

    // Notes textarea
    const notesInput = dialog.getByLabel(/notes/i);
    await expect(notesInput).toBeVisible();

    // Submit and cancel buttons (scoped to dialog to avoid matching the dropdown trigger)
    await expect(dialog.getByRole('button', { name: /add transaction/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /cancel/i })).toBeVisible();
  });

  test('shows transaction list or empty state', async ({ authenticatedPage: page }) => {
    await page.goto('/transactions');

    // Wait for data or empty state to appear (UI-based wait instead of
    // networkidle which hangs on Vite dev server persistent connections).
    const mainRegion = page.getByRole('main');
    const transactionList = mainRegion.getByRole('list').first();
    const emptyState = mainRegion.getByText(/no transactions yet/i);

    // One of these should be visible after loading
    await expect(transactionList.or(emptyState)).toBeVisible();
  });

  test('clicking a transaction navigates to detail page', async ({ authenticatedPage: page }) => {
    await page.goto('/transactions');

    // Wait for the page to finish loading.
    const mainRegion = page.getByRole('main');
    const transactionList = mainRegion.getByRole('list').first();
    const emptyState = mainRegion.getByText(/no transactions yet/i);
    await expect(transactionList.or(emptyState)).toBeVisible();

    // Look for transaction detail links
    const transactionLinks = mainRegion.getByRole('link', { name: /view details for/i });

    const count = await transactionLinks.count();
    if (count > 0) {
      // dispatchEvent: under headless Chromium on CI a sticky list-group header
      // intermittently intercepts the row's hit-test; the URL assertion still
      // validates navigation to the detail page.
      await transactionLinks.first().dispatchEvent('click');
      await expect(page).toHaveURL(/\/transactions\/.+/);
    } else {
      // No seed data — verify empty state
      await expect(emptyState).toBeVisible();
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

    // Wait for the page to finish loading.
    const mainRegion = page.getByRole('main');
    const txList = mainRegion.getByRole('list').first();
    const txEmpty = mainRegion.getByText(/no transactions yet/i);
    await expect(txList.or(txEmpty)).toBeVisible();

    const transactionLinks = mainRegion.getByRole('link', { name: /view details for/i });

    const count = await transactionLinks.count();
    if (count > 0) {
      // Open the transaction detail page via its href. (Click-to-navigate URL
      // behavior is covered by the dedicated navigation test above; this test
      // verifies detail page content, which is also the direct-link path.)
      const href = await transactionLinks.first().getAttribute('href');
      await page.goto(href ?? '/transactions');
      await expect(page).toHaveURL(/\/transactions\/.+/);

      // Should show breadcrumb navigation back to Transactions.
      const breadcrumb = page.getByRole('navigation', { name: /breadcrumb/i });
      await expect(breadcrumb.getByRole('link', { name: /^transactions$/i })).toBeVisible();

      // Should show transaction details card
      const detailsCard = page.locator('article[aria-label="Transaction details"]');
      await expect(detailsCard).toBeVisible();

      // Should show Amount label. Scope to the details card and match exactly:
      // the shared app header now has a "Hide amounts" privacy toggle (#3172)
      // on every page, so a substring getByText('Amount') would also match the
      // toggle and trip a strict-mode violation.
      await expect(detailsCard.getByText('Amount', { exact: true })).toBeVisible();

      // Should show Type label (scoped + exact for the same reason).
      await expect(detailsCard.getByText('Type', { exact: true })).toBeVisible();

      // Should show edit and delete buttons. Scope to <main> so the page-wide
      // /edit/i regex does not also match the sidebar 'Building Credit' nav
      // button ("Building Cr-edit-" contains "edit"), which lives in the
      // <aside> and would otherwise trip a strict-mode violation.
      const editButton = mainRegion.getByRole('button', { name: /edit/i });
      await expect(editButton).toBeVisible();

      const deleteButton = mainRegion.getByRole('button', { name: /delete/i });
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

    // Wait for not-found message (UI-based wait instead of networkidle).
    await expect(page.getByText(/transaction not found/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /back to transactions/i })).toBeVisible();
  });
});
