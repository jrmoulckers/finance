// SPDX-License-Identifier: BUSL-1.1

/**
 * E2E tests for the Accounts CRUD pages.
 *
 * Covers:
 *   - Accounts list page (/accounts) — heading, Add button, cards or empty state
 *   - Account form dialog — required fields (name, type)
 *   - Account detail page (/accounts/:id) — info display, edit/delete buttons
 */

import { test, expect } from './fixtures';

// ---------------------------------------------------------------------------
// Accounts list page
// ---------------------------------------------------------------------------

test.describe('Accounts page', () => {
  test('loads and shows the Accounts heading', async ({ authenticatedPage: page }) => {
    await page.goto('/accounts');

    const heading = page.getByRole('heading', { name: /accounts/i });
    await expect(heading).toBeVisible();
  });

  test('shows the Add Account button', async ({ authenticatedPage: page }) => {
    await page.goto('/accounts');

    const addButton = page.getByRole('button', { name: /add.*account/i });
    await expect(addButton).toBeVisible();
  });

  test('clicking Add Account opens the form dialog', async ({ authenticatedPage: page }) => {
    await page.goto('/accounts');

    await page.getByRole('button', { name: /add.*account/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Dialog title should indicate creation mode
    await expect(dialog.getByRole('heading', { name: /create account/i })).toBeVisible();
  });

  test('account form has required fields: name and type', async ({ authenticatedPage: page }) => {
    await page.goto('/accounts');
    await page.getByRole('button', { name: /add.*account/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Name input (required)
    const nameInput = page.getByLabel(/account name/i);
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveAttribute('aria-required', 'true');

    // Account type select
    const typeSelect = page.getByLabel(/account type/i);
    await expect(typeSelect).toBeVisible();

    // Currency select
    const currencySelect = page.getByLabel(/currency/i);
    await expect(currencySelect).toBeVisible();

    // Initial balance input
    const balanceInput = page.getByLabel(/initial balance/i);
    await expect(balanceInput).toBeVisible();

    // Submit button
    const submitButton = page.getByRole('button', { name: /create account/i });
    await expect(submitButton).toBeVisible();

    // Cancel button
    const cancelButton = page.getByRole('button', { name: /cancel/i });
    await expect(cancelButton).toBeVisible();
  });

  test('shows account cards or empty state', async ({ authenticatedPage: page }) => {
    await page.goto('/accounts');

    // Wait for loading to complete — either account data appears or empty state
    const accountList = page.getByRole('list');
    const emptyState = page.getByText(/no accounts yet/i);

    // One of these should be visible after loading
    await expect(accountList.or(emptyState)).toBeVisible();
  });

  test('clicking an account card navigates to the detail page', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/accounts');

    // Wait for loading
    await page.waitForLoadState('networkidle');

    // Check if there are account links (seed data present)
    const accountLinks = page.getByRole('link').filter({
      has: page.locator('.list-item__primary'),
    });

    const count = await accountLinks.count();
    if (count > 0) {
      // Click the first account link
      const firstLink = accountLinks.first();
      await firstLink.click();

      // Should navigate to /accounts/:id
      await expect(page).toHaveURL(/\/accounts\/.+/);
    } else {
      // No seed data — verify empty state is shown
      await expect(page.getByText(/no accounts yet/i)).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// Account detail page
// ---------------------------------------------------------------------------

test.describe('Account detail page', () => {
  test('shows account info and edit/delete buttons when account exists', async ({
    authenticatedPage: page,
  }) => {
    // First go to accounts list to find an account
    await page.goto('/accounts');
    await page.waitForLoadState('networkidle');

    const accountLinks = page.getByRole('link').filter({
      has: page.locator('.list-item__primary'),
    });

    const count = await accountLinks.count();
    if (count > 0) {
      // Navigate to the first account
      await accountLinks.first().click();
      await expect(page).toHaveURL(/\/accounts\/.+/);

      // Should show the back link
      const backLink = page.getByRole('link', { name: /back to accounts/i });
      await expect(backLink).toBeVisible();

      // Should show edit and delete buttons
      const editButton = page.getByRole('button', { name: /edit/i });
      await expect(editButton).toBeVisible();

      const deleteButton = page.getByRole('button', { name: /delete/i });
      await expect(deleteButton).toBeVisible();

      // Should show account details card
      const detailsCard = page.locator('article[aria-label="Account details"]');
      await expect(detailsCard).toBeVisible();

      // Should show Balance label
      await expect(page.getByText('Balance')).toBeVisible();

      // Should show the Recent Transactions section
      await expect(page.getByRole('heading', { name: /recent transactions/i })).toBeVisible();
    } else {
      // No seed data — navigate to a fake account ID and verify not-found
      await page.goto('/accounts/nonexistent-id');
      await expect(page.getByText(/account not found/i)).toBeVisible();
    }
  });

  test('shows "Account not found" for invalid account ID', async ({ authenticatedPage: page }) => {
    await page.goto('/accounts/nonexistent-id-12345');

    // Wait for loading to finish
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/account not found/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /back to accounts/i })).toBeVisible();
  });
});
