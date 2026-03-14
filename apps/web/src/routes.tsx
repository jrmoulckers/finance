// SPDX-License-Identifier: BUSL-1.1

import { lazy, Suspense } from "react";
import type { FC } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

/*
 * Lazy-loaded route pages - each is code-split into its own chunk.
 * These mirror the mobile app navigation structure.
 */
const Dashboard = lazy(() => import("./pages/DashboardPage"));
const Accounts = lazy(() => import("./pages/AccountsPage"));
const Transactions = lazy(() => import("./pages/TransactionsPage"));
const Budgets = lazy(() => import("./pages/BudgetsPage"));
const Goals = lazy(() => import("./pages/GoalsPage"));
const Settings = lazy(() => import("./pages/SettingsPage"));

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
 * Application route definitions.
 *
 * Route structure mirrors the mobile app tabs:
 *   /dashboard, /accounts, /transactions, /budgets, /goals, /settings
 */
export const AppRoutes: FC = () => (
  <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/accounts" element={<Accounts />} />
      <Route path="/transactions" element={<Transactions />} />
      <Route path="/budgets" element={<Budgets />} />
      <Route path="/goals" element={<Goals />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  </Suspense>
);