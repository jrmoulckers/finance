// SPDX-License-Identifier: BUSL-1.1

import type { FC } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppLayout } from './components/layout';
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
  '/settings': 'Settings',
};

/** Routes that are wrapped in AppLayout (authenticated main app pages). */
const AUTHENTICATED_ROUTES = new Set([
  '/dashboard',
  '/accounts',
  '/transactions',
  '/budgets',
  '/goals',
  '/insights',
  '/settings',
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

  return isStandalonePage ? (
    <AppRoutes />
  ) : (
    <AppLayout activePath={activePath} onNavigate={(path) => navigate(path)} pageTitle={pageTitle}>
      <AppRoutes />
    </AppLayout>
  );
};
