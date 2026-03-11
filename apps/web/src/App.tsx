// SPDX-License-Identifier: BUSL-1.1

import type { FC } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AppLayout } from "./components/layout";
import { AppRoutes } from "./routes";

/** Map path segments to human-readable page titles. */
const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/dashboard": "Dashboard",
  "/accounts": "Accounts",
  "/transactions": "Transactions",
  "/budgets": "Budgets",
  "/goals": "Goals",
  "/settings": "Settings",
};

/**
 * Root application component.
 *
 * Wraps routes in the AppLayout shell which provides sidebar
 * navigation on desktop and bottom navigation on mobile.
 */
export const App: FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const activePath = location.pathname === "/" ? "/" : location.pathname;
  const pageTitle = PAGE_TITLES[activePath] ?? "Finance";

  return (
    <AppLayout
      activePath={activePath}
      onNavigate={(path) => navigate(path)}
      pageTitle={pageTitle}
    >
      <AppRoutes />
    </AppLayout>
  );
};