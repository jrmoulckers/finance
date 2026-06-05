// SPDX-License-Identifier: BUSL-1.1

import { lazy, Suspense, useCallback } from 'react';
import type { FC, ReactNode } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';

import { ProtectedRoute, useAuth } from './auth/auth-context';
import { RouteErrorBoundary } from './components/common';
import './styles/route-loader.css';

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
const Categories = lazy(() => import('./pages/CategoriesPage'));
const Goals = lazy(() => import('./pages/GoalsPage'));
const GoalDetail = lazy(() => import('./pages/GoalDetailPage'));
const Import = lazy(() => import('./pages/ImportPage'));
const Insights = lazy(() => import('./pages/InsightsPage'));
const Achievements = lazy(() => import('./pages/AchievementsPage'));
const Settings = lazy(() => import('./pages/SettingsPage'));
const SettingsAccount = lazy(() => import('./pages/settings/SettingsAccountPage'));
const SettingsPreferences = lazy(() => import('./pages/settings/SettingsPreferencesPage'));
const SettingsPrivacy = lazy(() => import('./pages/settings/SettingsPrivacyPage'));
const SettingsSync = lazy(() => import('./pages/settings/SettingsSyncPage'));
const SettingsAdvanced = lazy(() => import('./pages/settings/SettingsAdvancedPage'));
const DataImportWizard = lazy(() => import('./pages/DataImportWizardPage'));
const ReceiptOcr = lazy(() => import('./pages/ReceiptOcrPage'));
const Login = lazy(() => import('./pages/LoginPage'));
const Signup = lazy(() => import('./pages/SignupPage'));
const ForgotPassword = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPassword = lazy(() => import('./pages/ResetPasswordPage'));
const NotFound = lazy(() => import('./pages/NotFoundPage'));
const Watchlists = lazy(() => import('./pages/WatchlistsPage'));
const Household = lazy(() => import('./pages/HouseholdPage'));
const ReportBuilder = lazy(() => import('./pages/ReportBuilderPage'));
const Investments = lazy(() => import('./pages/InvestmentsPage'));
const InvestmentDetail = lazy(() => import('./pages/InvestmentDetailPage'));
const Bills = lazy(() => import('./pages/BillsPage'));
const BillDetail = lazy(() => import('./pages/BillDetailPage'));
const CreateBill = lazy(() => import('./pages/CreateBillPage'));
const Planning = lazy(() => import('./pages/PlanningPage'));
const PrivacyDashboard = lazy(() => import('./pages/PrivacyDashboardPage'));
const Onboarding = lazy(() => import('./pages/OnboardingPage'));
const CashFlow = lazy(() => import('./pages/CashFlowPage'));
const NetWorth = lazy(() => import('./pages/NetWorthPage'));
const Subscriptions = lazy(() => import('./pages/SubscriptionsPage'));
const BankConnections = lazy(() => import('./pages/BankConnectionsPage'));

/**
 * Loading fallback shown while a lazy route chunk is being fetched.
 * Renders a shimmer skeleton layout matching the app shell structure.
 * Uses CSS-only animations (no JS deps) and ARIA live region for
 * screen reader announcements.
 */
const PageLoader: FC = () => (
  <div
    className="route-loader"
    role="status"
    aria-live="polite"
    aria-label="Loading page"
    aria-busy="true"
  >
    <div className="route-loader__header" />
    <div className="route-loader__content">
      <div className="route-loader__line route-loader__line--wide" />
      <div className="route-loader__line route-loader__line--medium" />
      <div className="route-loader__line route-loader__line--narrow" />
      <div className="route-loader__block" />
      <div className="route-loader__line route-loader__line--wide" />
      <div className="route-loader__line route-loader__line--medium" />
    </div>
  </div>
);

/**
 * Wraps a lazy-loaded page in Suspense and a RouteErrorBoundary.
 *
 * This ensures each route is independently isolated — a crash in one
 * page does not take down the entire app or other routes.
 */
const RouteBoundary: FC<{ name: string; children: ReactNode }> = ({ name, children }) => (
  <RouteErrorBoundary routeName={name}>
    <Suspense fallback={<PageLoader />}>{children}</Suspense>
  </RouteErrorBoundary>
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

  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
};

/**
 * Redirects authenticated users away from public-only routes (login, signup).
 * If the user is already logged in, they are sent to the dashboard.
 */
const RedirectIfAuthenticated: FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
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
        <RedirectIfAuthenticated>
          <RouteBoundary name="Login">
            <Login />
          </RouteBoundary>
        </RedirectIfAuthenticated>
      }
    />
    <Route
      path="/signup"
      element={
        <RedirectIfAuthenticated>
          <RouteBoundary name="Sign Up">
            <Signup />
          </RouteBoundary>
        </RedirectIfAuthenticated>
      }
    />
    <Route
      path="/forgot-password"
      element={
        <RedirectIfAuthenticated>
          <RouteBoundary name="Forgot Password">
            <ForgotPassword />
          </RouteBoundary>
        </RedirectIfAuthenticated>
      }
    />
    <Route
      path="/reset-password"
      element={
        <RouteBoundary name="Reset Password">
          <ResetPassword />
        </RouteBoundary>
      }
    />

    <Route
      path="/dashboard"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Dashboard">
            <Dashboard />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/accounts"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Accounts">
            <Accounts />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/accounts/:id"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Account Detail">
            <AccountDetail />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/transactions"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Transactions">
            <Transactions />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/transactions/:id"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Transaction Detail">
            <TransactionDetail />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/transactions/:id/edit"
      element={
        <AuthenticatedRoute>
          <Navigate to="/transactions" replace />
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/budgets"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Budgets">
            <Budgets />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/budgets/:id"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Budget Detail">
            <BudgetDetail />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/categories"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Categories">
            <Categories />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/goals"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Goals">
            <Goals />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/goals/:id"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Goal Detail">
            <GoalDetail />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/import"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Import">
            <Import />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/insights"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Insights">
            <Insights />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/household"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Household">
            <Household />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/report-builder"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Report Builder">
            <ReportBuilder />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/achievements"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Achievements">
            <Achievements />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/settings"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Settings">
            <Settings />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    >
      <Route index element={<Navigate to="account" replace />} />
      <Route
        path="account"
        element={
          <RouteBoundary name="Settings · Account">
            <SettingsAccount />
          </RouteBoundary>
        }
      />
      <Route
        path="preferences"
        element={
          <RouteBoundary name="Settings · Preferences">
            <SettingsPreferences />
          </RouteBoundary>
        }
      />
      <Route
        path="privacy"
        element={
          <RouteBoundary name="Settings · Privacy">
            <SettingsPrivacy />
          </RouteBoundary>
        }
      />
      <Route
        path="sync"
        element={
          <RouteBoundary name="Settings · Sync">
            <SettingsSync />
          </RouteBoundary>
        }
      />
      <Route
        path="advanced"
        element={
          <RouteBoundary name="Settings · Advanced">
            <SettingsAdvanced />
          </RouteBoundary>
        }
      />
    </Route>
    <Route
      path="/watchlists"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Watchlists">
            <Watchlists />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/investments"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Investments">
            <Investments />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/investments/:id"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Investment Detail">
            <InvestmentDetail />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/bills"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Bills">
            <Bills />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/bills/new"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Create Bill">
            <CreateBill />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/bills/:id"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Bill Detail">
            <BillDetail />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/planning"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Planning">
            <Planning />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/cash-flow"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Cash Flow">
            <CashFlow />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/net-worth"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Net Worth">
            <NetWorth />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/subscriptions"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Subscriptions">
            <Subscriptions />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />

    <Route
      path="/import/wizard"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Data Import Wizard">
            <DataImportWizard />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/import/receipt-ocr"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Receipt OCR">
            <ReceiptOcr />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/privacy-dashboard"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Privacy Dashboard">
            <PrivacyDashboard />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/bank-connections"
      element={
        <AuthenticatedRoute>
          <RouteBoundary name="Bank Connections">
            <BankConnections />
          </RouteBoundary>
        </AuthenticatedRoute>
      }
    />
    <Route
      path="/onboarding"
      element={
        <RouteBoundary name="Onboarding">
          <Onboarding />
        </RouteBoundary>
      }
    />

    <Route
      path="*"
      element={
        <RouteBoundary name="Page">
          <NotFound />
        </RouteBoundary>
      }
    />
  </Routes>
);
