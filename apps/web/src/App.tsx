// SPDX-License-Identifier: BUSL-1.1

import type { FC } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppLayout } from './components/layout';
import { ConsentDialog } from './components/gdpr';
import { PrivacyModeProvider } from './contexts/PrivacyModeContext';
import { useRouteAnnouncer } from './hooks/useRouteAnnouncer';
import { AppRoutes } from './routes';

/** Map path segments to human-readable page titles. */
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
};

/** Routes that are wrapped in AppLayout (authenticated main app pages). */
const AUTHENTICATED_ROUTES = new Set([
  '/',
  '/dashboard',
  '/accounts',
  '/transactions',
  '/budgets',
  '/goals',
  '/insights',
  '/household',
  '/investments',
  '/bills',
  '/report-builder',
  '/achievements',
  '/watchlists',
  '/settings',
  '/import',
  '/import/wizard',
  '/import/receipt-ocr',
  '/privacy-dashboard',
]);

/**
 * Root application component.
 *
 * Wraps authenticated routes in the AppLayout shell which provides sidebar
 * navigation on desktop and bottom navigation on mobile.
 *
 * Pre-authentication routes (login, signup) render standalone without layout.
 */
export const App: FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const activePath = location.pathname === '/' ? '/' : location.pathname;
  const pageTitle = PAGE_TITLES[activePath] ?? 'Finance';
  const isStandalonePage = !AUTHENTICATED_ROUTES.has(activePath);

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
