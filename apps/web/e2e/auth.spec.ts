import { expect, test } from '@playwright/test';

test('login page renders', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
});

test('signup page renders', async ({ page }) => {
  await page.goto('/signup');
  await expect(page.getByRole('heading', { name: /create.*account/i })).toBeVisible();
});

test('unauthenticated redirect to login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/login/);
});

test('login page links to signup', async ({ page }) => {
  await page.goto('/login');
  const signupLink = page.getByRole('link', { name: /sign up/i });
  await expect(signupLink).toBeVisible();
});
