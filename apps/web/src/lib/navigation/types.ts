// SPDX-License-Identifier: BUSL-1.1

export type NavigationRuleId =
  | 'unsaved-changes'
  | 'consistent-nav-order'
  | 'back-button-safety'
  | 'deep-link-preservation'
  | 'navigation-shortcuts'
  | 'breadcrumb-trail';

export interface StabilityRule {
  id: NavigationRuleId;
  label: string;
  description: string;
  localFirst: boolean;
}

export interface NavigationGuardRegistration {
  id: string;
  when: boolean;
  message: string;
}

export interface UseNavigationGuardOptions {
  when: boolean;
  message?: string;
}

export interface NavigationBreadcrumbEntry {
  path: string;
  title: string;
  key: string;
  visitedAt: number;
}

export interface NavigationHistoryState {
  version: 1;
  trail: NavigationBreadcrumbEntry[];
  visitCounts: Record<string, number>;
  scrollPositions: Record<string, { x: number; y: number }>;
}

export interface NavigationShortcut {
  key: string;
  digit: number;
  label: string;
  path: string;
  ariaKeyShortcuts: string;
}

export interface StableNavItem {
  id: string;
  label: string;
  href: string;
}

export interface NavigationGuardContextValue {
  setGuard: (guard: NavigationGuardRegistration) => void;
  removeGuard: (id: string) => void;
  hasActiveGuards: boolean;
  confirmActiveNavigation: (fallbackMessage?: string) => boolean;
}
