// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  SIGNED_IN_HOME_PATH,
  SIGNED_OUT_HOME_PATH,
  isOnboardingPath,
  resolveBackNavigation,
} from './guardrails';

describe('isOnboardingPath', () => {
  it('matches the onboarding root and sub-routes', () => {
    expect(isOnboardingPath('/onboarding')).toBe(true);
    expect(isOnboardingPath('/onboarding/account')).toBe(true);
  });

  it('does not match other routes', () => {
    expect(isOnboardingPath('/dashboard')).toBe(false);
    expect(isOnboardingPath('/onboarding-extra')).toBe(false);
  });
});

describe('resolveBackNavigation', () => {
  it('redirects an unauthenticated back-press from onboarding to login (#3106)', () => {
    expect(
      resolveBackNavigation({
        pathname: '/onboarding',
        isAuthenticated: false,
        hasActiveGuards: false,
      }),
    ).toEqual({ kind: 'redirect', to: SIGNED_OUT_HOME_PATH });
  });

  it('redirects an authenticated back-press from onboarding to dashboard (#3106)', () => {
    expect(
      resolveBackNavigation({
        pathname: '/onboarding',
        isAuthenticated: true,
        hasActiveGuards: false,
      }),
    ).toEqual({ kind: 'redirect', to: SIGNED_IN_HOME_PATH });
  });

  it('never prompts to leave from onboarding even with unsaved guards', () => {
    expect(
      resolveBackNavigation({
        pathname: '/onboarding',
        isAuthenticated: false,
        hasActiveGuards: true,
      }),
    ).toEqual({ kind: 'redirect', to: SIGNED_OUT_HOME_PATH });
  });

  it('only prompts on genuine exit when there are unsaved changes', () => {
    expect(
      resolveBackNavigation({
        pathname: '/dashboard',
        isAuthenticated: true,
        hasActiveGuards: true,
      }),
    ).toEqual({ kind: 'prompt' });
  });

  it('exits silently on genuine exit with no unsaved changes', () => {
    expect(
      resolveBackNavigation({
        pathname: '/dashboard',
        isAuthenticated: true,
        hasActiveGuards: false,
      }),
    ).toEqual({ kind: 'exit' });
  });
});
