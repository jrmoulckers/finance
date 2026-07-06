import { expect, test } from '@playwright/test';

import { seedFirstRunState } from './first-run-state';

test.beforeEach(async ({ page }) => {
  // Bypass the GDPR consent gate so the login/signup chrome renders.
  await seedFirstRunState(page);
});

test('login page renders', async ({ page }) => {
  await page.goto('/login');
  // The login page heading is the app brand name "Finance"
  await expect(page.getByRole('heading', { name: /finance/i })).toBeVisible();
  // Privacy-first brand tagline (#3087)
  await expect(page.getByText(/secure, private financial tracking/i)).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
});

test('keeps social sign-in outside the collapsible email form (#3178)', async ({ page }) => {
  await page.goto('/login');

  // Social sign-in renders in its own section that is a sibling of — not a
  // descendant of — the email <form>. This is the regression invariant: a
  // passkey-primary user's email form collapses (hidden), so the OAuth buttons
  // must live outside it to stay reachable. Asserting the structure directly is
  // deterministic and needs no WebAuthn/platform-authenticator stubbing (the
  // passkey-primary collapse path is covered by the LoginPage unit tests).
  const oauthSection = page.locator('.auth-oauth-section');
  await expect(oauthSection.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await expect(oauthSection.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
  await expect(oauthSection.getByRole('button', { name: 'Sign in with Apple' })).toBeVisible();

  // None of the social buttons may be nested inside the collapsible email form.
  const emailForm = page.locator('form#login-email-form');
  await expect(emailForm.getByRole('button', { name: 'Sign in with Google' })).toHaveCount(0);
  await expect(emailForm.getByRole('button', { name: 'Sign in with GitHub' })).toHaveCount(0);
  await expect(emailForm.getByRole('button', { name: 'Sign in with Apple' })).toHaveCount(0);
});

test('signup page renders', async ({ page }) => {
  await page.goto('/signup');
  // The signup page has the brand heading "Finance" and tagline "Create your account"
  await expect(page.getByRole('heading', { name: /finance/i })).toBeVisible();
  await expect(page.getByText(/create your account/i)).toBeVisible();
});

test('unauthenticated redirect to login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/login/);
});

test('login page links to signup and conditionally shows forgot password', async ({ page }) => {
  await page.goto('/login');
  const signupLink = page.getByRole('link', { name: /sign up/i });
  await expect(signupLink).toBeVisible();

  const isDemoMode = await page
    .getByText(/demo mode/i)
    .isVisible()
    .catch(() => false);
  const forgotPasswordLink = page.getByRole('link', { name: /forgot password/i });

  if (isDemoMode) {
    await expect(forgotPasswordLink).toHaveCount(0);
  } else {
    await expect(forgotPasswordLink).toBeVisible();
  }
});

test('forgot password page renders', async ({ page }) => {
  await page.goto('/forgot-password');
  await expect(page.getByRole('heading', { name: /finance/i })).toBeVisible();
  await expect(page.getByText('Reset your password', { exact: true })).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
});

test('reset password page renders invalid-link state', async ({ page }) => {
  await page.goto('/reset-password');
  await expect(page.getByRole('heading', { name: /finance/i })).toBeVisible();
  await expect(page.getByText(/choose a new password/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /update password/i })).toBeDisabled();
});
