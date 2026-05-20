// SPDX-License-Identifier: BUSL-1.1

/**
 * Hook that announces route transitions to screen readers.
 *
 * Listens for pathname changes and announces the new page title
 * via the global live region. This ensures screen reader users
 * are informed of navigation events in single-page applications
 * where the browser does not trigger a native page load.
 *
 * @module hooks/useRouteAnnouncer
 * @see components/layout/FocusManager.tsx — complementary focus management
 *
 * References: issue #1684
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { announce } from '../accessibility/aria';

/** Map of path segments to human-readable titles. */
const ROUTE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  '/accounts': 'Accounts',
  '/transactions': 'Transactions',
  '/budgets': 'Budgets',
  '/goals': 'Goals',
  '/insights': 'Insights',
  '/household': 'Household',
  '/investments': 'Investments',
  '/bills': 'Bills',
  '/report-builder': 'Report Builder',
  '/achievements': 'Achievements',
  '/watchlists': 'Watchlists',
  '/settings': 'Settings',
  '/import': 'Import',
  '/import/wizard': 'Import Wizard',
  '/login': 'Login',
  '/signup': 'Sign Up',
};

/**
 * Resolve a pathname to a human-readable page title.
 *
 * For detail pages like `/accounts/abc-123`, extracts the base path
 * and appends "Detail" (e.g., "Account Detail").
 */
function resolveTitle(pathname: string): string {
  // Exact match
  if (ROUTE_TITLES[pathname]) {
    return ROUTE_TITLES[pathname];
  }

  // Detail page pattern: /entity/:id
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length >= 2) {
    const basePath = `/${segments[0]}`;
    const baseTitle = ROUTE_TITLES[basePath];
    if (baseTitle) {
      // Singularize the title for detail pages
      const singular = baseTitle.endsWith('s') ? baseTitle.slice(0, -1) : baseTitle;
      return `${singular} Detail`;
    }
  }

  return 'Page';
}

/**
 * Announces route transitions to screen readers.
 *
 * On each pathname change (except the initial render), announces
 * "Navigated to <page title>" via a polite live region. This
 * complements the FocusManager component which handles focus
 * movement to the main content area.
 *
 * @example
 * ```tsx
 * // In App.tsx or a layout wrapper
 * useRouteAnnouncer();
 * ```
 */
export function useRouteAnnouncer(): void {
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const title = resolveTitle(pathname);
    // Small delay to allow DOM updates before announcing
    const timer = window.setTimeout(() => {
      announce(`Navigated to ${title}`);
    }, 150);

    return () => window.clearTimeout(timer);
  }, [pathname]);
}
