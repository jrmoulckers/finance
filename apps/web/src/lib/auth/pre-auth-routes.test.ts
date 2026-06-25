// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the pre-auth / unauthenticated-safe route predicates.
 *
 * References: issue #3059 (fresh visitor /onboarding ⇄ /login redirect loop)
 */

import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_ROUTE,
  PRE_AUTH_ROUTE_SET,
  isUnauthenticatedSafeRoute,
} from './pre-auth-routes';

describe('isUnauthenticatedSafeRoute', () => {
  it('treats the onboarding first-run route as safe (regression: #3059 loop)', () => {
    // The whole point of #3059: a logged-out visitor parked on /onboarding must
    // NOT be hard-redirected to /login, or App.tsx and the auth layer fight.
    expect(isUnauthenticatedSafeRoute('/onboarding')).toBe(true);
    expect(isUnauthenticatedSafeRoute('/onboarding/step-2')).toBe(true);
  });

  it('treats pre-auth routes (and their nested paths) as safe', () => {
    expect(isUnauthenticatedSafeRoute('/login')).toBe(true);
    expect(isUnauthenticatedSafeRoute('/signup')).toBe(true);
    expect(isUnauthenticatedSafeRoute('/forgot-password')).toBe(true);
    expect(isUnauthenticatedSafeRoute('/reset-password')).toBe(true);
    expect(isUnauthenticatedSafeRoute('/reset-password/abc123')).toBe(true);
    expect(isUnauthenticatedSafeRoute('/legal')).toBe(true);
    expect(isUnauthenticatedSafeRoute('/legal/privacy')).toBe(true);
    expect(isUnauthenticatedSafeRoute('/beta')).toBe(true);
  });

  it('treats authenticated-only app routes as NOT safe (still redirect to /login)', () => {
    expect(isUnauthenticatedSafeRoute('/')).toBe(false);
    expect(isUnauthenticatedSafeRoute('/dashboard')).toBe(false);
    expect(isUnauthenticatedSafeRoute('/transactions')).toBe(false);
    expect(isUnauthenticatedSafeRoute('/settings/security')).toBe(false);
  });

  it('does not false-match routes that merely share a string prefix', () => {
    expect(isUnauthenticatedSafeRoute('/loginx')).toBe(false);
    expect(isUnauthenticatedSafeRoute('/onboardingx')).toBe(false);
    expect(isUnauthenticatedSafeRoute('/signup-promo')).toBe(false);
  });
});

describe('PRE_AUTH_ROUTE_SET (DatabaseGate skip-list)', () => {
  it('contains the pre-auth routes for exact-match DB-gate skipping', () => {
    expect(PRE_AUTH_ROUTE_SET.has('/login')).toBe(true);
    expect(PRE_AUTH_ROUTE_SET.has('/signup')).toBe(true);
  });

  it('does NOT contain onboarding — it still needs the database', () => {
    // Onboarding is unauthenticated-safe (no forced login redirect) but is NOT
    // a DB-skip route: it reads/writes budgets, so it keeps the DatabaseGate.
    expect(PRE_AUTH_ROUTE_SET.has(ONBOARDING_ROUTE)).toBe(false);
    expect(isUnauthenticatedSafeRoute(ONBOARDING_ROUTE)).toBe(true);
  });
});
