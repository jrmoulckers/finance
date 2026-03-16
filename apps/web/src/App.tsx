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
  '/settings': 'Settings',
};

/** Routes that should render WITHOUT AppLayout (pre-auth pages). */
const STANDALONE_ROUTES = ['/login', '/signup'];

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
  const isStandalonePage = STANDALONE_ROUTES.includes(activePath);

  if (isStandalonePage) {
    // Render pre-auth pages without AppLayout
    return <AppRoutes />;
  }

  return (
    <AppLayout activePath={activePath} onNavigate={(path) => navigate(path)} pageTitle={pageTitle}>
      <AppRoutes />
    </AppLayout>
  );
};
