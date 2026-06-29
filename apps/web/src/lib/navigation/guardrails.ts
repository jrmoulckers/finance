// SPDX-License-Identifier: BUSL-1.1

import type {
  NavigationGuardRegistration,
  NavigationShortcut,
  StableNavItem,
  StabilityRule,
} from './types';

export const DEFAULT_UNSAVED_CHANGES_MESSAGE =
  'You have unsaved changes. Leave this view and discard them?';

export const EXIT_APP_CONFIRMATION_MESSAGE =
  'Leave Finance? Your navigation history will stay local to this device.';

export const ONBOARDING_PATH = '/onboarding';
export const SIGNED_OUT_HOME_PATH = '/login';
export const SIGNED_IN_HOME_PATH = '/dashboard';

/**
 * The action a back-navigation that reaches the app-shell exit anchor should take.
 *
 * - `redirect`: keep the visitor in the app and route to `to` (used for onboarding).
 * - `prompt`: confirm before leaving because unsaved edits would be lost.
 * - `exit`: allow the browser back navigation to leave the app shell.
 */
export type BackNavigationDecision =
  | { kind: 'redirect'; to: string }
  | { kind: 'prompt' }
  | { kind: 'exit' };

/** True when `pathname` is the onboarding flow (exact match or sub-route). */
export function isOnboardingPath(pathname: string): boolean {
  return pathname === ONBOARDING_PATH || pathname.startsWith(`${ONBOARDING_PATH}/`);
}

/**
 * Decide what a back press should do when it reaches the app-shell exit anchor.
 *
 * Onboarding has no in-app back target, so back should route into the app
 * (`/dashboard` when signed in, `/login` otherwise) instead of prompting to
 * leave (#3106). Everywhere else, only prompt on a genuine exit when there are
 * unsaved changes; with nothing to lose, the back press is allowed through.
 */
export function resolveBackNavigation(options: {
  pathname: string;
  isAuthenticated: boolean;
  hasActiveGuards: boolean;
}): BackNavigationDecision {
  if (isOnboardingPath(options.pathname)) {
    return {
      kind: 'redirect',
      to: options.isAuthenticated ? SIGNED_IN_HOME_PATH : SIGNED_OUT_HOME_PATH,
    };
  }

  return options.hasActiveGuards ? { kind: 'prompt' } : { kind: 'exit' };
}

export const NAVIGATION_HISTORY_LIMIT = 12;
export const BREADCRUMB_HISTORY_LIMIT = 4;
export const MAX_NAVIGATION_SHORTCUTS = 9;

export const STABILITY_RULES: readonly StabilityRule[] = Object.freeze([
  {
    id: 'unsaved-changes',
    label: 'Unsaved changes guard',
    description: 'Prompt before leaving local edits behind.',
    localFirst: true,
  },
  {
    id: 'consistent-nav-order',
    label: 'Consistent navigation ordering',
    description: 'Keep sidebar and tab destinations in a fixed, stable order.',
    localFirst: true,
  },
  {
    id: 'back-button-safety',
    label: 'Back button safety',
    description: 'Confirm before browser back exits the app shell.',
    localFirst: true,
  },
  {
    id: 'deep-link-preservation',
    label: 'Deep link preservation',
    description: 'Restore scroll and route context on back and forward navigation.',
    localFirst: true,
  },
  {
    id: 'navigation-shortcuts',
    label: 'Navigation shortcuts',
    description: 'Use stable Ctrl+1-9 shortcuts that follow the nav order.',
    localFirst: true,
  },
  {
    id: 'breadcrumb-trail',
    label: 'Breadcrumb trail',
    description: 'Surface recent in-app navigation for fast backtracking.',
    localFirst: true,
  },
]);

export function getActiveGuardMessage(
  guards: readonly NavigationGuardRegistration[],
  fallbackMessage = DEFAULT_UNSAVED_CHANGES_MESSAGE,
): string {
  return guards.find((guard) => guard.when)?.message ?? fallbackMessage;
}

export function ensureStableNavOrder<T extends StableNavItem>(items: readonly T[]): readonly T[] {
  return Object.freeze(items.slice());
}

export function buildNavigationShortcuts(
  items: readonly StableNavItem[],
): readonly NavigationShortcut[] {
  return ensureStableNavOrder(items)
    .slice(0, MAX_NAVIGATION_SHORTCUTS)
    .map((item, index) => {
      const digit = index + 1;
      return {
        key: `Ctrl+${digit}`,
        digit,
        label: item.label,
        path: item.href,
        ariaKeyShortcuts: `Control+${digit}`,
      };
    });
}

export function isEditableTarget(target: EventTarget | null): target is HTMLElement {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
  );
}
