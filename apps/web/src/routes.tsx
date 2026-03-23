// SPDX-License-Identifier: BUSL-1.1

import { lazy, Suspense, useCallback } from 'react';
import type { FC, ReactNode } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';

import { ProtectedRoute, useAuth } from './auth/auth-context';

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
const Recurring = lazy(() => import('./pages/RecurringPage'));
const Settings = lazy(() => import('./pages/SettingsPage'));
const Login = lazy(() => import('./pages/LoginPage'));
const Signup = lazy(() => import('./pages/SignupPage'));
const Onboarding = lazy(() => import('./pages/OnboardingPage'));
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

interface AuthenticatedRouteProps {
  children: ReactNode;
}

const AuthenticatedRoute: FC<AuthenticatedRouteProps> = ({ children }) => {
  const navigate = useNavigate();
  const handleUnauthenticated = useCallback(() => {
    navigate('/login', { replace: true });
  }, [navigate]);

  return (
    <ProtectedRoute fallback={<PageLoader />} onUnauthenticated={handleUnauthenticated}>
      {children}
    </ProtectedRoute>
  );
};

const RootRedirect: FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  if (isAuthenticated && localStorage.getItem('finance-onboarding-complete') !== 'true') {
    return <Navigate to="/onboarding" replace />;
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
    <Route
      path="/onboarding"
      element={
        <AuthenticatedRoute>
          <Suspense fallback={<PageLoader />}>
            <Onboarding />
          </Suspense>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/dashboard"
      element={
        <AuthenticatedRoute>
          <Suspense fallback={<PageLoader />}>
            <Dashboard />
          </Suspense>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/accounts"
      element={
        <AuthenticatedRoute>
          <Suspense fallback={<PageLoader />}>
            <Accounts />
          </Suspense>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/accounts/:id"
      element={
        <AuthenticatedRoute>
          <Suspense fallback={<PageLoader />}>
            <AccountDetail />
          </Suspense>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/transactions"
      element={
        <AuthenticatedRoute>
          <Suspense fallback={<PageLoader />}>
            <Transactions />
          </Suspense>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/transactions/:id"
      element={
        <AuthenticatedRoute>
          <Suspense fallback={<PageLoader />}>
            <TransactionDetail />
          </Suspense>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/budgets"
      element={
        <AuthenticatedRoute>
          <Suspense fallback={<PageLoader />}>
            <Budgets />
          </Suspense>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/budgets/:id"
      element={
        <AuthenticatedRoute>
          <Suspense fallback={<PageLoader />}>
            <BudgetDetail />
          </Suspense>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/goals"
      element={
        <AuthenticatedRoute>
          <Suspense fallback={<PageLoader />}>
            <Goals />
          </Suspense>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/goals/:id"
      element={
        <AuthenticatedRoute>
          <Suspense fallback={<PageLoader />}>
            <GoalDetail />
          </Suspense>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/import"
      element={
        <AuthenticatedRoute>
          <Suspense fallback={<PageLoader />}>
            <Import />
          </Suspense>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/recurring"
      element={
        <AuthenticatedRoute>
          <Suspense fallback={<PageLoader />}>
            <Recurring />
          </Suspense>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/settings"
      element={
        <AuthenticatedRoute>
          <Suspense fallback={<PageLoader />}>
            <Settings />
          </Suspense>
        </AuthenticatedRoute>
      }
    />
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
