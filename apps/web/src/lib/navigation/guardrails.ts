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
