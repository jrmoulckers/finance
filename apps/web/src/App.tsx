// SPDX-License-Identifier: BUSL-1.1

import type { FC } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppLayout } from './components/layout';
import { ConsentDialog } from './components/gdpr';
import { PrivacyModeProvider } from './contexts/PrivacyModeContext';
import { useRouteAnnouncer } from './hooks/useRouteAnnouncer';
import { AppRoutes } from './routes';

/**
 * Map path segments to human-readable page titles.
 *
 * Used by the AppLayout header. Dynamic / detail routes fall back to a
 * sensible default derived from the path's first segment.
 */
const PAGE_TITLES: Record<string, string> = {
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
  '/import/receipt-ocr': 'Receipt OCR',
  '/privacy-dashboard': 'Privacy Dashboard',
  '/categories': 'Categories',
  '/planning': 'Financial Planning',
  '/cash-flow': 'Cash Flow',
  '/net-worth': 'Net Worth',
  '/subscriptions': 'Subscriptions',
  '/bank-connections': 'Bank Connections',
};

/**
 * Routes that render WITHOUT the AppLayout shell (pre-auth + full-screen flows).
 *
 * This is an explicit denylist so that any newly added authenticated route gets
 * the nav shell by default — see #1977 for the regression that motivated the
 * inversion. If you add a new full-screen / pre-auth route, add it here.
 *
 * Matching is exact OR prefix (`prefix + '/'`), so `/reset-password/<token>`
 * also matches `/reset-password`.
 */
const STANDALONE_ROUTES: readonly string[] = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/onboarding',
];

function isStandalonePath(pathname: string): boolean {
  return STANDALONE_ROUTES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function derivePageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) {
    return PAGE_TITLES[pathname];
  }
  // /accounts/<id> -> "Accounts"; /transactions/<id>/edit -> "Transactions"
  const firstSegment = `/${pathname.split('/').filter(Boolean)[0] ?? ''}`;
  return PAGE_TITLES[firstSegment] ?? 'Finance';
}

/**
 * Root application component.
 *
 * Wraps authenticated routes in the AppLayout shell which provides sidebar
 * navigation on desktop and bottom navigation on mobile.
 *
 * Pre-authentication routes (login, signup, forgot/reset-password, onboarding)
 * render standalone without layout — see `STANDALONE_ROUTES` above.
 */
export const App: FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const activePath = location.pathname === '/' ? '/' : location.pathname;
  const pageTitle = derivePageTitle(activePath);
  const isStandalonePage = isStandalonePath(activePath);

  // Announce route transitions to screen readers (#1684)
  useRouteAnnouncer();

  return isStandalonePage ? (
    <PrivacyModeProvider>
      <ConsentDialog />
      <AppRoutes />
    </PrivacyModeProvider>
  ) : (
    <PrivacyModeProvider>
      <ConsentDialog />
      <AppLayout
        activePath={activePath}
        onNavigate={(path) => navigate(path)}
        pageTitle={pageTitle}
      >
        <AppRoutes />
      </AppLayout>
    </PrivacyModeProvider>
  );
};
