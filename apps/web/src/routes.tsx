// SPDX-License-Identifier: BUSL-1.1

import { lazy, Suspense, useCallback } from 'react';
import type { FC } from 'react';
import { Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';

import { ProtectedRoute, useAuth } from './auth/auth-context';
import { DatabaseProvider } from './db/DatabaseProvider';

/*
 * Lazy-loaded route pages - each is code-split into its own chunk.
 * These mirror the mobile app navigation structure.
 */
const Dashboard = lazy(() => import('./pages/DashboardPage'));
const Accounts = lazy(() => import('./pages/AccountsPage'));
const AccountDetail = lazy(() => import('./pages/AccountDetailPage'));
const Transactions = lazy(() => import('./pages/TransactionsPage'));
const TransactionDetail = lazy(() => import('./pages/TransactionDetailPage'));
const Budgets = lazy(() => import('./pages/BudgetsPage'));
const BudgetDetail = lazy(() => import('./pages/BudgetDetailPage'));
const Goals = lazy(() => import('./pages/GoalsPage'));
const GoalDetail = lazy(() => import('./pages/GoalDetailPage'));
const Import = lazy(() => import('./pages/ImportPage'));
const Settings = lazy(() => import('./pages/SettingsPage'));
const Login = lazy(() => import('./pages/LoginPage'));
const Signup = lazy(() => import('./pages/SignupPage'));
const NotFound = lazy(() => import('./pages/NotFoundPage'));

/**
 * Loading fallback shown while a lazy route chunk is being fetched.
 * Uses a semantic element and ARIA live region so screen readers
 * announce the loading state.
 */
const PageLoader: FC = () => (
  <div role="status" aria-live="polite" aria-label="Loading page">
    <p>Loading...</p>
  </div>
);

/**
 * Layout route for authenticated pages.
 *
 * Combines authentication gating with DatabaseProvider so that:
 * - Pre-auth routes (login, signup) render immediately without WASM init
 * - Database initialization only starts once the user is authenticated
 * - A single DatabaseProvider instance is shared across all child routes
 */
const AuthenticatedLayout: FC = () => {
  const navigate = useNavigate();
  const handleUnauthenticated = useCallback(() => {
    navigate('/login', { replace: true });
  }, [navigate]);

  return (
    <ProtectedRoute fallback={<PageLoader />} onUnauthenticated={handleUnauthenticated}>
      <DatabaseProvider>
        <Outlet />
      </DatabaseProvider>
    </ProtectedRoute>
  );
};

const RootRedirect: FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
};

/**
 * Application route definitions.
 *
 * Route structure mirrors the mobile app tabs:
 *   /dashboard, /accounts, /transactions, /budgets, /goals, /settings
 *
 * Pre-auth routes (login, signup) are rendered WITHOUT AppLayout.
 */
export const AppRoutes: FC = () => (
  <Routes>
    <Route path="/" element={<RootRedirect />} />
    <Route
      path="/login"
      element={
        <Suspense fallback={<PageLoader />}>
          <Login />
        </Suspense>
      }
    />
    <Route
      path="/signup"
      element={
        <Suspense fallback={<PageLoader />}>
          <Signup />
        </Suspense>
      }
    />

    {/* Authenticated routes — wrapped in AuthenticatedLayout which provides
        both auth gating and DatabaseProvider (SQLite-WASM). */}
    <Route element={<AuthenticatedLayout />}>
      <Route
        path="/dashboard"
        element={
          <Suspense fallback={<PageLoader />}>
            <Dashboard />
          </Suspense>
        }
      />
      <Route
        path="/accounts"
        element={
          <Suspense fallback={<PageLoader />}>
            <Accounts />
          </Suspense>
        }
      />
      <Route
        path="/accounts/:id"
        element={
          <Suspense fallback={<PageLoader />}>
            <AccountDetail />
          </Suspense>
        }
      />
      <Route
        path="/transactions"
        element={
          <Suspense fallback={<PageLoader />}>
            <Transactions />
          </Suspense>
        }
      />
      <Route
        path="/transactions/:id"
        element={
          <Suspense fallback={<PageLoader />}>
            <TransactionDetail />
          </Suspense>
        }
      />
      <Route
        path="/budgets"
        element={
          <Suspense fallback={<PageLoader />}>
            <Budgets />
          </Suspense>
        }
      />
      <Route
        path="/budgets/:id"
        element={
          <Suspense fallback={<PageLoader />}>
            <BudgetDetail />
          </Suspense>
        }
      />
      <Route
        path="/goals"
        element={
          <Suspense fallback={<PageLoader />}>
            <Goals />
          </Suspense>
        }
      />
      <Route
        path="/goals/:id"
        element={
          <Suspense fallback={<PageLoader />}>
            <GoalDetail />
          </Suspense>
        }
      />
      <Route
        path="/import"
        element={
          <Suspense fallback={<PageLoader />}>
            <Import />
          </Suspense>
        }
      />
      <Route
        path="/settings"
        element={
          <Suspense fallback={<PageLoader />}>
            <Settings />
          </Suspense>
        }
      />
    </Route>

    <Route
      path="*"
      element={
        <Suspense fallback={<PageLoader />}>
          <NotFound />
        </Suspense>
      }
    />
  </Routes>
);
