import { expect, test } from '@playwright/test';

test.describe('PR smoke coverage', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /finance/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('signup page renders', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: /finance/i })).toBeVisible();
    await expect(page.getByText(/create your account/i)).toBeVisible();
  });

  test('unauthenticated users are redirected to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login page links to password recovery and signup', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: /forgot password/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /sign up/i })).toBeVisible();
  });
});
