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

test('passkey-primary layout keeps social sign-in reachable (#3178)', async ({
  page,
}, testInfo) => {
  // Forcing a platform authenticator is only reliable on Chromium, matching the
  // visual-regression project scoping.
  test.skip(
    testInfo.project.name !== 'chromium',
    'Platform-authenticator stubbing is exercised on the Chromium project only.',
  );

  // Simulate a returning user whose browser has a saved passkey, so the login
  // page renders the biometric-first layout that collapses the email form.
  await page.addInitScript(() => {
    if (typeof window.PublicKeyCredential !== 'undefined') {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = () =>
        Promise.resolve(true);
    }
    localStorage.setItem('finance:preferred-auth-method', 'passkey');
    localStorage.setItem('finance:has-registered-passkey', 'true');
  });

  await page.goto('/login');

  // Social sign-in must be reachable WITHOUT expanding the email disclosure.
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with Apple' })).toBeVisible();

  // The email field stays collapsed in the passkey-primary layout — proving the
  // social buttons are no longer gated behind the hidden form (#3178).
  await expect(page.getByLabel('Email', { exact: true })).toBeHidden();
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
